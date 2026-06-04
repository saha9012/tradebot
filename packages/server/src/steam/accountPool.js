const { createClient, loadCredentials, loginClient, logoutClient, getWalletBalance } = require('./steamSession');
const { run, logAudit } = require('../db/database');

function isLiveSession(session) {
  if (!session?.client || !session?.community) return false;
  try {
    return Boolean(session.client.steamID);
  } catch {
    return false;
  }
}

class AccountPool {
  constructor(db) {
    this.db = db;
    this.sessions = new Map();
  }

  /** После перезапуска node в БД может быть idle, а сессии в памяти нет. */
  async reconcileSessions() {
    const { all } = require('../db/database');
    const rows = await all(
      this.db,
      `SELECT id, status FROM accounts WHERE status IN ('idle', 'logging_in')`
    );
    for (const row of rows) {
      if (!isLiveSession(this.sessions.get(row.id))) {
        await run(this.db, `UPDATE accounts SET status = 'needs_login' WHERE id = ?`, [row.id]);
      }
    }
  }

  getSession(accountId) {
    const session = this.sessions.get(accountId);
    if (!session || !isLiveSession(session)) {
      if (session) this.dropSession(accountId, 'Сессия Steam оборвана');
      return null;
    }
    return session;
  }

  wireDisconnect(accountId, client) {
    const onDrop = (reason) => {
      if (!this.sessions.has(accountId)) return;
      this.dropSession(accountId, reason);
      logAudit(this.db, {
        accountId,
        level: 'warn',
        action: 'session_lost',
        message: reason || 'Соединение со Steam потеряно — войдите снова',
      }).catch(() => {});
    };

    client.on('disconnected', (eresult, msg) => {
      onDrop(msg || `Отключение Steam (${eresult})`);
    });
    client.on('loggedOff', () => onDrop('Выход из Steam'));
    client.on('error', (err) => {
      const msg = String(err?.message || err);
      if (msg.includes('LoggedInElsewhere')) {
        onDrop('Вход с другого устройства');
        return;
      }
      if (msg.includes('Throttle') || msg.includes('RateLimit')) {
        logAudit(this.db, {
          accountId,
          level: 'warn',
          action: 'steam_error',
          message: msg,
        }).catch(() => {});
      }
    });
  }

  dropSession(accountId, _reason) {
    this.sessions.delete(accountId);
    run(this.db, `UPDATE accounts SET status = 'needs_login' WHERE id = ?`, [accountId]).catch(() => {});
  }

  async login(accountId, credentialsEnv) {
    const existing = this.sessions.get(accountId);
    if (existing?.client) await logoutClient(existing.client);

    await run(this.db, `UPDATE accounts SET status = 'logging_in', last_error = NULL WHERE id = ?`, [accountId]);

    try {
      const credentials = loadCredentials(credentialsEnv);
      const client = createClient();
      const info = await loginClient(client, credentials);

      const session = {
        client,
        credentials,
        community: info.community,
        sessionID: info.sessionID,
        cookieHeader: info.cookieHeader,
        webCookies: info.webCookies || [],
        market: info.market || null,
        info: { steamId: info.steamId, accountName: info.accountName },
        loggedInAt: Date.now(),
      };

      this.sessions.set(accountId, session);
      this.wireDisconnect(accountId, client);

      if (info.marketError) {
        await logAudit(this.db, {
          accountId,
          level: 'warn',
          action: 'market_init_failed',
          message: info.marketError,
        });
      }

      let wallet = null;
      try {
        wallet = await getWalletBalance(client);
        await run(this.db, `UPDATE accounts SET wallet_balance = ? WHERE id = ?`, [wallet, accountId]);
      } catch (walletErr) {
        await logAudit(this.db, {
          accountId,
          level: 'warn',
          action: 'wallet_fetch_failed',
          message: walletErr.message,
        });
      }

      await run(this.db,
        `UPDATE accounts SET status = 'idle', steam_id = ?, last_error = NULL WHERE id = ?`,
        [info.steamId, accountId]);
      await logAudit(this.db, {
        accountId,
        action: 'login',
        message: `Вход: ${info.accountName}${wallet != null ? `, баланс ${wallet} ₽` : ''}`,
      });

      return { ok: true, steamId: info.steamId, accountName: info.accountName, wallet };
    } catch (err) {
      await run(this.db,
        `UPDATE accounts SET status = 'error', last_error = ? WHERE id = ?`,
        [err.message, accountId]);
      await logAudit(this.db, { accountId, level: 'error', action: 'login_failed', message: err.message });
      throw err;
    }
  }

  async logout(accountId) {
    const session = this.sessions.get(accountId);
    if (session?.client) await logoutClient(session.client);
    this.sessions.delete(accountId);
    await run(this.db, `UPDATE accounts SET status = 'offline' WHERE id = ?`, [accountId]);
    await logAudit(this.db, { accountId, action: 'logout', message: 'Выход из аккаунта' });
    return { ok: true };
  }

  async refreshWallet(accountId) {
    const session = this.getSession(accountId);
    if (!session) throw new Error('Not logged in');
    const wallet = await getWalletBalance(session.client);
    await run(this.db, `UPDATE accounts SET wallet_balance = ? WHERE id = ?`, [wallet, accountId]);
    return { wallet };
  }

  listStatuses() {
    return Array.from(this.sessions.entries())
      .filter(([, s]) => isLiveSession(s))
      .map(([id, s]) => ({
        accountId: id,
        steamId: s.info?.steamId,
        loggedInAt: s.loggedInAt,
        hasMarket: Boolean(s.market),
      }));
  }

  hasLiveSession(accountId) {
    return Boolean(this.getSession(accountId));
  }
}

module.exports = { AccountPool, isLiveSession };
