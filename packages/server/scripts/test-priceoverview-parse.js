const { parsePriceOverviewResponse } = require('../src/market/marketDomParser');
const { PriceFetcher } = require('../src/providers/steam/priceFetcher');

const sample = {
  success: true,
  lowest_price: '66,98 руб.',
  volume: '34,701',
  median_price: '65,75 руб.',
};

console.log(parsePriceOverviewResponse(sample));

const pf = new PriceFetcher(null, { schedule: (fn) => fn() });
console.log('dota url', pf.priceOverviewUrl(570, 'Dead Reckoning Chest'));
