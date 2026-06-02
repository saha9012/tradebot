const { evaluate } = require('../strategy/strategyEngine');
const { get, run, logAudit, all } = require('../db/database');
const { mergeStrategyConfig } = require('../strategy/defaults');
const { formatSkipReason } = require('../util/auditMessages');
const { MarketScanner } = require('../market/marketScanner');
const { MarketExecutor } = require('../market/marketExecutor');
const { InventorySeller } = require('../market/inventorySeller');
const { PriceFetcher } = require('../providers/steam/priceFetcher');
const { RateLimiter } = require('../jobs/rateLimiter');
const { rateLimitMinMs, rateLimitJitterMs, scanTickMs, sellTickMs } = require('../config');
const { RelistScheduler } = require('../jobs/relistScheduler');

class BotEngine {
  constructor(db, accountPool) {
    this.db = db;
    this.accountPool = accountPool;
    this.rateLimiter = new RateLimiter({
      minDelayMs: rateLimitMinMs,
      jitterMs: rateLimitJitterMs,
    });
    this.priceFetcher = new PriceFetcher(db, this.rateLimiter);
    this.marketScanner = new MarketScanner(this.priceFetcher, db);
    this.marketExecutor = new MarketExecutor(db, accountPool, this.rateLimiter);
    this.inventorySeller = new InventorySeller(accountPool, this.priceFetcher, this.marketExecutor);
    this.relistScheduler = new RelistScheduler(this);
    this.scanInterval = null;
    this.sellInterval = null;
    this.emergencyStop = false;
    this.lastSkipLog = new Map();
    this.scanTickBusy = false;
    this.sellTickBusy = false;
    this.lastRateLimitLog = 0;
  }

  shouldLogSkip(accountId) {
    const now = Date.now();
    const last = this.lastSkipLog.get(accountId) || 0;
    if (now - last < 15 * 60 * 1000) return false;
    this.lastSkipLog.set(accountId, now);
    return true;
  }

  async getState(key) {
    const row = await get(this.db, 'SELECT value FROM bot_state WHERE key = ?', [key]);
    return row?.value === 'true';
  }

  async setState(key, value) {
    await run(this.db, 'INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)', [
      key,
      value ? 'true' : 'false',
    ]);
  }

  async isScanRunning() {
    if (this.emergencyStop) return false;
    return this.getState('running_scan');
  }

  async isSellRunning() {
    if (this.emergencyStop) return false;
    return this.getState('running_sell');
  }

  /** @deprecated используй isScanRunning */
  async isRunning() {
    return this.isScanRunning();
  }

  async getEnabledAccounts() {
    return all(this.db, `SELECT a.*, s.config_json FROM accounts a
      JOIN strategy_config s ON s.account_id = a.id
      WHERE a.enabled = 1`);
  }

  async startScan() {
    this.emergencyStop = false;
    await this.setState('running_scan', true);
    await this.setState('running', true);
    if (this.scanInterval) clearInterval(this.scanInterval);
    this.relistScheduler.start();
    this.scanInterval = setInterval(() => this.tickScan().catch(console.error), scanTickMs);
    await this.tickScan();
    return { runningScan: true };
  }

  async stopScan() {
    await this.setState('running_scan', false);
    await this.setState('running', false);
    this.relistScheduler.stop();
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    return { runningScan: false };
  }

  async startSell() {
    this.emergencyStop = false;
    await this.setState('running_sell', true);
    if (this.sellInterval) clearInterval(this.sellInterval);
    this.sellInterval = setInterval(() => this.tickSell().catch(console.error), sellTickMs);
    await this.tickSell();
    return { runningSell: true };
  }

  async stopSell() {
    await this.setState('running_sell', false);
    if (this.sellInterval) {
      clearInterval(this.sellInterval);
      this.sellInterval = null;
    }
    return { runningSell: false };
  }

  /** Старый API: только поиск/покупка */
  async start() {
    return this.startScan();
  }

