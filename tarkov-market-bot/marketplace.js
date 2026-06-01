// marketplace.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'items.json')));
const db = require('./database');

const jitter = (n) => (Math.floor(Math.random() * (n*2+1)) - n);

async function goClick(page, selector) {
  // Ждём элемент, плавно перемещаем мышь и кликаем
  await page.waitForSelector(selector, { timeout: 5000 });
  const rect = await page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  });
  const cx = rect.x + rect.w/2 + jitter(config.randomClickJitter);
  const cy = rect.y + rect.h/2 + jitter(config.randomClickJitter);
  await page.mouse.move(cx, cy, { steps: 6 });
  await page.mouse.click(cx, cy);
}

async function readText(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 2000 });
    const text = await page.$eval(selector, el => el.innerText || el.textContent || "");
    return text.trim();
  } catch (e) {
    return null;
  }
}

function parsePrice(str) {
  if (!str) return null;
  const cleaned = (str + '').replace(/[^\d,.\-]/g, '').replace(',', '.');
  const m = cleaned.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

async function checkFavoritesLoop() {
  console.log('[BOT] Launching browser...');
  const browser = await puppeteer.launch({ headless: config.headless === true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  await page.goto(config.marketplaceUrl, { waitUntil: 'networkidle2' });
  console.log('[BOT] Opened marketplace', config.marketplaceUrl);

  // Начинаем бесконечный цикл (можно заменить на while/cron)
  let boughtToday = 0;

  while (true) {
    try {
      // Перейти на страницу с избранным (если селектор представляет ссылку/кнопку — можно кликнуть)
      // Если `favoritesList` — контейнер, предполагается, что на странице уже открыт избранный
      // Получаем карточки избранного
      const itemHandles = await page.$$(config.selectors.favoriteItem);
      console.log(`[BOT] Found ${itemHandles.length} favorite cards`);

      for (let i = 0; i < itemHandles.length; i++) {
        const handle = itemHandles[i];

        // Попытка прочитать текст цены прямо с карточки
        let priceText = null;
        try {
          priceText = await handle.$eval(config.selectors.cardPrice, el => el.innerText || el.textContent);
        } catch (e) {
          // селектор цены на карточке не найден — пропустим
        }
        const parsed = parsePrice(priceText);
        console.log(`[BOT] Card ${i}: priceText='${priceText}' parsed=${parsed}`);

        // Найдём item в нашей базе по имени (или по индексу)
        // Для примера — берём item из items.json по имени в карточке (если есть)
        let nameText = null;
        try {
          nameText = await handle.$eval('img, .item-name, .title', el => el.alt || el.innerText || el.getAttribute('title') || "");
        } catch (e) {
          // ignore
        }

        // Здесь простая фильтрация: если цена <= max_price_per_unit => покупаем
        const target = items.find(it => it.enabled && nameText && nameText.toLowerCase().includes(it.name.toLowerCase()));
        if (!target && parsed !== null) {
          // также можно check by index/order — left as improvement
        }

        if (target && parsed !== null) {
          const fee = (target.batch_mode ? config.listingFeePerUnit / Math.max(1, target.batch_size) : config.listingFeePerUnit);
          const effective = parsed + fee;
          if (effective <= target.max_price_per_unit) {
            console.log(`[BOT] Candidate: ${target.name} price ${parsed} effective ${effective} <= limit ${target.max_price_per_unit}`);

            // Заходим в карточку (переходим в детальную страницу) и перепроверяем цену в детальной странице
            try {
              await handle.click(); // клик на карточку; можно заменить на goClick(page, selector)
              await page.waitForTimeout(600 + Math.random()*600);

              const detailPriceText = await readText(page, config.selectors.detailPrice);
              const detailParsed = parsePrice(detailPriceText);
              console.log(`[BOT] Detail price: raw='${detailPriceText}' parsed=${detailParsed}`);

              // Подтверждение: сравниваем detailParsed и parsed. Если ок — совершаем покупку (или имитируем)
              if (detailParsed !== null && detailParsed === parsed) {
                console.log('[BOT] Price stable in detail -> proceed to buy (or simulate)');
                if (config.testMode) {
                  console.log('[BOT][TEST MODE] would press buy now');
                  await db.logPurchase(target.name, parsed, null, 'TEST_BUY'); // логим тестовую покупку
                } else {
                  // Непосредственно клик на кнопку покупки
                  await goClick(page, config.selectors.buyButton);
                  await page.waitForTimeout(200 + Math.random()*500);
                  // Подтверждение
                  if (config.selectors.confirmBuy) {
                    await goClick(page, config.selectors.confirmBuy);
                  }
                  // логируем
                  await db.logPurchase(target.name, parsed, null, 'AUTO_BOUGHT');
                }
                boughtToday++;
                if (boughtToday >= config.dailyBuyLimit) {
                  console.log('[BOT] Daily buy limit reached, sleeping for 1 hour');
                  await page.waitForTimeout(1000 * 60 * 60); // 1 hour
                }
              } else {
                console.log('[BOT] Detail price mismatch or not found — skipping');
              }

              // Возвращаемся назад (history) или закрываем карточку (зависит от UI)
              try {
                await page.goBack();
              } catch (e) {
                // ignore
              }
              await page.waitForTimeout(400 + Math.random()*800);
            } catch (err) {
              console.error('[BOT] Error during buy flow:', err);
              try { await page.goBack(); } catch(e){}
            }
          }
        } // end if target
        // Пауза между карточками
        await page.waitForTimeout(config.pollIntervalMs + Math.floor(Math.random() * 500));
      } // end for each card

      // Пауза между полными проходами
      await page.waitForTimeout(1000 + Math.floor(Math.random() * 2000));
    } catch (e) {
      console.error('[BOT] Top loop error:', e);
      await page.waitForTimeout(2000);
    }
  } // end while

  // (we never reach here in current design)
  // await browser.close();
}

module.exports = { checkFavoritesLoop };
