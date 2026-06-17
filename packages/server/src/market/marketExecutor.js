const SteamTotp = require('steam-totp');
const { isBuyOrderAccepted } = require('./buyOrderResult');
const { postCreateBuyOrder } = require('./steamBuyOrder');

class MarketExecutor {
  constructor(db, accountPool, rateLimiter) {
    this.db = db;
    this.accountPool = accountPool;
    this.rateLimiter = rateLimiter;
    this.dailySpend = new Map();
  }

  getDailySpend(accountId) {
    const key = `${accountId}:${new Date().toISOString().slice(0, 10)}`;
    return this.dailySpend.get(key) || 0;
  }

  addDailySpend(accountId, amount) {
    const key = `${accountId}:${new Date().toISOString().slice(0, 10)}`;
    this.dailySpend.set(key, (this.dailySpend.get(key) || 0) + amount);
  }

  canSpend(accountId, config, amount) {
    if (!config.maxSpendPerDayEnabled) return true;
    const max = config.maxSpendPerDay ?? 5000;
    return this.getDailySpend(accountId) + amount <= max;
  }

  getSession(accountId) {
    const session = this.accountPool.getSession(accountId);
    if (!session?.client) throw new Error('Account not logged in');
    return session;
  }

  async createBuyOrder(accountId, appId, marketHashName, price, config, amount = 1) {
    const qty = Math.max(1, Math.floor(Number(amount) || 1));

    if (config.dryRun) {
      return { dryRun: true, action: 'createBuyOrder', marketHashName, price, amount: qty };
    }

    const spend = price * qty;
    if (!this.canSpend(accountId, config, spend)) {
      throw new Error('Daily spend limit reached');
    }

    const session = this.getSession(accountId);
    if (!session.market) throw new Error('steam-market not initialized — re-login');

    return this.rateLimiter.schedule(async () => {
      const confirmHandler = session.credentials?.identitySecret
        ? async (objectId) => {
            await this.acceptBuyConfirmation(session, objectId);
          }
        : null;

      const result = await postCreateBuyOrder(
        session.market,
        appId,
        marketHashName,
        price,
        qty,
        confirmHandler
      );
      if (isBuyOrderAccepted(result)) this.addDailySpend(accountId, spend);
      return result;
    });
  }

  async createSellListing(accountId, appId, assetId, contextId, price, config) {
    if (config.dryRun) {
      return { dryRun: true, action: 'createSellOrder', assetId, price };
    }

    const session = this.getSession(accountId);
    if (!session.market) throw new Error('steam-market not initialized');

    return this.rateLimiter.schedule(async () => {
      const result = await session.market.createSellOrder(appId, {
        assetId,
        contextId,
        price: Math.round(price * 100),
        amount: 1,
      });

      if (session.credentials.identitySecret) {
        await this.acceptConfirmations(session);
      }
      return result;
    });
  }

  async acceptBuyConfirmation(session, objectId) {
    if (!session.community || !session.credentials.identitySecret) return;

    if (objectId) {
      const delays = [0, 800, 1200, 1600, 2000];
      let lastErr;
      for (const delay of delays) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        try {
          await this.acceptConfirmationForObject(session, objectId);
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('Не удалось подтвердить покупку в Steam Guard');
    }

    await this.acceptConfirmations(session);
  }

  acceptConfirmationForObject(session, objectId) {
    return new Promise((resolve, reject) => {
      session.community.acceptConfirmationForObject(
        session.credentials.identitySecret,
        objectId,
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async acceptConfirmations(session) {
    if (!session.community || !session.credentials.identitySecret) return;

    const time = SteamTotp.time();
    const confKey = SteamTotp.getConfirmationKey(
      session.credentials.identitySecret,
      'conf',
      time
    );

    return new Promise((resolve, reject) => {
      session.community.getConfirmations(time, confKey, (err, confirmations) => {
        if (err) return reject(err);
        if (!confirmations?.length) return resolve([]);

        const acceptNext = (i) => {
          if (i >= confirmations.length) return resolve(confirmations);
          const c = confirmations[i];
          const t = SteamTotp.time();
          session.community.acceptConfirmation(
            c.id,
            c.key,
            t,
            SteamTotp.getConfirmationKey(session.credentials.identitySecret, 'allow', t),
            (e) => {
              if (e) return reject(e);
              acceptNext(i + 1);
            }
          );
        };
        acceptNext(0);
      });
    });
  }

  async relistOrders(accountId, config) {
    const session = this.getSession(accountId);

    if (config.dryRun || !session.market) {
      return { dryRun: config.dryRun, action: 'relist', accountId };
    }

    return this.rateLimiter.schedule(async () => {
      const listings = await session.market.myListings();
      return { relisted: listings?.listings?.length ?? 0, success: listings?.success };
    });
  }
}

module.exports = { MarketExecutor };
