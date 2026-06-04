const { parseOrderbookResponse } = require('../src/market/marketDomParser');

const sample = {
  success: true,
  data: {
    amtMaxBuyOrder: 1940,
    amtMinSellOrder: 2178,
    eCurrency: 5,
    cBuyOrders: 247518,
    cSellOrders: 21042,
    rgCompactBuyOrders: [1940, 1183],
    rgCompactSellOrders: [2178, 2],
  },
};

const r = parseOrderbookResponse(sample);
console.log(r);
console.log('buy rub', r.highestBuyCents / 100);
