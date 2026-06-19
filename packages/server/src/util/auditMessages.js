/** Русские подписи действий и перевод типичных ошибок Steam. */

const ACTION_RU = {
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
  auto_login: 'автовход',
  auto_login_failed: 'ошибка_автовхода',
  auto_start: 'автостарт',
  dry_run_sell: 'тест_продажа',
  sell: 'продажа',
  sell_skip: 'пропуск_продажи',
  inventory_error: 'ошибка_инвентаря',
  session_lost: 'сессия_потеряна',
  balance_threshold: 'порог_баланса',
  dry_run_buy: 'тест_покупка',
  buy: 'покупка',
  buy_failed: 'ошибка_покупки',
  sell_pending: 'продажа_ожидает',
  emergency_stop: 'аварийная_остановка',
  relist_window: 'окно_перевыставления',
  relist_done: 'перевыставление_готово',
  relist_failed: 'ошибка_перевыставления',
  max_item_price: 'пропуск_цена',
  profit_percent_low: 'пропуск_прибыль_низ',
  profit_percent_high: 'пропуск_прибыль_высок',
  cs2_filter_excluded: 'пропуск_cs2_фильтр',
  high_tier_profit_cap: 'пропуск_прибыль_дорого',
  scam_skip: 'пропуск_скам',
  min_profit: 'пропуск_мало_прибыли',
  no_price_data: 'пропуск_нет_цен',
  low_liquidity: 'пропуск_ликвид_день',
  low_liquidity_week: 'пропуск_ликвид_неделя',
  lane_disabled: 'полоса_выключена',
  unknown_game: 'неизвестная_игра',
  no_netSell_data: 'пропуск_нет_выручки',
};

const ERROR_PATTERNS = [
  [/no items matching your search/i, 'По запросу ничего не найдено. Бот попробует другой поисковый запрос на следующем цикле.'],
  [/не обнаружены предметы/i, 'По запросу ничего не найдено. Бот попробует другой поисковый запрос на следующем цикле.'],
  [/not logged in/i, 'Аккаунт не в сети — нажмите «Войти» в настройках.'],
  [/login timeout/i, 'Таймаут входа в Steam (нет webSession).'],
  [/429/i, 'Слишком много запросов к Steam (429). Бот подождёт.'],
  [/wallet/i, 'Не удалось получить баланс кошелька Steam.'],
  [/Success is not true/i, 'Steam вернул неуспешный ответ при поиске на маркете.'],
  [/No results_html/i, 'Пустой ответ маркета Steam при поиске.'],
];

function translateError(message) {
  if (!message) return message;
  for (const [re, ru] of ERROR_PATTERNS) {
    if (re.test(message)) return ru;
  }
  return message;
}

function actionRu(action) {
  return ACTION_RU[action] || action;
}

function formatSkipReason(reason, meta = {}) {
  if (reason === 'cs2_filter_excluded' && meta.categoryLabel) {
    return `фильтр CS2: ${meta.categoryLabel}`;
  }
  const map = {
    max_item_price: 'цена выше лимита',
    profit_percent_low: 'прибыль % ниже минимума',
    profit_percent_high: 'прибыль % выше максимума',
    cs2_filter_excluded: 'исключено фильтром CS2',
    high_tier_profit_cap: 'слишком высокая прибыль % (дорогой лот)',
    scam_skip: 'подозрительно высокая прибыль %',
    min_profit: 'мало прибыли (₽)',
    low_liquidity: 'мало продаж за сутки',
    liquidity_tier: 'ликвидность ниже тира ордера',
    low_liquidity_week: 'мало продаж за неделю',
    no_price_data: 'нет цены с маркета',
    no_buy_order_data: 'нет ордербука (buy), только цена продажи',
    no_netSell_data: 'нет данных по выручке (оценка)',
    lane_disabled: 'игра отключена в стратегии',
    unknown_game: 'неизвестная игра',
  };
  return map[reason] || reason;
}

module.exports = { ACTION_RU, translateError, actionRu, formatSkipReason };
