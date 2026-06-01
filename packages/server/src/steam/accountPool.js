const { createClient, loadCredentials, loginClient, logoutClient, getWalletBalance } = require('./steamSession');
const { run, logAudit } = require('../db/database');

class AccountPool {
  constructor(db) {
    this.db = db;
    this.sessions = new Map();
  }

  getSession(accountId) {
    return this.sessions.get(accountId) || null;
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
        cookieHeader: info.cookieHeader,
        market: info.market || null,
        info: { steamId: info.steamId, accountName: info.accountName },
        loggedInAt: Date.now(),
      };

      this.sessions.set(accountId, session);

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
        wallet = await getWalletBalance(info.community);
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
        message: `Logged in as ${info.accountName}${wallet != null ? `, wallet ${wallet}` : ''}`,
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
    await logAudit(this.db, { accountId, action: 'logout', message: 'Logged out' });
    return { ok: true };
  }

  async refreshWallet(accountId) {
    const session = this.sessions.get(accountId);
    if (!session?.community) throw new Error('Not logged in');
    const wallet = await getWalletBalance(session.community);
    await run(this.db, `UPDATE accounts SET wallet_balance = ? WHERE id = ?`, [wallet, accountId]);
    return { wallet };
  }

  listStatuses() {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      accountId: id,
      steamId: s.info?.steamId,
      loggedInAt: s.loggedInAt,
      hasMarket: Boolean(s.market),
    }));
  }
}

module.exports = { AccountPool };
