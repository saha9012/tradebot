const { APP_IDS } = require('../strategy/defaults');
const { gameToAppId } = require('../providers/steam/priceFetcher');

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

class InventorySeller {
  constructor(accountPool, priceFetcher, marketExecutor) {
    this.accountPool = accountPool;
    this.priceFetcher = priceFetcher;
    this.marketExecutor = marketExecutor;
    this.recentAssets = new Map();
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

  /**
   * Проверяет инвентарь и выставляет лоты: цена = lowest listing − undercutStep.
   * @returns {{ listed: number, skipped: number, empty: boolean, errors: string[] }}
   */
  async processAccount(account, config, session) {
    const appId = gameToAppId(account.game);
    const contextId = CONTEXT_IDS[account.game] ?? 2;
    const steamId = session.info?.steamId || session.client?.steamID?.getSteamID64?.();
    if (!steamId) throw new Error('Нет Steam ID в сессии');

    const raw = await getInventory(session.community, steamId, appId, contextId);
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
          lastItem: { hashName, sellPrice, assetId: item.assetid, dryRun: !!config.dryRun },
        };
      } catch (err) {
        errors.push(`${hashName}: ${err.message}`);
        skipped += 1;
      }
    }

    return { listed, skipped, empty: false, errors };
  }
}

module.exports = { InventorySeller, CONTEXT_IDS };
