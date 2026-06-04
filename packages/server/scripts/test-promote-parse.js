const { parsePromoteBuyFromPage, parseListingPageHtml } = require('../src/market/marketDomParser');

const listingHtml = `
<div id="market_commodity_buyrequests">
  <div class="market_commodity_orders_header">
    Запросов на покупку: <span class="market_commodity_orders_header_promote">1826</span>
  </div>
  <div class="market_commodity_orders_header">
    Начальная цена: <span class="market_commodity_orders_header_promote">4,40 руб.</span>
  </div>
</div>`;

console.log('listing', parsePromoteBuyFromPage(listingHtml));
console.log('listing page', parseListingPageHtml(listingHtml));

const histJson = {
  success: 1,
  buy_order_summary:
    '<div>Запросов на покупку: <span class="market_commodity_orders_header_promote">99</span> Начальная цена: <span class="market_commodity_orders_header_promote">3,10 руб.</span></div>',
};

console.log('embedded summary', parsePromoteBuyFromPage(JSON.stringify(histJson)));

const { parseHistogramBuyFields } = require('../src/market/marketDomParser');
const steamHist = {
  success: 1,
  buy_order_summary:
    'Запросов на покупку: <span class="market_commodity_orders_header_promote">9528</span><br>Начальная цена: <span class="market_commodity_orders_header_promote">9,21 руб.</span>',
  highest_buy_order: '921',
};
console.log('histogram', parseHistogramBuyFields(steamHist));
