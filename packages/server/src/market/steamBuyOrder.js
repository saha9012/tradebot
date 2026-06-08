/**
 * Steam createbuyorder: price_total — сумма в копейках (целое число).
 * steam-market при quantity > 1 шлёт десятичные рубли → Steam читает как копейки → «minimum price».
 */
async function postCreateBuyOrder(market, appId, marketHashName, priceRub, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const unitKopecks = Math.round(Number(priceRub) * 100);
  const priceTotalKopecks = unitKopecks * qty;

  const body = new URLSearchParams({
    sessionid: market.getSessionId(),
    currency: String(market.getCurrency()),
    appid: String(appId),
    market_hash_name: marketHashName,
    price_total: String(priceTotalKopecks),
    quantity: String(qty),
    billing_state: '',
    save_my_address: '0',
  });

  try {
    const response = await market.server.post('/createbuyorder', body.toString(), {
      headers: {
        Referer: `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`,
        Origin: 'https://steamcommunity.com',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });

    const data = response.data ?? {};
    return {
      _data: data,
      success: data.success === 1,
      buyOrderId: data.buy_orderid ? Number(data.buy_orderid) : null,
      unitKopecks,
      priceTotalKopecks,
      quantity: qty,
    };
  } catch (err) {
    const steamData = err.response?.data;
    const msg =
      steamData?.message ||
      (steamData?.success != null ? `Steam success=${steamData.success}` : null) ||
      err.message;
    const wrapped = new Error(msg);
    wrapped.steamResponse = steamData;
    throw wrapped;
  }
}

module.exports = { postCreateBuyOrder };
