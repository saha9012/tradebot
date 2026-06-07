/** 30 горизонтальных «ярусов» — узлы ставятся между ними по row (0…29). */
export const HORIZON_ROWS = 30;

/** Вертикальная полоса ветки (% viewport). */
const BAND_TOP = 26;
const BAND_HEIGHT = 48;

/** Горизонталь: блоки идут слева направо в этой полосе. */
const BRANCH_LEFT = 8;
const BRANCH_WIDTH = 84;

export const HORIZON_TRANSITION = { duration: 0.85, ease: [0.22, 1, 0.36, 1] };

export function rowToY(row) {
  const clamped = Math.max(0, Math.min(HORIZON_ROWS - 1, row));
  return BAND_TOP + (clamped / (HORIZON_ROWS - 1)) * BAND_HEIGHT;
}

export function colToX(col, totalCols = 7) {
  if (totalCols <= 1) return BRANCH_LEFT + BRANCH_WIDTH / 2;
  return BRANCH_LEFT + (col / (totalCols - 1)) * BRANCH_WIDTH;
}

/** Центральный антуражный блок — широкий, между первыми узлами. */
export const HORIZON_CENTER = {
  id: 'center',
  // центр экрана: блок должен быть независим от “ветки” (без параллакса)
  x: 50,
  y: rowToY(14),
  widthPct: 11,
  minHeight: 140,
};

export const HORIZON_NODES = [
  { id: 'overview', path: '/', label: 'Обзор', col: 0, row: 5 },
  { id: 'analytics', path: '/analytics', label: 'Аналитика', col: 2, row: 3 },
  // чтобы “Решения” не пересекалось с центральным блоком по x=50
  { id: 'decisions', path: '/decisions', label: 'Решения', col: 1, row: 11 },
  { id: 'history', path: '/history', label: 'Сделки', col: 3, row: 5 },
  { id: 'sales', path: '/sales', label: 'Продажа', col: 4, row: 2 },
  { id: 'compare', path: '/compare', label: 'Сравнение', col: 4, row: 17 },
  { id: 'debug', path: '/debug-fetch', label: 'Отладка', col: 5, row: 16 },
  { id: 'logs', path: '/logs', label: 'Логи', col: 5, row: 22 },
  { id: 'settings', path: '/settings', label: 'Настройки', col: 6, row: 13 },
];

/** Линии: breakAt < 1 — обрыв до цели; dashed — пунктир. */
export const HORIZON_EDGES = [
  { from: 'overview', to: 'analytics' },
  { from: 'overview', to: 'decisions', breakAt: 0.72, dashed: true },
  { from: 'analytics', to: 'decisions' },
  { from: 'decisions', to: 'history' },
  { from: 'history', to: 'sales', tone: 'violet' },
  { from: 'history', to: 'compare', tone: 'violet' },
  { from: 'history', to: 'debug', breakAt: 0.78 },
  { from: 'debug', to: 'logs' },
  { from: 'logs', to: 'settings', breakAt: 0.65, dashed: true },
];

export function nodeById(id) {
  return HORIZON_NODES.find((n) => n.id === id);
}

export function nodePosition(node) {
  return { x: colToX(node.col), y: rowToY(node.row) };
}

export function resolveEdgePoints(edge) {
  const fromNode = edge.from === 'center' ? HORIZON_CENTER : nodeById(edge.from);
  const toNode = edge.to === 'center' ? HORIZON_CENTER : nodeById(edge.to);
  const from = edge.from === 'center' ? { x: fromNode.x, y: fromNode.y } : nodePosition(fromNode);
  const to = edge.to === 'center' ? { x: toNode.x, y: toNode.y } : nodePosition(toNode);
  const t = edge.breakAt ?? 1;
  return {
    x1: from.x,
    y1: from.y,
    x2: from.x + (to.x - from.x) * t,
    y2: from.y + (to.y - from.y) * t,
    dashed: edge.dashed ?? false,
    dim: edge.dim ?? false,
  };
}
