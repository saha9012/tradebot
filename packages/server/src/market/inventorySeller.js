const { gameToAppId } = require('../providers/steam/priceFetcher');
const { getItemId } = require('../util/itemId');
const { marketListingUrl } = require('../util/marketUrls');
const { upsertSalePrice, pruneSalesNotInAssets } = require('../db/salesStore');

/** Контекст инвентаря Steam (Dota/CS2/Rust). */
const CONTEXT_IDS = { dota: 2, cs2: 2, rust: 2 };

const COOLDOWN_MS = 10 * 60 * 1000;

function getInventory(community, steamId, appId, contextId) {
  return new Promise((resolve, reject) => {
    community.getUserInventoryContents(
      steamId,
      appId,
      contextId,
      true,
      'english',
      (err, items) => {
        if (err) reject(err);
        else resolve(items || []);
      }
    );
  });
}

function isDuplicateSteamError(message) {
  return /duplicate.*already occurred/i.test(String(message || ''));
}

class InventorySeller {
  constructor(db, accountPool, priceFetcher, marketExecutor) {
    this.db = db;
    this.accountPool = accountPool;
    this.priceFetcher = priceFetcher;
    this.marketExecutor = marketExecutor;
    this.recentAssets = new Map();
    /** @type {Map<string, { raw: object[], at: number }>} */
    this.inventoryCache = new Map();
  }

  markTried(assetId) {
    this.recentAssets.set(String(assetId), Date.now());
  }

  wasRecentlyTried(assetId) {
    const t = this.recentAssets.get(String(assetId));
    if (!t) return false;
    if (Date.now() - t > COOLDOWN_MS) {
      this.recentAssets.delete(String(assetId));
      return false;
    }
    return true;
  }

  async loadInventory(account, session) {
    const appId = gameToAppId(account.game);
    const contextId = CONTEXT_IDS[account.game] ?? 2;
    const steamId = session.info?.steamId || session.client?.steamID?.getSteamID64?.();
    if (!steamId) throw new Error('Нет Steam ID в сессии');

    try {
      const raw = await getInventory(session.community, steamId, appId, contextId);
      this.inventoryCache.set(account.id, { raw, at: Date.now() });
      return raw;
    } catch (err) {
      if (isDuplicateSteamError(err.message)) {
        const cached = this.inventoryCache.get(account.id);
        if (cached && Date.now() - cached.at < 120_000) {
          return cached.raw;
        }
      }
      throw err;
    }
  }

  /**
   * Синхронизирует цены sell с маркета для всех marketable предметов в инвентаре.
   * @param {object[]|null} rawInventory — если уже загружен, повторный запрос к Steam не нужен
   */
  async syncInventoryPrices(account, session, rawInventory = null) {
    const appId = gameToAppId(account.game);
    const steamId = session.info?.steamId || session.client?.steamID?.getSteamID64?.();
    if (!steamId) return { synced: 0, errors: [] };

    let raw = rawInventory;
    if (!raw) {
      try {
        raw = await this.loadInventory(account, session);
      } catch (err) {
        if (isDuplicateSteamError(err.message)) {
          return { synced: 0, errors: [], skippedDuplicate: true };
        }
        throw err;
      }
    }
    const marketable = raw.filter((item) => item.marketable && item.market_hash_name);
    const assetIds = [];
    let synced = 0;
    const errors = [];

    for (const item of marketable) {
      const assetId = String(item.assetid);
      assetIds.push(assetId);
      const hashName = item.market_hash_name;

      try {
        const marketData = await this.priceFetcher.fetchItem(appId, hashName, session);
        const lowest = marketData?.lowestListing;
        if (lowest == null || lowest <= 0) continue;

        await upsertSalePrice(this.db, {
          accountId: account.id,
          itemId: getItemId(hashName),
          assetId,
          game: account.game,
          appId,
          marketHashName: hashName,
          sellPrice: lowest,
          listingUrl: marketListingUrl(appId, hashName),
        });
        synced += 1;
      } catch (err) {
        errors.push(`${hashName}: ${err.message}`);
      }
    }

    await pruneSalesNotInAssets(this.db, account.id, assetIds);
    return { synced, errors };
  }

  /**
   * Проверяет инвентарь и выставляет лоты: цена = lowest listing − undercutStep.
   * @param {object[]|null} rawInventory
   */
  async processAccount(account, config, session, rawInventory = null) {
    const appId = gameToAppId(account.game);
    const contextId = CONTEXT_IDS[account.game] ?? 2;

    let raw = rawInventory;
    if (!raw) {
      raw = await this.loadInventory(account, session);
    }

    const candidates = raw.filter(
      (item) =>
        item.marketable &&
        item.market_hash_name &&
        !this.wasRecentlyTried(item.assetid)
    );

    if (!candidates.length) {
      return { listed: 0, skipped: 0, empty: true, errors: [] };
    }

    const maxPerTick = config.maxSellPerTick ?? 3;
    const batch = candidates.slice(0, maxPerTick);
    let listed = 0;
    let skipped = 0;
    const errors = [];

    for (const item of batch) {
      this.markTried(item.assetid);
      const hashName = item.market_hash_name;

      try {
        const marketData = await this.priceFetcher.fetchItem(appId, hashName, session);

        const lowest = marketData.lowestListing;
        if (lowest == null || lowest <= 0) {
          skipped += 1;
          continue;
        }

        const sellPrice = Math.max(0.03, Math.round((lowest - config.undercutStep) * 100) / 100);

        await this.marketExecutor.createSellListing(
          account.id,
          appId,
          String(item.assetid),
          String(item.contextid || contextId),
          sellPrice,
          config
        );

        listed += 1;
        return {
          listed,
          skipped,
          empty: false,
          errors,
          lastItem: {
            hashName,
            sellPrice,
            assetId: item.assetid,
            itemId: getItemId(hashName),
            appId,
            listingUrl: marketListingUrl(appId, hashName),
            dryRun: !!config.dryRun,
          },
        };
      } catch (err) {
        if (isDuplicateSteamError(err.message)) {
          skipped += 1;
          continue;
        }
        errors.push(`${hashName}: ${err.message}`);
        skipped += 1;
      }
    }

    return { listed, skipped, empty: false, errors };
  }
}

module.exports = { InventorySeller, CONTEXT_IDS, getInventory };