  async stop() {
    await this.stopScan();
    await this.stopSell();
    return { runningScan: false, runningSell: false };
  }

  async emergencyStopAll() {
    this.emergencyStop = true;
    await this.stopScan();
    await this.stopSell();
    await logAudit(this.db, { action: 'emergency_stop', message: 'Аварийная остановка всех режимов' });
    return { runningScan: false, runningSell: false, emergency: true };
  }

  async tickScan() {
    if (!(await this.isScanRunning())) return;
    if (this.scanTickBusy) return;

    if (this.rateLimiter.isPaused()) {
      const now = Date.now();
      if (now - this.lastRateLimitLog > 60_000) {
        this.lastRateLimitLog = now;
        await logAudit(this.db, {
          level: 'warn',
          action: 'rate_limit_pause',
          message: 'Поиск: пауза из‑за лимита Steam (429), повтор через несколько минут',
        });
      }
      return;
    }

    this.scanTickBusy = true;
    try {
      const accounts = await this.getEnabledAccounts();

      for (const acc of accounts) {
      const config = mergeStrategyConfig(acc.game, JSON.parse(acc.config_json));
      if (!config.enabled) continue;

      const wallet = acc.wallet_balance ?? 0;
      if (acc.game === 'dota' && wallet >= config.balanceThreshold) {
        await logAudit(this.db, {
          accountId: acc.id,
          action: 'balance_threshold',
          message: `Баланс ${wallet} ₽ ≥ порога ${config.balanceThreshold} ₽ — поиск отдыхает`,
        });
        continue;
      }

      try {
        await this.processAccountScan(acc, config);
      } catch (err) {
        console.error('[tickScan]', acc.id, err.message);
        await logAudit(this.db, {
          accountId: acc.id,
          level: 'error',
          action: 'scan_tick_error',
          message: err.message,
        });
      }
      }
    } finally {
      this.scanTickBusy = false;
    }
  }

  async tickSell() {
    if (!(await this.isSellRunning())) return;
    if (this.sellTickBusy) return;
    if (this.rateLimiter.isPaused()) return;

    this.sellTickBusy = true;
    const accounts = await this.getEnabledAccounts();

    try {
      for (const acc of accounts) {
        const config = mergeStrategyConfig(acc.game, JSON.parse(acc.config_json));
        if (!config.enabled) continue;
        await this.processAccountSell(acc, config);
      }
    } finally {
      this.sellTickBusy = false;
    }
  }

  async processAccountScan(account, config) {
    const session = this.accountPool.getSession(account.id);

    if (!session) {
      if (!this.shouldLogSkip(account.id)) return;
      await logAudit(this.db, {
        accountId: account.id,
        action: 'tick_skip',
        message:
          'Поиск: нет активной сессии Steam. После перезапуска сервера нажмите «Войти в Steam» снова (статус «готов» в UI ≠ вход)',
      });
      return;
    }

    try {
      const { wallet } = await this.accountPool.refreshWallet(account.id);
      account.wallet_balance = wallet;
    } catch {
      /* optional */
    }

    const scanLimit = Math.min(
      config.maxBuyOrders ?? 10,
      config.scanItemsPerTick ?? 5
    );

    const { items, error, meta } = await this.marketScanner.scanAccount(
      session,
      account.id,
      account.game,
      config,
      { maxItems: scanLimit }
    );

    if (error) {
      await logAudit(this.db, {
        accountId: account.id,
        level: 'warn',
        action: 'scan_error',
        message: error,
        meta,
      });
      return;
    }

    if (!items.length) {
      await logAudit(this.db, {
        accountId: account.id,
        action: 'scan_empty',
        message: 'Поиск: нет подходящих предметов',
        meta,
      });
      return;
    }

    await logAudit(this.db, {
      accountId: account.id,
      action: 'scan_cycle',
      message: meta?.label
        ? `Поиск: ${meta.label} → ${meta.nextLabel || '—'}. Лотов: ${items.length}`
        : `Поиск: просмотрено ${items.length} лотов`,
      meta,
    });

    let buyCount = 0;
    for (const item of items) {
      if (buyCount >= (config.maxBuyOrders ?? 10)) break;
      const decision = evaluate(account.game, config, item);
      await this.handleDecision(account, config, item, decision);
      if (decision.action === 'buy') buyCount += 1;
    }
  }

