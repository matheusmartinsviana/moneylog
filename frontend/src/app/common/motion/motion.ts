/**
 * Movimento ligado? Desligado por `data-motion="off"` no `<html>` (testes, e2e) ou por
 * `prefers-reduced-motion: reduce`. Lido a cada chamada (barato) para respeitar mudanças em tempo de execução.
 */
export function motionEnabled(doc: Document = document): boolean {
  if (doc.documentElement.getAttribute('data-motion') === 'off') return false;
  const view = doc.defaultView;
  if (typeof view?.matchMedia === 'function') {
    return !view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return true;
}
