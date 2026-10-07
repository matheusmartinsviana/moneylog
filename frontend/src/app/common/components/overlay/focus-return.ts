/**
 * Para onde o foco volta quando um painel ou diálogo fecha. No Safari (macOS e iOS) clicar ou tocar
 * num botão NÃO o foca: `document.activeElement` fica no `body` e o foco se perderia ao fechar. Por
 * isso o último alvo de `pointerdown` também conta como "quem abriu" (zerado por qualquer tecla,
 * quando o `activeElement` volta a ser confiável).
 */
const INTERACTIVE =
  'button, a[href], input, textarea, [tabindex], [role="button"], [role="combobox"]';

let tracked: Document | null = null;
let lastPointerTarget: Element | null = null;

/** Liga o rastreio do último toque/clique (uma vez por documento; chamar na construção do overlay). */
export function trackPointerTarget(doc: Document): void {
  if (tracked === doc) return;
  tracked = doc;
  doc.addEventListener(
    'pointerdown',
    (event) => {
      lastPointerTarget = event.target instanceof Element ? event.target : null;
    },
    true,
  );
  doc.addEventListener('keydown', () => (lastPointerTarget = null), true);
}

/**
 * O elemento que deve receber o foco de volta ao fechar (ou `null`). O foco real manda, exceto
 * quando está num ancestral do último alvo de toque (Safari: o clique no botão focou o `<main
 * tabindex="-1">` ou o próprio `body`, não o botão).
 */
export function focusReturnTarget(doc: Document): HTMLElement | null {
  const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const pressed = lastPointerTarget?.closest<HTMLElement>(INTERACTIVE) ?? null;
  const usable = pressed?.isConnected === true ? pressed : null;
  if (!active || active === doc.body) return usable;
  if (usable && active !== usable && active.contains(usable)) return usable;
  return active;
}
