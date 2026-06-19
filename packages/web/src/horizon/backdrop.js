export const HORIZON_INTERACTIVE_SELECTOR =
  '[data-horizon-surface], .account-card-interactive, .void-stack-panel, button, a, input, select, textarea, table, .btn, .table-wrap, .accordion, .badge';

export function isHorizonBackdropTarget(target) {
  return !target.closest(HORIZON_INTERACTIVE_SELECTOR);
}
