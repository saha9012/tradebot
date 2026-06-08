const crypto = require('crypto');
const { get } = require('../db/database');
const { logManualDebugStep } = require('../db/fetchDebugLog');
const { APP_IDS, mergeStrategyConfig } = require('../strategy/defaults');
const { gameToAppId } = require('../providers/steam/priceFetcher');
const { getInventory, CONTEXT_IDS } = require('../market/inventorySeller');
const { postCreateBuyOrder } = require('../market/steamBuyOrder');
const { isBuyOrderAccepted, buyOrderFailureMessage, buyOrderFailureHint } = require('../market/buyOrderResult');

function steamIdFromSession(session) {
  return session.info?.steamId || session.client?.steamID?.getSteamID64?.();
}

function summarizeInventoryItem(item) {
  return {
    assetid: item.assetid,
    name: item.market_hash_name || item.name,
    market_hash_name: item.market_hash_name || null,
    marketable: Boolean(item.marketable),
    tradable: Boolean(item.tradable),
    amount: item.amount,
  };
}

async function debugScanInventory(botEngine, accountId) {
  const acc = await get(botEngine.db, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) throw new Error('Аккаунт не найден');

  const session = botEngine.accountPool.getSession(accountId);
  if (!session?.community) throw new Error('Нужен вход в Steam');

  const steamId = steamIdFromSession(session);
  if (!steamId) throw new Error('Нет Steam ID в сессии');

  const traceId = crypto.randomUUID();

  await logManualDebugStep(botEngine.db, {
    traceId,
    accountId,
    step: 'inventory_scan_start',
    ok: true,
    detail: { accountGame: acc.game, steamId },
  });

  for (const [game, appId] of Object.entries(APP_IDS)) {
    const contextId = CONTEXT_IDS[game] ?? 2;
    try {
      const raw = await botEngine.rateLimiter.schedule(() =>
        getInventory(session.community, steamId, appId, contextId)
      );
      const items = raw.map(summarizeInventoryItem);
      const marketable = items.filter((i) => i.marketable && i.market_hash_name);

      await logManualDebugStep(botEngine.db, {
        traceId,
        accountId,
        appId,
        step: `inventory_${game}`,
        ok: true,
        detail: {
          game,
          appId,
          isAccountGame: game === acc.game,
          total: items.length,
          marketableCount: marketable.length,
          items,
          marketable,
        },
      });
    } catch (err) {
      const soft = /ECONNRESET|ETIMEDOUT|ESOCKET|duplicate.*already occurred/i.test(err.message);
      await logManualDebugStep(botEngine.db, {
        traceId,
        accountId,
        appId,
        step: `inventory_${game}`,
        ok: soft,
        error: err.message,
        detail: soft ? { note: 'Часто пустой инвентарь / нет игры / duplicate' } : null,
      });
    }
  }

  return { traceId, ok: true };
}

async function debugTestBuyOrder(botEngine, accountId, body = {}) {
  const acc = await get(botEngine.db, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) throw new Error('Аккаунт не найден');

  const marketHashName = String(body.marketHashName || '').trim();
  if (!marketHashName) throw new Error('Укажи marketHashName');

  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Укажи price — цену ордера в ₽');
  }

  const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const appId = gameToAppId(acc.game);
  const session = botEngine.accountPool.getSession(accountId);
  if (!session?.market) throw new Error('steam-market не инициализирован — перелогинься');

  const unitKopecks = Math.round(price * 100);
  const traceId = crypto.randomUUID();

  await logManualDebugStep(botEngine.db, {
    traceId,
    accountId,
    appId,
    marketHashName,
    step: 'buy_order_request',
    ok: true,
    detail: {
      appId,
      marketHashName,
      priceRub: price,
      priceKopecks: unitKopecks,
      priceTotalKopecks: unitKopecks * quantity,
      amount: quantity,
      game: acc.game,
      dryRunIgnored: true,
    },
  });

  try {
    const result = await botEngine.rateLimiter.schedule(() =>
      postCreateBuyOrder(session.market, appId, marketHashName, price, quantity)
    );

    const accepted = isBuyOrderAccepted(result);

    await logManualDebugStep(botEngine.db, {
      traceId,
      accountId,
      appId,
      marketHashName,
      step: 'buy_order_response',
      ok: accepted,
      error: accepted ? null : buyOrderFailureMessage(result),
      detail: {
        accepted,
        steamSuccessCode: result?._data?.success ?? null,
        buyOrderId: result?.buyOrderId ?? null,
        note: accepted ? 'Ордер принят Steam' : buyOrderFailureHint(result),
        raw: result,
      },
    });

    if (!accepted) throw new Error(buyOrderFailureMessage(result));
    return { traceId, ok: true, result };
  } catch (err) {
    await logManualDebugStep(botEngine.db, {
      traceId,
      accountId,
      appId,
      marketHashName,
      step: 'buy_order_error',
      ok: false,
      error: err.message,
      detail: { steamResponse: err.steamResponse ?? err.response?.data ?? null },
    });
    throw err;
  }
}

