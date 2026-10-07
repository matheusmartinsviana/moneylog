/**
 * Foco preso de um modal (diálogo, folha): Tab e Shift+Tab circulam só dentro do contêiner.
 * Usado pelo `OverlayPanel` (e, por composição, por `Dialog`, `Sheet`, `Menu` e `ConfirmDialog`).
 */
export const FOCUSABLE =
  'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

/**
 * Elementos que o `Tab` alcança dentro de `root`, na ordem do documento: visíveis, habilitados, não
 * inertes e sem `tabindex="-1"` (itens de roving tabindex só recebem foco por seta).
 */
export function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute('tabindex') !== '-1' &&
      element.closest('[inert], [hidden]') === null &&
      element.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Trata o `Tab` dentro de `container` por conta própria: o foco anda pelos focáveis em círculo
 * (último -> primeiro, primeiro -> último com Shift) e nunca sai. Não depende do navegador: o
 * Safari (macOS) pula botões no `Tab` por padrão e deixaria o foco escapar do modal. Quem está
 * num item fora da ordem de Tab (`tabindex="-1"`, como o de um menu) segue para o primeiro (ou
 * o último, com Shift). Devolve `true` se tratou o evento (ele já recebeu `preventDefault`).
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement, doc: Document): boolean {
  if (event.key !== 'Tab') return false;
  const focusables = focusableElements(container);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  event.preventDefault();
  if (!first || !last) {
    container.focus();
    return true;
  }
  const current = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const index = current ? focusables.indexOf(current) : -1;
  if (event.shiftKey) {
    (index <= 0 ? last : (focusables[index - 1] ?? last)).focus();
  } else {
    (index === -1 || index === focusables.length - 1
      ? first
      : (focusables[index + 1] ?? first)
    ).focus();
  }
  return true;
}
