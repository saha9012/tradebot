const { get, run, logAudit, all } = require('../db/database');
const { mergeStrategyConfig } = require('../strategy/defaults');
const { formatSkipReason } = require('../util/auditMessages');
const { isBuyOrderAccepted, buyOrderFailureMessage } = require('../market/buyOrderResult');
const { upsertItemSnapshot, upsertItemDecision } = require('../db/itemStore');
const { getItemId } = require('../util/itemId');
const { MarketScanner } = require('../market/marketScanner');
const { MarketExecutor } = require('../market/marketExecutor');
const { InventorySeller } = require('../market/inventorySeller');
const { PriceFetcher } = require('../providers/steam/priceFetcher');
const { RateLimiter } = require('../jobs/rateLimiter');
const {
  rateLimitMinMs,
  rateLimitJitterMs,
  scanTickMs,
  sellTickMs,
  marketCatalogSyncMs,
  marketPriceMode,
} = require('../config');
const { syncGameCatalog } = require('../market/marketCatalogSync');
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
    this.inventorySeller = new InventorySeller(
      db,
      accountPool,
      this.priceFetcher,
      this.marketExecutor
    );
    this.relistScheduler = new RelistScheduler(this);
    this.scanInterval = null;
    this.sellInterval = null;
    this.emergencyStop = false;
    this.lastSkipLog = new Map();
    this.scanTickBusy = false;
    this.sellTickBusy = false;
    this.lastRateLimitLog = 0;
    this.catalogSyncInterval = null;
    this.catalogSyncBusy = false;
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
    this.startCatalogSync();
    await this.tickScan();
    return { runningScan: true, marketPriceMode };
  }

  startCatalogSync() {
    if (this.catalogSyncInterval) return;
    this.catalogSyncInterval = setInterval(
      () => this.tickCatalogSync().catch(console.error),
      marketCatalogSyncMs
    );
    this.tickCatalogSync().catch(console.error);
  }

  stopCatalogSync() {
    if (this.catalogSyncInterval) {
      clearInterval(this.catalogSyncInterval);
      this.catalogSyncInterval = null;
    }
  }

  async tickCatalogSync() {
    if (this.catalogSyncBusy) return;
    this.catalogSyncBusy = true;
    try {
      const accounts = await this.getEnabledAccounts();
      for (const acc of accounts) {
        const session = this.accountPool.getSession(acc.id);
        if (!session?.cookieHeader) continue;
        await syncGameCatalog(this.priceFetcher, this.db, acc.game, session, { maxPages: 30 });
      }
    } finally {
      this.catalogSyncBusy = false;
    }
  }

  async stopScan() {
    await this.setState('running_scan', false);
    await this.setState('running', false);
    this.relistScheduler.stop();
    this.stopCatalogSync();
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

    const batch = await this.marketScanner.processScanBatch(
      session,
      account.id,
      account.game,
      config
    );

    if (!batch.ok) {
      await logAudit(this.db, {
        accountId: account.id,
        level: batch.error?.includes('нет лотов') ? 'info' : 'warn',
        action: batch.error?.includes('нет лотов') ? 'scan_empty' : 'scan_error',
        message: batch.error,
        meta: batch.scanInfo,
      });
      return;
    }

    const { scanInfo, results, appId } = batch;

    for (const result of results) {
      const { hashName, listingUrl, decision, item, marketData, fetchError } = result;
      const priceSource = marketData?.priceSource || (fetchError ? 'нет данных' : '—');

      const itemId = getItemId(hashName);

      await upsertItemSnapshot(this.db, {
        accountId: account.id,
        itemId,
        game: account.game,
        appId,
        marketHashName: hashName,
        highestBuyOrder: marketData?.highestBuyOrder ?? null,
        lowestListing: marketData?.lowestListing ?? null,
        salesPerDay: marketData?.salesPerDay ?? null,
        listingUrl,
        steamRaw: marketData?.steamRaw ?? null,
      });

      await upsertItemDecision(this.db, {
        accountId: account.id,
        itemId,
        game: account.game,
        appId,
        marketHashName: hashName,
        highestBuyOrder: marketData?.highestBuyOrder ?? null,
        lowestListing: marketData?.lowestListing ?? null,
        buyOrderPrice: decision.action === 'buy' ? decision.buyOrderPrice : null,
        sellListingPrice: decision.sellListingPrice ?? marketData?.lowestListing ?? null,
        profit: decision.profit ?? null,
        profitPercent: decision.profitPercent ?? null,
        decision: decision.action,
        skipReason: decision.action === 'skip' ? decision.reason : null,
        listingUrl,
      });

      const liq =
        marketData != null
          ? `ликв ${marketData.salesPerDay ?? 0}/сут`
          : 'ликв —';

      const buyStr =
        marketData?.highestBuyOrder != null ? String(marketData.highestBuyOrder) : '—';
      const sellStr = marketData?.lowestListing != null ? String(marketData.lowestListing) : '—';

      let shortMessage;
      if (fetchError) {
        shortMessage = `✗ ${hashName} | buy ${buyStr} sell ${sellStr} | ${fetchError}`;
      } else if (decision.action === 'buy') {
        shortMessage = `✓ ${hashName} | buy ${buyStr} → ${decision.buyOrderPrice} | sell ${sellStr} | +${decision.profit}₽ | ${priceSource} | ${liq}`;
      } else {
        shortMessage = `✗ ${hashName} | buy ${buyStr} sell ${sellStr} | ${formatSkipReason(decision.reason, decision.meta)} | ${priceSource} | ${liq}`;
      }

      await logAudit(this.db, {
        accountId: account.id,
        action: 'market_check',
        message: shortMessage,
        meta: { itemId, listingUrl, scanInfo },
      });

      if (decision.action === 'buy' && item) {
        await this.handleDecision(account, config, item, decision, {
          listingUrl,
          appId,
          itemId,
        });
      }
    }

    if (scanInfo?.label) {
      await logAudit(this.db, {
        accountId: account.id,
        action: 'scan_cycle',
        message: `Тик ×${results.length}: ${scanInfo.label} → ${scanInfo.nextLabel || '—'}`,
        meta: scanInfo,
      });
    }
  }

  async processAccountSell(account, config) {
    const session = this.accountPool.getSession(account.id);

    if (!session) {
      return;
    }

    try {
      const raw = await this.inventorySeller.loadInventory(account, session);

      const sync = await this.inventorySeller.syncInventoryPrices(account, session, raw);
      if (sync.errors?.length) {
        await logAudit(this.db, {
          accountId: account.id,
          level: 'warn',
          action: 'sales_sync_warn',
          message: sync.errors.slice(0, 3).join('; '),
        });
      }

      const result = await this.inventorySeller.processAccount(account, config, session, raw);

      if (result.empty) return;

      if (result.lastItem) {
        const { hashName, sellPrice, dryRun, itemId, appId, listingUrl } = result.lastItem;
        await run(
          this.db,
          `INSERT INTO trades (
            account_id, game, action, market_hash_name, price, profit, dry_run,
            listing_url, app_id, item_id
          ) VALUES (?, ?, 'sell', ?, ?, NULL, ?, ?, ?, ?)`,
          [
            account.id,
            account.game,
            hashName,
            sellPrice,
            dryRun ? 1 : 0,
            listingUrl || null,
            appId ?? null,
            itemId || getItemId(hashName),
          ]
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

  async handleDecision(account, config, item, decision, extra = {}) {
    const dryRun = config.dryRun ? 1 : 0;

    if (decision.action === 'buy') {
      try {
        const buyQty = decision.buyOrderQuantity ?? 1;
        const buyResult = await this.marketExecutor.createBuyOrder(
          account.id,
          item.appId,
          decision.marketHashName,
          decision.buyOrderPrice,
          config,
          buyQty
        );

        if (!isBuyOrderAccepted(buyResult)) {
          throw new Error(buyOrderFailureMessage(buyResult));
        }

        await logAudit(this.db, {
          accountId: account.id,
          action: dryRun ? 'dry_run_buy' : 'buy',
          message: `${dryRun ? '[тест]' : ''} buy ${decision.marketHashName} ×${buyQty} @ ${decision.buyOrderPrice}₽`,
          meta: {
            ...decision,
            buyResult,
            buyQty,
            listingUrl: extra.listingUrl,
            priceTotalKopecks: buyResult.priceTotalKopecks,
          },
        });

        await run(
          this.db,
          `INSERT INTO trades (
            account_id, game, action, market_hash_name, price, profit, dry_run,
            listing_url, app_id, item_id
          ) VALUES (?, ?, 'buy', ?, ?, ?, ?, ?, ?, ?)`,
          [
            account.id,
            account.game,
            decision.marketHashName,
            decision.buyOrderPrice,
            decision.profit,
            dryRun,
            extra.listingUrl || item.listingUrl || null,
            extra.appId ?? item.appId ?? null,
            extra.itemId ?? getItemId(decision.marketHashName),
          ]
        );
      } catch (err) {
        await logAudit(this.db, {
          accountId: account.id,
          level: 'error',
          action: 'buy_failed',
          message: err.message,
          meta: { item: decision.marketHashName },
        });
      }
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