async function fetchAllMyListings(market, pageSize = 100) {
  const buyOrders = [];
  const listings = [];
  let start = 0;
  let totalCount = 0;
  let success = true;
  let pages = 0;
  const maxPages = 20;

  while (pages < maxPages) {
    const page = await market.myListings(start, pageSize);
    if (!page?.success) {
      success = false;
      break;
    }
    totalCount = page.totalCount ?? totalCount;
    buyOrders.push(...(page.buyOrders ?? []));
    listings.push(...(page.listings ?? []));
    pages += 1;
    start += pageSize;
    if (start >= totalCount || !(page.listings?.length || page.buyOrders?.length)) break;
  }

  return { success, totalCount, buyOrders, listings, pagesFetched: pages, pageSize };
}

async function debugFetchMarketOrders(botEngine, accountId) {
  const acc = await get(botEngine.db, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) throw new Error('Аккаунт не найден');

  const session = botEngine.accountPool.getSession(accountId);
  if (!session?.market) throw new Error('steam-market не инициализирован — перелогинься');

  const traceId = crypto.randomUUID();

  try {
    const data = await botEngine.rateLimiter.schedule(() =>
      fetchAllMyListings(session.market)
    );

    await logManualDebugStep(botEngine.db, {
      traceId,
      accountId,
      step: 'my_listings',
      ok: Boolean(data?.success),
      detail: {
        success: data.success,
        totalCount: data.totalCount,
        fetchedBuyOrders: data.buyOrders.length,
        fetchedListings: data.listings.length,
        pagesFetched: data.pagesFetched,
        buyOrders: data.buyOrders.map((o) => ({
          buyOrderId: o.buyOrderId,
          hashName: o.hashName,
          price: o.price,
          quantity: o.quantity,
          quantityRemaining: o.quantityRemaining,
        })),
        listings: data.listings.map((l) => ({
          listingId: l.listingId,
          price: l.price,
          asset: l.asset,
        })),
      },
    });

    return { traceId, ok: Boolean(data?.success), data };
  } catch (err) {
    await logManualDebugStep(botEngine.db, {
      traceId,
      accountId,
      step: 'my_listings_error',
      ok: false,
      error: err.message,
    });
    throw err;
  }
}

async function debugRunSellTick(botEngine, accountId) {
  const acc = await get(botEngine.db, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) throw new Error('Аккаунт не найден');

  const row = await get(botEngine.db, 'SELECT config_json FROM strategy_config WHERE account_id = ?', [
    accountId,
  ]);
  const config = mergeStrategyConfig(acc.game, row?.config_json ? JSON.parse(row.config_json) : {});

  const traceId = crypto.randomUUID();
  await logManualDebugStep(botEngine.db, {
    traceId,
    accountId,
    step: 'sell_tick_manual',
    detail: { game: acc.game, dryRun: !!config.dryRun },
  });

  await botEngine.processAccountSell({ ...acc, config_json: row?.config_json }, config);

  await logManualDebugStep(botEngine.db, {
    traceId,
    accountId,
    step: 'sell_tick_manual_done',
    detail: { note: 'Смотри Логи (audit) для sell/dry_run_sell/inventory_error' },
  });

  return { traceId, ok: true };
}

module.exports = { debugScanInventory, debugTestBuyOrder, debugFetchMarketOrders, debugRunSellTick };
