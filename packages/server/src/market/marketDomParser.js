/**
 * Парсинг ответов Steam market (search/render, listings/.../render, histogram JSON).
 * Без Playwright и без десятка параллельных стратегий.
 */

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function centsToRub(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Number(cents) / 100;
}

function pickMaxCents(values) {
  const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/** "4,40 руб." → копейки */
function rubTextToCents(text) {
  const cleaned = String(text || '')
    .replace(/[^\d.,]/g, '')
    .replace(',', '.');
  const rub = parseFloat(cleaned);
  if (!Number.isFinite(rub) || rub <= 0) return null;
  return Math.round(rub * 100);
}

function isBuyCountText(text) {
  const t = String(text || '').trim();
  return t.length > 0 && /^[\d\s.,]+$/.test(t) && !/руб|₽|rub|\$|€|usd/i.test(t);
}

function isBuyPriceText(text) {
  return /руб|₽|rub|\$|€|usd|gbp/i.test(String(text || ''));
}

/** span.market_commodity_orders_header_promote — цена buy и число запросов. */
function parsePromotesFromFragment(fragment) {
  const inner = String(fragment || '');
  if (!inner) return { highestBuyCents: null, buyOrderCount: null };

  const promotes = [
    ...inner.matchAll(
      /<span[^>]*\bmarket_commodity_orders_header_promote\b[^>]*>([^<]*)<\/span>/gi
    ),
  ].map((m) => m[1].trim());

  let highestBuyCents = null;
  let buyOrderCount = null;

  const startLabel = inner.match(
    /(?:Starting at|Начальная цена)\s*:?\s*<span[^>]*\bmarket_commodity_orders_header_promote\b[^>]*>([^<]+)<\/span>/i
  );
  if (startLabel) {
    highestBuyCents = rubTextToCents(startLabel[1]);
  }

  for (const text of promotes) {
    if (highestBuyCents == null && isBuyPriceText(text)) {
      highestBuyCents = rubTextToCents(text);
    }
    if (buyOrderCount == null && isBuyCountText(text)) {
      buyOrderCount = Number(text.replace(/\s/g, '').replace(/,/g, '')) || null;
    }
  }

  const countLabel = inner.match(
    /(?:Buy requests|Запросов на покупку)\s*:?\s*<span[^>]*\bmarket_commodity_orders_header_promote\b[^>]*>\s*([\d\s.,]+)<\/span>/i
  );
  if (countLabel && buyOrderCount == null) {
    buyOrderCount = Number(countLabel[1].replace(/\s/g, '').replace(/,/g, '')) || null;
  }

  return { highestBuyCents, buyOrderCount };
}

/**
 * #market_commodity_buyrequests — если блок есть; иначе пусто (см. parsePromoteBuyFromPage).
 */
function parseCommodityBuyRequestsBlock(html) {
  const decoded = decodeHtmlEntities(html);
  const idIdx = decoded.search(/\bid=["']market_commodity_buyrequests["']/i);
  if (idIdx < 0) return { highestBuyCents: null, buyOrderCount: null };

  const slice = decoded.slice(idIdx, idIdx + 6000);
  const openEnd = slice.indexOf('>');
  if (openEnd < 0) return { highestBuyCents: null, buyOrderCount: null };
  return parsePromotesFromFragment(slice.slice(openEnd + 1));
}

/**
 * Buy со страницы лота: класс market_commodity_orders_header_promote (не item_nameid).
 * Ищет promote на всей странице, в buy_order_summary и в смежных блоках Steam.
 */
function parsePromoteBuyFromPage(html) {
  const decoded = decodeHtmlEntities(html);
  if (!decoded) {
    return { highestBuyCents: null, buyOrderCount: null, source: null };
  }

  const fromSummary = parseBuyOrderSummaryHtml(decoded);
  if (fromSummary.highestBuyCents != null) {
    return { ...fromSummary, source: 'buy_order_summary_class' };
  }

  const regions = [
    { re: /\bid=["']market_commodity_buyrequests["'][\s\S]{0,6000}/i, source: 'commodity_buyrequests' },
    { re: /market_buyorder_info[\s\S]{0,3500}/i, source: 'market_buyorder_info' },
    { re: /market_commodity_orders_header[\s\S]{0,3500}/i, source: 'commodity_orders_header' },
    {
      re: /(?:Buy requests|Запросов на покупку)[\s\S]{0,1200}/i,
      source: 'buy_requests_label',
    },
    { re: /market_commodity[\s\S]{0,8000}/i, source: 'market_commodity_section' },
  ];

  for (const { re, source } of regions) {
    const m = decoded.match(re);
    if (!m) continue;
    const parsed = parsePromotesFromFragment(m[0]);
    if (parsed.highestBuyCents != null) {
      return { ...parsed, source };
    }
  }

  if (/market_commodity_orders_header_promote/i.test(decoded)) {
    const parsed = parsePromotesFromFragment(decoded);
    if (parsed.highestBuyCents != null) {
      return { ...parsed, source: 'page_wide_promote' };
    }
  }

  return { highestBuyCents: null, buyOrderCount: null, source: null };
}

/** Цены в копейках из JSON-полей Steam (histogram, встроенный JSON). */
function parseJsonPriceFields(text) {
  const highestBuy = text.match(/"highest_buy_order"\s*:\s*"(\d+)"/i);
  const lowestSell = text.match(/"lowest_sell_order"\s*:\s*"(\d+)"/i);
  return {
    highestBuyCents: highestBuy ? Number(highestBuy[1]) : null,
    lowestSellCents: lowestSell ? Number(lowestSell[1]) : null,
  };
}

function parseItemNameIdFromText(text) {
  if (!text) return null;
  const spread = text.match(/Market_LoadOrderSpread\s*\(\s*(\d+)\s*\)/i);
  if (spread) return spread[1];
  const embedded = text.match(/item_nameid["'\s:]+(\d{4,15})/i);
  if (embedded) return embedded[1];
  const hist = text.match(/itemordershistogram[^"']*item_nameid=(\d{4,15})/i);
  if (hist) return hist[1];
  return null;
}

/** data-price и классы buy/sell в HTML. */
function parseHtmlPriceFields(html) {
  const decoded = decodeHtmlEntities(html);
  const sellPrices = [];
  const buyPrices = [];

  const allDataPrice = [...decoded.matchAll(/\bdata-price="(\d+)"/gi)];
  for (const m of allDataPrice) sellPrices.push(Number(m[1]));

  const buyBlocks = [
    ...decoded.matchAll(
      /market_listing_buyorder[\s\S]{0,500}?\bdata-price="(\d+)"/gi
    ),
    ...decoded.matchAll(
      /buyorder[\s\S]{0,300}?\bdata-price="(\d+)"/gi
    ),
    ...decoded.matchAll(
      /market_commodity_buyrequests[\s\S]{0,800}?\bdata-price="(\d+)"/gi
    ),
  ];
  for (const m of buyBlocks) buyPrices.push(Number(m[1]));

  const normalSell = [
    ...decoded.matchAll(
      /class="[^"]*normal_price[^"]*"[^>]*\bdata-price="(\d+)"/gi
    ),
  ];
  for (const m of normalSell) sellPrices.push(Number(m[1]));

  return {
    highestBuyCents: pickMaxCents(buyPrices),
    lowestSellCents: pickMaxCents(sellPrices),
  };
}

/** buy_order_summary из histogram — тот же DOM, что #market_commodity_buyrequests. */
function parseBuyOrderSummaryHtml(text) {
  let inner = '';
  if (text && typeof text === 'object' && text.buy_order_summary) {
    inner = String(text.buy_order_summary);
  } else {
    const m = String(text || '').match(
      /"buy_order_summary"\s*:\s*"((?:\\.|[^"\\])*)"/i
    );
    if (!m) return { highestBuyCents: null, buyOrderCount: null };
    inner = m[1]
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }
  if (!inner.trim()) return { highestBuyCents: null, buyOrderCount: null };
  return parsePromotesFromFragment(inner);
}

/** JSON itemordershistogram (без Playwright): те же классы или поля highest_buy_order. */
function parseHistogramBuyFields(hist) {
  if (!hist || hist.success !== 1) {
    return { highestBuyCents: null, buyOrderCount: null, source: null };
  }

  const fromSummary = parseBuyOrderSummaryHtml(hist);
  if (fromSummary.highestBuyCents != null) {
    return { ...fromSummary, source: 'buy_order_summary_dom' };
  }

  let highestBuyCents = null;
  const rawHigh = hist.highest_buy_order;
  if (rawHigh != null && String(rawHigh).trim() !== '') {
    const n = Number(String(rawHigh).replace(/\s/g, ''));
    if (Number.isFinite(n) && n > 0) highestBuyCents = n;
  }
  if (highestBuyCents == null && hist.buy_order_price) {
    highestBuyCents = rubTextToCents(hist.buy_order_price);
  }

  let buyOrderCount = null;
  if (hist.buy_order_count != null && String(hist.buy_order_count).trim() !== '') {
    buyOrderCount = Number(String(hist.buy_order_count).replace(/\s/g, '')) || null;
  }

  return {
    highestBuyCents,
    buyOrderCount,
    source: highestBuyCents != null ? 'histogram_json' : null,
  };
}

/**
 * Всё из одного тела ответа (HTML, JSON строка, объект).
 */
function parseSteamMarketBlob(body) {
  let text = '';
  if (body == null) text = '';
  else if (typeof body === 'string') text = body;
  else text = JSON.stringify(body);

  const html =
    typeof body === 'object' && body?.results_html
      ? decodeHtmlEntities(body.results_html)
      : text;

  const fromJson = parseJsonPriceFields(text);
  const fromHtml = parseHtmlPriceFields(html);
  const fromSummary = parseBuyOrderSummaryHtml(text);
  const fromPromote = parsePromoteBuyFromPage(html);
  const fromHistObj =
    typeof body === 'object' && body?.success === 1
      ? parseHistogramBuyFields(body)
      : { highestBuyCents: null, buyOrderCount: null };
  const itemNameId = parseItemNameIdFromText(text);

  return {
    itemNameId,
    highestBuyCents:
      fromPromote.highestBuyCents ??
      fromSummary.highestBuyCents ??
      fromHistObj.highestBuyCents ??
      fromJson.highestBuyCents ??
      fromHtml.highestBuyCents,
    lowestSellCents:
      fromJson.lowestSellCents ?? fromHtml.lowestSellCents,
    buyOrderCount:
      fromPromote.buyOrderCount ??
      fromSummary.buyOrderCount ??
      fromHistObj.buyOrderCount,
  };
}

function hashNameFromListingHref(href) {
  if (!href) return null;
  const m = href.match(/\/market\/listings\/\d+\/(.+?)(?:\?|#|$)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function parseQtyFromRow(rowHtml) {
  const m = rowHtml.match(/market_listing_num_listings_qty[^>]*>(\d+)/i);
  return m ? Number(m[1]) : null;
}

function parseBuyFromSearchRow(rowHtml) {
  return parseHtmlPriceFields(rowHtml).highestBuyCents;
}

/**
 * @param {string} resultsHtml
 */
function parseMarketSearchResultsHtml(resultsHtml) {
  if (!resultsHtml || typeof resultsHtml !== 'string') return [];

  const html = decodeHtmlEntities(resultsHtml);
  const items = [];
  const rowRe =
    /<a\b[^>]*\bmarket_listing_row_link\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = rowRe.exec(html)) !== null) {
    const listingUrl = match[1].replace(/\\\//g, '/');
    const rowHtml = match[2];
    const hashName =
      (() => {
        const attr = rowHtml.match(/\bdata-hash-name="([^"]+)"/i);
        if (attr) {
          try {
            return decodeURIComponent(attr[1]);
          } catch {
            return attr[1];
          }
        }
        return hashNameFromListingHref(listingUrl);
      })() || null;

    if (!hashName) continue;

    const nameMatch = rowHtml.match(/market_listing_item_name[^>]*>([^<]+)</i);
    const name = nameMatch ? nameMatch[1].trim() : null;

    const rowPrices = parseHtmlPriceFields(rowHtml);
    let sellPriceCents = rowPrices.lowestSellCents;
    const buyPriceCents = rowPrices.highestBuyCents;

    if (sellPriceCents == null) {
      const dataPrice = rowHtml.match(/\bdata-price="(\d+)"/i);
      if (dataPrice) sellPriceCents = Number(dataPrice[1]);
    }

    items.push({
      hashName,
      name,
      sellPriceCents: Number.isFinite(sellPriceCents) ? sellPriceCents : null,
      buyPriceCents: Number.isFinite(buyPriceCents) ? buyPriceCents : null,
      qty: parseQtyFromRow(rowHtml),
      listingUrl: listingUrl.startsWith('http')
        ? listingUrl
        : `https://steamcommunity.com${listingUrl}`,
    });
  }

  return items;
}

function mergeSearchRenderPayload(data) {
  const fromHtml = parseMarketSearchResultsHtml(data?.results_html || '');
  const byHash = new Map(fromHtml.map((r) => [r.hashName, r]));

  const jsonRows = (data?.results || []).map((r) => {
    const hashName = r.hash_name || r.market_hash_name || r.name;
    const html = hashName ? byHash.get(hashName) : null;
    let sellPriceCents = r.sell_price != null ? Number(r.sell_price) : null;
    let buyPriceCents = null;
    if (html?.sellPriceCents != null) sellPriceCents = html.sellPriceCents;
    if (html?.buyPriceCents != null) buyPriceCents = html.buyPriceCents;

    return {
      hash_name: hashName,
      name: r.name || html?.name || hashName,
      sell_price: sellPriceCents,
      buy_price: buyPriceCents,
      qty: html?.qty ?? null,
      listing_url: html?.listingUrl ?? null,
    };
  });

  if (jsonRows.length) return jsonRows;

  return fromHtml.map((r) => ({
    hash_name: r.hashName,
    name: r.name || r.hashName,
    sell_price: r.sellPriceCents,
    buy_price: r.buyPriceCents,
    qty: r.qty,
    listing_url: r.listingUrl,
  }));
}

/**
 * Страница лота (listings/...): buy из #market_commodity_buyrequests, sell-лоты — опционально.
 */
function parseListingPageHtml(html) {
  if (!html || typeof html !== 'string') {
    return {
      itemNameId: null,
      highestBuyCents: null,
      lowestSellCents: null,
      buyOrderCount: null,
    };
  }

  const decoded = decodeHtmlEntities(html);
  const fromPromote = parsePromoteBuyFromPage(decoded);
  const itemNameId = parseItemNameIdFromText(decoded);

  let lowestSellCents = null;
  const feePrices = [
    ...decoded.matchAll(
      /market_listing_price_with_fee[^>]*>\s*([^<]+)</gi
    ),
  ];
  for (const m of feePrices) {
    const c = rubTextToCents(m[1]);
    if (c != null) {
      lowestSellCents = lowestSellCents == null ? c : Math.min(lowestSellCents, c);
    }
  }

  if (lowestSellCents == null) {
    const listingInfo = decoded.match(/g_rgListingInfo\s*=\s*(\{[\s\S]*?\});/i);
    if (listingInfo) {
      try {
        const info = JSON.parse(listingInfo[1]);
        const prices = Object.values(info)
          .map((row) => Number(row?.converted_price))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (prices.length) lowestSellCents = Math.min(...prices);
      } catch {
        /* ignore malformed embed */
      }
    }
  }

  return {
    itemNameId,
    highestBuyCents: fromPromote.highestBuyCents,
    lowestSellCents,
    buyOrderCount: fromPromote.buyOrderCount,
    buyPromoteSource: fromPromote.source,
  };
}

/** "34,701" → 34701 (продажи за 24ч в priceoverview). */
function parseOverviewVolume(volume) {
  if (volume == null) return null;
  const cleaned = String(volume).replace(/\s/g, '').replace(/,/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** GET /market/priceoverview/?appid=&currency=5&market_hash_name= */
function parsePriceOverviewResponse(body) {
  let root = body;
  if (typeof body === 'string') {
    try {
      root = JSON.parse(body);
    } catch {
      return {
        volume24h: null,
        volumeRaw: null,
        lowestPriceRub: null,
        medianPriceRub: null,
        error: 'priceoverview_not_json',
      };
    }
  }

  if (!root?.success) {
    return {
      volume24h: null,
      volumeRaw: null,
      lowestPriceRub: null,
      medianPriceRub: null,
      error: 'priceoverview_success_false',
    };
  }

  const volume24h = parseOverviewVolume(root.volume);
  return {
    volume24h,
    volumeRaw: root.volume ?? null,
    lowestPriceRub: root.lowest_price ? rubTextToCents(root.lowest_price) : null,
    medianPriceRub: root.median_price ? rubTextToCents(root.median_price) : null,
    error: volume24h == null ? 'priceoverview_no_volume' : null,
  };
}

/** Ответ /market/orderbook?q=Load&qp=[appId,"hash_name"] — цены в копейках (currency 5 = RUB). */
function parseOrderbookResponse(body) {
  let root = body;
  if (typeof body === 'string') {
    try {
      root = JSON.parse(body);
    } catch {
      return {
        highestBuyCents: null,
        lowestSellCents: null,
        buyOrderCount: null,
        sellOrderCount: null,
        amtMaxBuyOrder: null,
        amtMinSellOrder: null,
        error: 'orderbook_not_json',
      };
    }
  }

  if (!root?.success || !root?.data) {
    return {
      highestBuyCents: null,
      lowestSellCents: null,
      buyOrderCount: null,
      sellOrderCount: null,
      amtMaxBuyOrder: null,
      amtMinSellOrder: null,
      error: root?.success === false ? 'orderbook_success_false' : 'orderbook_no_data',
    };
  }

  const d = root.data;
  let highestBuyCents = Number(d.amtMaxBuyOrder);
  if (!Number.isFinite(highestBuyCents) || highestBuyCents <= 0) {
    const compact = d.rgCompactBuyOrders;
    if (Array.isArray(compact) && compact.length >= 1) {
      highestBuyCents = Number(compact[0]);
    } else {
      highestBuyCents = null;
    }
  }

  let lowestSellCents = Number(d.amtMinSellOrder);
  if (!Number.isFinite(lowestSellCents) || lowestSellCents <= 0) {
    const sellCompact = d.rgCompactSellOrders;
    if (Array.isArray(sellCompact) && sellCompact.length >= 1) {
      lowestSellCents = Number(sellCompact[0]);
    } else {
      lowestSellCents = null;
    }
  }

  const buyOrderCount =
    d.cBuyOrders != null ? Number(d.cBuyOrders) : null;
  const sellOrderCount =
    d.cSellOrders != null ? Number(d.cSellOrders) : null;

  return {
    highestBuyCents: Number.isFinite(highestBuyCents) && highestBuyCents > 0 ? highestBuyCents : null,
    lowestSellCents: Number.isFinite(lowestSellCents) && lowestSellCents > 0 ? lowestSellCents : null,
    buyOrderCount: Number.isFinite(buyOrderCount) ? buyOrderCount : null,
    sellOrderCount: Number.isFinite(sellOrderCount) ? sellOrderCount : null,
    amtMaxBuyOrder: d.amtMaxBuyOrder ?? null,
    amtMinSellOrder: d.amtMinSellOrder ?? null,
    error: null,
  };
}

function buildPriceRecord({ sellPriceCents, buyPriceCents, itemNameId, source }) {
  return {
    lowestListing: centsToRub(sellPriceCents),
    highestBuyOrder: centsToRub(buyPriceCents),
    itemNameId: itemNameId || null,
    sellPriceCents,
    buyPriceCents,
    priceSource: source || 'dom_parse',
  };
}

module.exports = {
  parseSteamMarketBlob,
  parsePriceOverviewResponse,
  parseOverviewVolume,
  parseOrderbookResponse,
  parseListingPageHtml,
  parsePromoteBuyFromPage,
  parsePromotesFromFragment,
  parseHistogramBuyFields,
  parseCommodityBuyRequestsBlock,
  parseMarketSearchResultsHtml,
  mergeSearchRenderPayload,
  hashNameFromListingHref,
  buildPriceRecord,
  parseItemNameIdFromText,
  centsToRub,
  rubTextToCents,
};