  async processAccountSell(account, config) {
    const session = this.accountPool.getSession(account.id);

    if (!session) {
      return;
    }

    try {
      const result = await this.inventorySeller.processAccount(account, config, session);

      if (result.empty) return;

      if (result.lastItem) {
        const { hashName, sellPrice, dryRun } = result.lastItem;
        await run(
          this.db,
          `INSERT INTO trades (account_id, game, action, market_hash_name, price, profit, dry_run)
           VALUES (?, ?, 'sell', ?, ?, NULL, ?)`,
          [account.id, account.game, hashName, sellPrice, dryRun ? 1 : 0]
        );
        await logAudit(this.db, {
          accountId: account.id,
          action: dryRun ? 'dry_run_sell' : 'sell',
          message: dryRun
            ? `[тест] Продал бы «${hashName}» за ${sellPrice} ₽`
            : `Продажа «${hashName}» за ${sellPrice} ₽`,
          meta: result.lastItem,
        });
      }

      if (result.errors?.length) {
        await logAudit(this.db, {
          accountId: account.id,
          level: 'warn',
          action: 'sell_skip',
          message: result.errors.join('; '),
        });
      }
    } catch (err) {
      await logAudit(this.db, {
        accountId: account.id,
        level: 'warn',
        action: 'inventory_error',
        message: err.message,
      });
    }
  }

  async handleDecision(account, config, item, decision) {
    const dryRun = config.dryRun ? 1 : 0;

    if (decision.action === 'buy') {
      try {
        const buyResult = await this.marketExecutor.createBuyOrder(
          account.id,
          item.appId,
          decision.marketHashName,
          decision.buyOrderPrice,
          config
        );

        await run(
          this.db,
          `INSERT INTO trades (account_id, game, action, market_hash_name, price, profit, dry_run)
           VALUES (?, ?, 'buy', ?, ?, ?, ?)`,
          [account.id, account.game, decision.marketHashName, decision.buyOrderPrice, decision.profit, dryRun]
        );

        await logAudit(this.db, {
          accountId: account.id,
          action: dryRun ? 'dry_run_buy' : 'buy',
          message: `${dryRun ? '[тест] Купил бы' : 'Покупка'} «${decision.marketHashName}» @ ${decision.buyOrderPrice} ₽`,
          meta: { ...decision, buyResult },
        });
      } catch (err) {
        await logAudit(this.db, {
          accountId: account.id,
          level: 'error',
          action: 'buy_failed',
          message: err.message,
          meta: { item: decision.marketHashName },
        });
      }
    } else {
      await logAudit(this.db, {
        accountId: account.id,
        action: decision.reason,
        message: `Пропуск «${decision.marketHashName}»: ${formatSkipReason(decision.reason)}${
          decision.meta?.profit != null
            ? ` (прибыль ~${decision.meta.profit} ₽, покупка ${decision.meta.buyPrice} ₽, после комиссии ~${decision.meta.netSell} ₽)`
            : ''
        }`,
        meta: decision.meta,
      });
    }
  }

  async runRelistWindow(account, config, slot) {
    if (!(await this.isScanRunning())) return;

    await logAudit(this.db, {
      accountId: account.id,
      action: 'relist_window',
      message: `Окно перевыставления: ${slot}`,
    });

    try {
      const result = await this.marketExecutor.relistOrders(account.id, config);
      await logAudit(this.db, {
        accountId: account.id,
        action: 'relist_done',
        message: JSON.stringify(result),
      });
    } catch (err) {
      await logAudit(this.db, {
        accountId: account.id,
        level: 'error',
        action: 'relist_failed',
        message: err.message,
      });
    }
  }
}

module.exports = { BotEngine };
