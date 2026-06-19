/** Контейнер void-stack внутри app-слоя (ниже hub-nav z-20). */
export function getVoidStackMount() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('void-stack-mount') || document.body;
}
