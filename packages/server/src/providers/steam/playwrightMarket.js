const fs = require('fs');
const path = require('path');
const { dbPath } = require('../../config');
const { isValidItemNameId } = require('../../db/itemNameIdStore');
const {
  parseCommodityBuyRequestsBlock,
  parseItemNameIdFromText,
} = require('../../market/marketDomParser');

/** cookies из steam-user: массив строк "name=value". */
function parseSteamWebCookies(webCookies, sessionID) {
  const rawList = Array.isArray(webCookies) ? [...webCookies] : [];
  if (sessionID && !rawList.some((c) => c.startsWith('sessionid='))) {
    rawList.push(`sessionid=${sessionID}`);
  }

  const playwrightCookies = [];
  const seen = new Set();

  for (const raw of rawList) {
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const name = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (!name || !value) continue;

    const domains = [
      '.steamcommunity.com',
      'steamcommunity.com',
      '.steampowered.com',
      'store.steampowered.com',
    ];
    for (const domain of domains) {
      const key = `${domain}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      playwrightCookies.push({
        name,
        value,
        domain,
        path: '/',
        secure: true,
        httpOnly: name === 'sessionid' || name.startsWith('steamLogin'),
        sameSite: 'Lax',
      });
    }
  }
  return playwrightCookies;
}

function parseCookieHeader(cookieHeader, sessionID) {
  if (!cookieHeader) return parseSteamWebCookies([], sessionID);
  const parts = cookieHeader.split(';').map((p) => p.trim()).filter(Boolean);
  return parseSteamWebCookies(parts, sessionID);
}

/** Cookies из request-jar steamcommunity (полнее, чем webCookies). */
function cookiesFromCommunityJar(community) {
  return new Promise((resolve) => {
    const jar = community?._jar;
    if (!jar || typeof jar.getCookies !== 'function') {
      resolve([]);
      return;
    }
    jar.getCookies('https://steamcommunity.com/market/', (err, cookies) => {
      if (err || !cookies?.length) {
        resolve([]);
        return;
      }
      resolve(
        cookies.map((c) => ({
          name: c.key,
          value: c.value,
          domain: c.domain?.startsWith('.') ? c.domain : `.${c.domain || 'steamcommunity.com'}`,
          path: c.path || '/',
          secure: c.secure !== false,
          httpOnly: Boolean(c.httpOnly),
          sameSite: 'Lax',
        }))
      );
    });
  });
}

function mergePlaywrightCookies(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const c of list || []) {
      if (!c?.name) continue;
      map.set(`${c.domain}|${c.name}`, c);
    }
  }
  return [...map.values()];
}

function histogramToPrices(body) {
  if (!body || (body.success !== 1 && body.success !== true)) return null;
  const lowest = body.lowest_sell_order != null ? Number(body.lowest_sell_order) / 100 : null;
  const highest = body.highest_buy_order != null ? Number(body.highest_buy_order) / 100 : null;
  if (lowest == null || highest == null) return null;
  return {
    lowestListing: lowest,
    highestBuyOrder: highest,
    raw: body,
  };
}

function extractNameIdFromText(text) {
  if (!text) return null;
  const spread = text.match(/Market_LoadOrderSpread\s*\(\s*(\d+)\s*\)/);
  if (spread) return spread[1];
  const hist = text.match(/itemordershistogram[^"']*item_nameid=(\d+)/i);
  if (hist) return hist[1];
  const embedded = text.match(/item_nameid["'\s:]+(\d+)/i);
  return embedded ? embedded[1] : null;
}

async function saveDebugScreenshot(page, label) {
  try {
    const dir = path.join(path.dirname(dbPath), 'playwright-debug');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${label}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch {
    return null;
  }
}

/**
 * Headless Chrome с полной сессией Steam (как SIH в браузере).
 */
async function probePlaywrightMarket(
  listingUrl,
  { cookieHeader, webCookies, sessionID, community } = {},
  { timeoutMs = 60_000 } = {}
) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    return {
      itemNameId: null,
      prices: null,
      meta: { error: 'Пакет playwright не установлен' },
      error: 'npm install playwright && npx playwright install chromium',
    };
  }

  const fromJar = community ? await cookiesFromCommunityJar(community) : [];
  const fromWeb = webCookies?.length
    ? parseSteamWebCookies(webCookies, sessionID)
    : parseCookieHeader(cookieHeader, sessionID);
  const cookies = mergePlaywrightCookies([fromJar, fromWeb]);

  if (!cookies.length) {
    return {
      itemNameId: null,
      prices: null,
      meta: { error: 'нет cookies' },
      error: 'нужен вход в Steam',
    };
  }

  let capturedNameId = null;
  let capturedHistogram = null;
  const networkUrls = [];

  const headless = process.env.BOT_PLAYWRIGHT_HEADED !== 'true';

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ru-RU',
      viewport: { width: 1280, height: 900 },
    });
    await context.addCookies(cookies);
    const page = await context.newPage();

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('itemordershistogram')) return;
      networkUrls.push(`${response.status()} ${url.slice(0, 180)}`);
      const m = url.match(/item_nameid=(\d+)/);
      if (m) capturedNameId = capturedNameId || m[1];
      try {
        const json = await response.json();
        if (json?.success === 1 || json?.success === true) capturedHistogram = json;
      } catch {
        /* ignore */
      }
    });

    await page.goto('https://steamcommunity.com/market/', {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await page.waitForTimeout(1500);

    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const ageBtn = page.locator('#agegate_btn_continue, .agegate_btn_continue');
    if (await ageBtn.count()) {
      await ageBtn.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    try {
      await page.waitForFunction(
        () => {
          const html = document.documentElement.innerHTML;
          return (
            /Market_LoadOrderSpread\s*\(\s*\d+\s*\)/.test(html) ||
            html.includes('itemordershistogram')
          );
        },
        { timeout: 25_000 }
      );
    } catch {
      await page.waitForTimeout(5000);
    }

    const pageDiag = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      let steamId = null;
      try {
        if (typeof g_steamID !== 'undefined' && g_steamID) steamId = String(g_steamID);
      } catch {
        /* ignore */
      }
      return {
        steamId,
        hasSpreadFn: typeof Market_LoadOrderSpread === 'function',
        hasSpreadInHtml: /Market_LoadOrderSpread\s*\(\s*\d+\s*\)/.test(html),
        hasListingRows: html.includes('market_listing_row') || html.includes('market_commodity'),
        hasLoginPrompt: html.includes('joinsteam') || html.includes('g_steamid = false'),
        finalUrl: window.location.href,
      };
    });

    if (!capturedNameId && pageDiag.hasSpreadInHtml) {
      capturedNameId = await page.evaluate(() => {
        const m = document.documentElement.innerHTML.match(
          /Market_LoadOrderSpread\s*\(\s*(\d+)\s*\)/
        );
        return m ? m[1] : null;
      });
    }

    if (!capturedNameId) {
      capturedNameId = extractNameIdFromText(await page.content());
    }

    const prices = histogramToPrices(capturedHistogram);
    const title = await page.title().catch(() => null);
    const itemNameId = isValidItemNameId(capturedNameId) ? String(capturedNameId) : null;

    let screenshot = null;
    if (!itemNameId) {
      screenshot = await saveDebugScreenshot(page, 'fail');
    }

    const meta = {
      via: 'playwright',
      url: listingUrl,
      title,
      finalUrl: pageDiag.finalUrl,
      steamId: pageDiag.steamId,
      hasSpreadFn: pageDiag.hasSpreadFn,
      hasSpreadInHtml: pageDiag.hasSpreadInHtml,
      hasListingRows: pageDiag.hasListingRows,
      hasLoginPrompt: pageDiag.hasLoginPrompt,
      capturedHistogram: Boolean(capturedHistogram),
      networkHistogramCalls: networkUrls.length,
      networkSamples: networkUrls.slice(0, 3),
      cookieCount: cookies.length,
      uniqueCookieNames: [...new Set(cookies.map((c) => c.name))],
      cookieSource: fromJar.length ? 'community_jar+web' : 'web_only',
      hasSessionId: cookies.some((c) => c.name === 'sessionid'),
      screenshot,
    };

    let error = null;
    if (!itemNameId) {
      if (pageDiag.hasLoginPrompt || !pageDiag.steamId) {
        error = 'в браузере не залогинены (проверьте cookies / перелогин)';
      } else if (!pageDiag.hasListingRows) {
        error = 'страница лота без блока маркета (ограничение аккаунта или лот)';
      } else {
        error = 'Market_LoadOrderSpread / histogram XHR не появились';
      }
    }

    return { itemNameId, prices, meta, error };
  } finally {
    await browser.close();
  }
}

/**
 * Открывает страницу лота как в браузере и парсит #market_commodity_buyrequests
 * (2-й .market_commodity_orders_header_promote = макс. buy).
 */
async function safeCloseBrowser(browser) {
  if (!browser) return;
  try {
    await Promise.race([
      browser.close(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    /* ignore */
  }
}

async function fetchListingBuyBlockHtml(
  listingUrl,
  { cookieHeader, webCookies, sessionID, community } = {},
  { timeoutMs = 28_000 } = {}
) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    return {
      highestBuyCents: null,
      buyOrderCount: null,
      itemNameId: null,
      hasBuyBlock: false,
      error: 'playwright не установлен (npm install playwright && npx playwright install chromium)',
    };
  }

  const fromJar = community ? await cookiesFromCommunityJar(community) : [];
  const fromWeb = webCookies?.length
    ? parseSteamWebCookies(webCookies, sessionID)
    : parseCookieHeader(cookieHeader, sessionID);
  const cookies = mergePlaywrightCookies([fromJar, fromWeb]);

  if (!cookies.length) {
    return {
      highestBuyCents: null,
      buyOrderCount: null,
      itemNameId: null,
      hasBuyBlock: false,
      error: 'нет cookies — войди в Steam',
    };
  }

  const headless = process.env.BOT_PLAYWRIGHT_HEADED !== 'true';
  let browser;
  try {
    browser = await chromium.launch({
      headless,
      timeout: 15_000,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  } catch (e) {
    return {
      highestBuyCents: null,
      buyOrderCount: null,
      itemNameId: null,
      hasBuyBlock: false,
      error: `chromium.launch: ${e.message}`,
    };
  }

  const navTimeout = Math.min(timeoutMs, 22_000);
  const selectorTimeout = Math.min(14_000, navTimeout);

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ru-RU',
      viewport: { width: 1280, height: 900 },
    });
    context.setDefaultTimeout(selectorTimeout);
    await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(navTimeout);
    page.setDefaultTimeout(selectorTimeout);

    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });

    const ageBtn = page.locator('#agegate_btn_continue, .agegate_btn_continue');
    if (await ageBtn.count()) {
      await ageBtn.first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    try {
      await page.waitForSelector(
        '#market_commodity_buyrequests .market_commodity_orders_header_promote',
        { timeout: selectorTimeout }
      );
    } catch {
      await page.waitForTimeout(1500);
    }

    const html = await page.content();
    const block = parseCommodityBuyRequestsBlock(html);
    const rawNameId = parseItemNameIdFromText(html);
    const itemNameId = isValidItemNameId(rawNameId) ? rawNameId : null;

    return {
      highestBuyCents: block.highestBuyCents,
      buyOrderCount: block.buyOrderCount,
      itemNameId,
      hasBuyBlock: block.highestBuyCents != null,
      error: block.highestBuyCents == null ? 'нет блока buy на странице лота' : null,
    };
  } catch (e) {
    return {
      highestBuyCents: null,
      buyOrderCount: null,
      itemNameId: null,
      hasBuyBlock: false,
      error: e.message || String(e),
    };
  } finally {
    await safeCloseBrowser(browser);
  }
}

module.exports = {
  probePlaywrightMarket,
  fetchListingBuyBlockHtml,
  parseSteamWebCookies,
  parseCookieHeader,
  cookiesFromCommunityJar,
};
