const { evaluate } = require('../strategy/strategyEngine');
const { get, run, logAudit, all } = require('../db/database');
const { MarketScanner } = require('../market/marketScanner');
const { MarketExecutor } = require('../market/marketExecutor');
const { PriceFetcher } = require('../providers/steam/priceFetcher');
const { RateLimiter } = require('../jobs/rateLimiter');
const { rateLimitMinMs, rateLimitJitterMs } = require('../config');
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
    this.marketScanner = new MarketScanner(this.priceFetcher);
    this.marketExecutor = new MarketExecutor(db, accountPool, this.rateLimiter);
    this.relistScheduler = new RelistScheduler(this);
    this.interval = null;
    this.tickMs = 60_000;
    this.emergencyStop = false;
  }

  async isRunning() {
    if (this.emergencyStop) return false;
    const row = await get(this.db, "SELECT value FROM bot_state WHERE key = 'running'");
    return row?.value === 'true';
  }

  async setRunning(running) {
    await run(this.db, "INSERT OR REPLACE INTO bot_state (key, value) VALUES ('running', ?)", [running ? 'true' : 'false']);
  }

  async getEnabledAccounts() {
    return all(this.db, `SELECT a.*, s.config_json FROM accounts a
      JOIN strategy_config s ON s.account_id = a.id
      WHERE a.enabled = 1`);
  }

  async start() {
    this.emergencyStop = false;
    await this.setRunning(true);
    if (this.interval) clearInterval(this.interval);
    this.relistScheduler.start();
    this.interval = setInterval(() => this.tick().catch(console.error), this.tickMs);
    await this.tick();
    return { running: true };
  }

  async stop() {
    await this.setRunning(false);
    this.relistScheduler.stop();
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return { running: false };
  }

  async emergencyStopAll() {
    this.emergencyStop = true;
    await this.stop();
    await logAudit(this.db, { action: 'emergency_stop', message: 'Bot emergency stopped' });
    return { running: false, emergency: true };
  }

  async tick() {
    if (!(await this.isRunning())) return;

    if (this.rateLimiter.isPaused()) {
      await logAudit(this.db, { action: 'rate_limit_pause', message: 'Skipping tick — rate limiter paused' });
      return;
    }

    const accounts = await this.getEnabledAccounts();

    for (const acc of accounts) {
      const config = JSON.parse(acc.config_json);
      if (!config.enabled) continue;

      const wallet = acc.wallet_balance ?? 0;
      if (acc.game === 'dota' && wallet >= config.balanceThreshold) {
        await logAudit(this.db, {
          accountId: acc.id,
          action: 'balance_threshold',
          message: `Wallet ${wallet} >= ${config.balanceThreshold} — Dota lane idle`,
        });
        continue;
      }

      if (acc.game === 'cs2' || acc.game === 'rust') {
        if (!config.enabled) continue;
      }

      await this.processAccount(acc, config);
    }
  }

  async processAccount(account, config) {
    const session = this.accountPool.getSession(account.id);

    if (!session) {
      await logAudit(this.db, {
        accountId: account.id,
        action: 'tick_skip',
        message: 'Not logged in — login to scan market',
      });
      return;
    }

    try {
      await this.accountPool.refreshWallet(account.id);
    } catch {
      /* wallet refresh optional */
    }

    const { items, error } = await this.marketScanner.scanAccount(
      session,
      account.game,
      config,
      { maxItems: 10 }
    );

    if (error) {
      await logAudit(this.db, { accountId: account.id, level: 'warn', action: 'scan_error', message: error });
      return;
    }

    if (!items.length) {
      await logAudit(this.db, { accountId: account.id, action: 'scan_empty', message: 'No items in price range' });
      return;
    }

    let buyCount = 0;
    for (const item of items) {
      if (buyCount >= (config.maxBuyOrders ?? 10)) break;

      const decision = evaluate(account.game, config, item);
      await this.handleDecision(account, config, item, decision);
      if (decision.action === 'buy') buyCount += 1;
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

        await run(this.db, `INSERT INTO trades (account_id, game, action, market_hash_name, price, profit, dry_run)
          VALUES (?, ?, 'buy', ?, ?, ?, ?)`,
          [account.id, account.game, decision.marketHashName, decision.buyOrderPrice, decision.profit, dryRun]);

        await logAudit(this.db, {
          accountId: account.id,
          action: dryRun ? 'dry_run_buy' : 'buy',
          message: `${dryRun ? 'Would buy' : 'Buy'} ${decision.marketHashName} @ ${decision.buyOrderPrice}, sell @ ${decision.sellListingPrice}`,
          meta: { ...decision, buyResult },
        });

        // Sell listing requires assetId from inventory after buy fills — logged for relist job
        if (!config.dryRun) {
          await logAudit(this.db, {
            accountId: account.id,
            action: 'sell_pending',
            message: `List at ${decision.sellListingPrice} when item arrives in inventory`,
            meta: { marketHashName: decision.marketHashName },
          });
        }
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
        message: `Skip ${decision.marketHashName}`,
        meta: decision.meta,
      });
    }
  }

  async runRelistWindow(account, config, slot) {
    await logAudit(this.db, {
      accountId: account.id,
      action: 'relist_window',
      message: `Relist window: ${slot}`,
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
