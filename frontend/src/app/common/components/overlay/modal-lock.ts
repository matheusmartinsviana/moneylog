import { lockScroll } from '~/app/common/components/overlay/scroll-lock';

/** Atributo de quem deve continuar acessível com um modal aberto (avisos, região viva). */
export const MODAL_SAFE_ATTRIBUTE = 'data-modal-safe';

const modals: HTMLElement[] = [];
const inerted = new Set<HTMLElement>();

/** Elemento do modal mais ao topo (para a região viva anunciar dentro dele), ou `null`. */
export function activeModal(): HTMLElement | null {
  // Um modal removido do documento sem soltar a trava (destruição fora de ordem) não conta.
  for (let i = modals.length - 1; i >= 0; i--) {
    const modal = modals[i];
    if (modal?.isConnected) return modal;
  }
  return null;
}

function isSafe(element: HTMLElement): boolean {
  return element.hasAttribute(MODAL_SAFE_ATTRIBUTE);
}

/** Marca como `inert` tudo que não é o modal, seus ancestrais, nem região "segura". */
function applyInert(modal: HTMLElement | null): void {
  for (const element of inerted) element.removeAttribute('inert');
  inerted.clear();
  if (!modal) return;
  let node: HTMLElement = modal;
  while (node.parentElement) {
    const parent: HTMLElement = node.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      markInert(sibling);
    }
    node = parent;
    if (node === node.ownerDocument.body) break;
  }
}

function markInert(element: HTMLElement): void {
  if (isSafe(element) || element.tagName === 'SCRIPT') return;
  if (element.querySelector(`[${MODAL_SAFE_ATTRIBUTE}]`)) {
    // Contém uma região segura: desce e marca só o que não a contém.
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) markInert(child);
    }
    return;
  }
  element.setAttribute('inert', '');
  inerted.add(element);
}

/**
 * Trava de modal: bloqueia a rolagem do fundo e deixa o resto da página `inert` (foco, cliques e
 * cursor do leitor de tela ficam só no modal). Devolve a função que solta a trava.
 */
export function lockModal(modal: HTMLElement): () => void {
  const doc = modal.ownerDocument;
  const releaseScroll = lockScroll(doc.body);
  modals.push(modal);
  applyInert(modal);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = modals.indexOf(modal);
    if (index >= 0) modals.splice(index, 1);
    applyInert(activeModal());
    releaseScroll();
  };
}
