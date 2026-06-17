/** Парсит сообщения проверка_лота из botEngine (формат не меняем). */
export function parseMarketCheckMessage(message) {
  if (!message || typeof message !== 'string') return null;

  const parts = message
    .trim()
    .replace(/\uFEFF/g, '')
    .split(/\s*\|\s*/)
    .map((p) => p.trim());
  if (parts.length < 3) return null;

  let item = parts[0];
  const mark = item.charAt(0);
  const isBuy = mark === '✓' || mark === '✔';
  const isSkip = mark === '✗' || mark === '✕' || mark === '×' || mark.toLowerCase() === 'x';
  if (!isBuy && !isSkip) return null;

  item = item.slice(1).trim();

  if (isBuy && parts.length >= 6) {
    const buyPart = parts[1].match(/buy\s+([\d.—-]+)\s*(?:→|->)\s*([\d.]+)/);
    const sellPart = parts[2].match(/sell\s+([\d.—-]+)/);
    const profitPart = parts[3].match(/\+([\d.]+)\s*[₽Pp]?/);
    if (!buyPart || !sellPart || !profitPart) return null;
    return {
      kind: 'buy',
      item,
      buyWas: buyPart[1],
      buyAt: buyPart[2],
      sell: sellPart[1],
      profit: profitPart[1],
      source: parts[4],
      liquidity: parts[5],
    };
  }

  if (isSkip) {
    const prices = parts[1].match(/buy\s+(.+?)\s+sell\s+(.+)/i);
    if (!prices) return null;
    const buyWas = prices[1].trim();
    const sell = prices[2].trim();

    if (parts.length >= 5) {
      return {
        kind: 'skip',
        item,
        buyWas,
        sell,
        reason: parts[2],
        source: parts[3],
        liquidity: parts[4],
      };
    }

    if (parts.length === 3) {
      return {
        kind: 'skip',
        item,
        buyWas,
        sell,
        reason: parts[2],
        source: '—',
        liquidity: '—',
      };
    }
  }

  return null;
}

export const ACTION_LABELS = {
  login: 'вход',
  logout: 'выход',
  login_failed: 'ошибка_входа',
  wallet_fetch_failed: 'ошибка_кошелька',
  market_init_failed: 'ошибка_маркета',
  tick_skip: 'пропуск_тика',
  scan_error: 'ошибка_сканирования',
  scan_empty: 'скан_пусто',
  scan_cycle: 'скан_цикл',
  market_check: 'проверка_лота',
  scan_tick_error: 'ошибка_тика',
  rate_limit_pause: 'пауза_лимита',
  steam_error: 'ошибка_steam',
  dry_run_sell: 'тест_продажа',
  sell: 'продажа',
  sell_skip: 'пропуск_продажи',
  inventory_error: 'ошибка_инвентаря',
  session_lost: 'сессия_потеряна',
  balance_threshold: 'порог_баланса',
  dry_run_buy: 'тест_покупка',
  buy: 'покупка',
  buy_failed: 'ошибка_покупки',
  emergency_stop: 'аварийная_остановка',
  relist_window: 'окно_перевыставления',
  relist_done: 'перевыставление_готово',
  relist_failed: 'ошибка_перевыставления',
  sales_sync_warn: 'синк_продажи',
  inventory_skip: 'инвентарь_пропуск',
};

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || '—';
}
