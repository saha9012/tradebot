const { needsBuyConfirmation } = require('./buyOrderResult');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildBuyOrderBody(market, appId, marketHashName, priceTotalKopecks, qty, confirmationId) {
  const body = new URLSearchParams({
    sessionid: market.getSessionId(),
    currency: String(market.getCurrency()),
    appid: String(appId),
    market_hash_name: marketHashName,
    price_total: String(priceTotalKopecks),
    quantity: String(qty),
    billing_state: '',
    save_my_address: '0',
    confirmation: confirmationId != null ? String(confirmationId) : '0',
  });
  return body;
}

async function postCreateBuyOrderOnce(market, appId, marketHashName, priceTotalKopecks, qty, confirmationId) {
  const body = buildBuyOrderBody(market, appId, marketHashName, priceTotalKopecks, qty, confirmationId);

  try {
    const response = await market.server.post('/createbuyorder', body.toString(), {
      headers: {
        Referer: `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`,
        Origin: 'https://steamcommunity.com',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });

    return normalizeBuyOrderResponse(response.data, priceTotalKopecks, qty);
  } catch (err) {
    const data = err.response?.data;
    if (data && typeof data === 'object' && data.success != null) {
      return normalizeBuyOrderResponse(data, priceTotalKopecks, qty);
    }
    throw err;
  }
}

function normalizeBuyOrderResponse(data, priceTotalKopecks, qty) {
  const body = data ?? {};
  return {
    _data: body,
    success: body.success === 1,
    buyOrderId: body.buy_orderid ? Number(body.buy_orderid) : null,
    priceTotalKopecks,
    quantity: qty,
  };
}

/**
 * Steam createbuyorder: price_total — сумма в копейках (целое число).
 * При success 22 / need_confirmation — confirmHandler, затем повтор с confirmation id.
 */
async function postCreateBuyOrder(market, appId, marketHashName, priceRub, quantity, confirmHandler = null) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const unitKopecks = Math.round(Number(priceRub) * 100);
  const priceTotalKopecks = unitKopecks * qty;

  try {
    let result = await postCreateBuyOrderOnce(
      market,
      appId,
      marketHashName,
      priceTotalKopecks,
      qty,
      null
    );
    result.unitKopecks = unitKopecks;

    if (needsBuyConfirmation(result) && confirmHandler) {
      const confId = result._data?.confirmation?.confirmation_id ?? null;
      await sleep(2000);
      await confirmHandler(confId);
      await sleep(1000);
      result = await postCreateBuyOrderOnce(
        market,
        appId,
        marketHashName,
        priceTotalKopecks,
        qty,
        confId
      );
      result.unitKopecks = unitKopecks;
      result.confirmed = true;
      if (confId) result.confirmationId = confId;
    }

    return result;
  } catch (err) {
    const steamData = err.response?.data;
    if (steamData && typeof steamData === 'object' && steamData.success != null) {
      const fallback = normalizeBuyOrderResponse(steamData, priceTotalKopecks, qty);
      fallback.unitKopecks = unitKopecks;
      return fallback;
    }
    const msg =
      steamData?.message ||
      err.message;
    const wrapped = new Error(msg);
    wrapped.steamResponse = steamData;
    throw wrapped;
  }
}

module.exports = { postCreateBuyOrder };
