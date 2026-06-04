const express = require('express');
const { all, get, run } = require('../db/database');
const { gameToAppId } = require('../providers/steam/priceFetcher');
const { mergeStrategyConfig, DEFAULT_STRATEGY } = require('../strategy/defaults');

function createApiRouter(db, accountPool, botEngine) {
  const router = express.Router();
  const priceFetcher = botEngine.priceFetcher;

  router.get('/health', (req, res) => {
    res.json({ ok: true, service: 'steam-bot-server' });
  });

  router.get('/bot/status', async (req, res, next) => {
    try {
      const runningScan = await botEngine.isScanRunning();
      const runningSell = await botEngine.isSellRunning();
      res.json({
        running: runningScan,
        runningScan,
        runningSell,
        emergencyStop: botEngine.emergencyStop,
        rateLimiterPaused: botEngine.rateLimiter.isPaused(),
        marketPriceMode: require('../config').marketPriceMode,
        scanItemsPerTick: require('../config').scanItemsPerTick,
        scanTickMs: require('../config').scanTickMs,
        sessions: accountPool.listStatuses(),
      });
    } catch (e) { next(e); }
  });

  router.post('/bot/scan/start', async (req, res, next) => {
    try { res.json(await botEngine.startScan()); } catch (e) { next(e); }
  });

  router.post('/bot/scan/stop', async (req, res, next) => {
    try { res.json(await botEngine.stopScan()); } catch (e) { next(e); }
  });

  router.post('/bot/sell/start', async (req, res, next) => {
    try { res.json(await botEngine.startSell()); } catch (e) { next(e); }
  });

  router.post('/bot/sell/stop', async (req, res, next) => {
    try { res.json(await botEngine.stopSell()); } catch (e) { next(e); }
  });

  router.post('/bot/start', async (req, res, next) => {
    try { res.json(await botEngine.startScan()); } catch (e) { next(e); }
  });

  router.post('/bot/stop', async (req, res, next) => {
    try { res.json(await botEngine.stop()); } catch (e) { next(e); }
  });

  router.post('/bot/emergency-stop', async (req, res, next) => {
    try { res.json(await botEngine.emergencyStopAll()); } catch (e) { next(e); }
  });

  router.post('/bot/rate-limiter/resume', async (req, res, next) => {
    try {
      botEngine.rateLimiter.resume();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get('/accounts', async (req, res, next) => {
    try {
      const rows = await all(db, `SELECT a.*, s.config_json FROM accounts a
        LEFT JOIN strategy_config s ON s.account_id = a.id ORDER BY a.id`);
      res.json(rows.map((r) => ({
        ...r,
        enabled: Boolean(r.enabled),
        sessionActive: accountPool.hasLiveSession(r.id),
        strategy: r.config_json ? mergeStrategyConfig(r.game, JSON.parse(r.config_json)) : null,
        config_json: undefined,
      })));
    } catch (e) { next(e); }
  });

  router.post('/accounts', async (req, res, next) => {
    try {
      const { id, label, game, credentials_env } = req.body;
      if (!id || !label || !game || !credentials_env) {
        return res.status(400).json({ error: 'id, label, game, credentials_env required' });
      }
      const { DEFAULT_STRATEGY } = require('../strategy/defaults');
      await run(db, `INSERT INTO accounts (id, label, game, credentials_env, enabled) VALUES (?, ?, ?, ?, 0)`,
        [id, label, game, credentials_env]);
      await run(db, `INSERT INTO strategy_config (account_id, config_json) VALUES (?, ?)`,
        [id, JSON.stringify(DEFAULT_STRATEGY[game] || DEFAULT_STRATEGY.dota)]);
      res.status(201).json({ ok: true, id });
    } catch (e) { next(e); }
  });

  router.get('/accounts/:id', async (req, res, next) => {
    try {
      const row = await get(db, `SELECT a.*, s.config_json FROM accounts a
        LEFT JOIN strategy_config s ON s.account_id = a.id WHERE a.id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Account not found' });
      res.json({
        ...row,
        enabled: Boolean(row.enabled),
        strategy: mergeStrategyConfig(row.game, JSON.parse(row.config_json)),
      });
    } catch (e) { next(e); }
  });

  router.put('/accounts/:id/strategy', async (req, res, next) => {
    try {
      const config = req.body;
      await run(db, `UPDATE strategy_config SET config_json = ?, updated_at = datetime('now') WHERE account_id = ?`,
        [JSON.stringify(config), req.params.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.post('/accounts/:id/login', async (req, res, next) => {
    try {
      const acc = await get(db, 'SELECT * FROM accounts WHERE id = ?', [req.params.id]);
      if (!acc) return res.status(404).json({ error: 'Account not found' });
      const result = await accountPool.login(acc.id, acc.credentials_env);
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/accounts/:id/logout', async (req, res, next) => {
    try {
      res.json(await accountPool.logout(req.params.id));
    } catch (e) { next(e); }
  });

  router.post('/accounts/:id/refresh-wallet', async (req, res, next) => {
    try {
      res.json(await accountPool.refreshWallet(req.params.id));
    } catch (e) { next(e); }
  });

  router.patch('/accounts/:id', async (req, res, next) => {
    try {
      const { enabled, wallet_balance, label } = req.body;
      const updates = [];
      const params = [];
      if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
      if (wallet_balance !== undefined) { updates.push('wallet_balance = ?'); params.push(wallet_balance); }
      if (label !== undefined) { updates.push('label = ?'); params.push(label); }
      if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
      params.push(req.params.id);
      await run(db, `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get('/market/:game/:hashName', async (req, res, next) => {
    try {
      const appId = gameToAppId(req.params.game);
      const session = accountPool.getSession('account-1');
      const data = await priceFetcher.fetchItem(
        appId,
        decodeURIComponent(req.params.hashName),
        session
      );
      res.json(data);
    } catch (e) { next(e); }
  });

  router.post('/market/catalog/sync', async (req, res, next) => {
    try {
      const game = req.body?.game || req.query?.game || 'dota';
      const accountId = req.body?.accountId || req.query?.accountId || 'account-1';
      const session = accountPool.getSession(accountId);
      if (!session?.cookieHeader) {
        return res.status(401).json({ error: 'Login required' });
      }
      const { syncGameCatalog } = require('../market/marketCatalogSync');
      const result = await syncGameCatalog(priceFetcher, db, game, session, {
        query: req.body?.query || req.query?.q || '',
        maxPages: Math.min(Number(req.body?.maxPages) || 30, 100),
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.get('/market/catalog', async (req, res, next) => {
    try {
      const game = req.query.game || 'dota';
      const appId = gameToAppId(game);
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const rows = await all(
        db,
        `SELECT market_hash_name, sell_price_cents, qty, listing_url, updated_at
         FROM market_catalog WHERE app_id = ? ORDER BY updated_at DESC LIMIT ?`,
        [appId, limit]
      );
      res.json({
        appId,
        items: rows.map((r) => ({
          marketHashName: r.market_hash_name,
          sellPriceRub: r.sell_price_cents / 100,
          qty: r.qty,
          listingUrl: r.listing_url,
          updatedAt: r.updated_at,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/market/search', async (req, res, next) => {
    try {
      const game = req.query.game || 'dota';
      const appId = gameToAppId(game);
      const accountId = req.query.accountId || 'account-1';
      const session = accountPool.getSession(accountId);
      if (!session?.community) {
        return res.status(401).json({ error: 'Login required for market search' });
      }
      const { results, totalCount } = await priceFetcher.searchMarketRender(
        appId,
        req.query.q || '',
        session.cookieHeader || '',
        { start: Number(req.query.start) || 0 }
      );
      res.json({ results, totalCount, appId });
    } catch (e) { next(e); }
  });

  router.get('/trades', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const rows = await all(db, 'SELECT * FROM trades ORDER BY id DESC LIMIT ?', [limit]);
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/debug/fetches', async (req, res, next) => {
    try {
      const { listFetchDebugEvents } = require('../db/fetchDebugLog');
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      const sinceId = Number(req.query.sinceId) || 0;
      const rows = await listFetchDebugEvents(db, { limit, sinceId });
      res.json(
        rows.map((r) => ({
          ...r,
          ok: Boolean(r.ok),
          detail: r.detail_json ? JSON.parse(r.detail_json) : null,
          detail_json: undefined,
        }))
      );
    } catch (e) {
      next(e);
    }
  });

  router.delete('/debug/fetches', async (req, res, next) => {
    try {
      const { clearFetchDebugEvents } = require('../db/fetchDebugLog');
      await clearFetchDebugEvents(db);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get('/analytics', async (req, res, next) => {
    try {
      const { listItemSnapshots } = require('../db/itemStore');
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const accountId = req.query.accountId;
      const rows = await listItemSnapshots(db, { limit, accountId });
      res.json(
        rows.map((r) => ({
          ...r,
          created_at: r.updated_at,
          steam_raw: r.steam_raw_json ? JSON.parse(r.steam_raw_json) : null,
          steam_raw_json: undefined,
        }))
      );
    } catch (e) {
      next(e);
    }
  });

  router.get('/analytics/purge-schedule', async (req, res, next) => {
    try {
      const { getAnalyticsPurgeSchedule } = require('../db/analyticsPurge');
      const {
        countItemSnapshots,
        countItemDecisions,
        countPriceLogs,
      } = require('../db/itemStore');
      const schedule = await getAnalyticsPurgeSchedule(db);
      const analyticsCount = await countItemSnapshots(db);
      const decisionsCount = await countItemDecisions(db);
      const priceLogCount = await countPriceLogs(db);
      res.json({
        ...schedule,
        rowCount: analyticsCount + decisionsCount + priceLogCount,
        analyticsCount,
        decisionsCount,
        priceLogCount,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/decisions', async (req, res, next) => {
    try {
      const { listItemDecisions } = require('../db/itemStore');
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const accountId = req.query.accountId;
      const rows = await listItemDecisions(db, { limit, accountId });
      res.json(rows.map((r) => ({ ...r, created_at: r.updated_at })));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/analytics', async (req, res, next) => {
    try {
      const { purgeMarketAnalytics } = require('../db/analyticsPurge');
      const result = await purgeMarketAnalytics(db, { manual: true });
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  router.get('/logs', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const accountId = req.query.accountId;
      let rows;
      if (accountId) {
        rows = await all(db, 'SELECT * FROM audit_log WHERE account_id = ? ORDER BY id DESC LIMIT ?', [accountId, limit]);
      } else {
        rows = await all(db, 'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]);
      }
      res.json(rows.map((r) => ({ ...r, meta: r.meta_json ? JSON.parse(r.meta_json) : null, meta_json: undefined })));
    } catch (e) { next(e); }
  });

  router.delete('/logs', async (req, res, next) => {
    try {
      const { accountId } = req.query;
      const { logAudit } = require('../db/database');
      if (accountId) {
        await run(db, 'DELETE FROM audit_log WHERE account_id = ?', [accountId]);
      } else {
        await run(db, 'DELETE FROM audit_log');
      }
      await logAudit(db, {
        accountId: accountId || null,
        action: 'logs_cleared',
        message: accountId ? `Очищены логи аккаунта ${accountId}` : 'Очищена вся история логов',
      });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get('/dashboard', async (req, res, next) => {
    try {
      const accounts = await all(db, 'SELECT id, label, game, enabled, status, wallet_balance FROM accounts ORDER BY id');
      const pnlToday = await get(db, `SELECT COALESCE(SUM(profit), 0) as total FROM trades WHERE date(created_at) = date('now') AND dry_run = 0`);
      const pnlWeek = await get(db, `SELECT COALESCE(SUM(profit), 0) as total FROM trades WHERE created_at >= datetime('now', '-7 days') AND dry_run = 0`);
      const runningScan = await botEngine.isScanRunning();
      const runningSell = await botEngine.isSellRunning();
      const recentTrades = await all(db, 'SELECT * FROM trades ORDER BY id DESC LIMIT 5');
      res.json({
        running: runningScan,
        runningScan,
        runningSell,
        emergencyStop: botEngine.emergencyStop,
        totalWallet: accounts.reduce((s, a) => s + (a.wallet_balance || 0), 0),
        pnlToday: pnlToday?.total || 0,
        pnlWeek: pnlWeek?.total || 0,
        accounts: accounts.map((a) => ({
          ...a,
          enabled: Boolean(a.enabled),
          sessionActive: accountPool.hasLiveSession(a.id),
        })),
        recentTrades,
      });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { createApiRouter };
