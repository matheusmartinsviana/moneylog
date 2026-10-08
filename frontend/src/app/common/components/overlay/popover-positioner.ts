/**
 * Posicionamento de painéis ancorados (popover e tooltip): abaixo do gatilho por padrão, vira para
 * cima quando falta espaço (flip) e desloca na horizontal para caber na tela (shift).
 * Coordenadas de `position: fixed`; a altura máxima respeita a área visível (inclusive com o
 * teclado virtual aberto, via `visualViewport`).
 */
export interface PositionInput {
  readonly anchor: DOMRect;
  /** Tamanho natural do painel. */
  readonly width: number;
  readonly height: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly gap?: number;
  readonly margin?: number;
  readonly maxHeight?: number;
  /** Preferência vertical; vira se não couber. */
  readonly prefer?: 'below' | 'above';
  /** Alinha à esquerda ou à direita do gatilho. */
  readonly align?: 'start' | 'end' | 'center';
  /** `inline`: ao lado do gatilho (à direita; à esquerda se não couber), alinhado ao topo dele (trilho lateral). */
  readonly placement?: 'block' | 'inline';
}

export interface Position {
  readonly top: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly side: 'below' | 'above' | 'end';
}

export function computePosition(input: PositionInput): Position {
  const gap = input.gap ?? 6;
  const margin = input.margin ?? 8;
  const cap = input.maxHeight ?? 360;
  if (input.placement === 'inline') {
    const maxHeight = Math.min(cap, input.viewport.height - margin * 2);
    const height = Math.min(input.height, maxHeight);
    const top = Math.min(input.anchor.top, input.viewport.height - margin - height);
    let left = input.anchor.right + gap;
    if (left + input.width > input.viewport.width - margin) {
      left = Math.max(input.anchor.left - gap - input.width, margin);
    }
    return { top: Math.max(top, margin), left, maxHeight, side: 'end' };
  }
  const below = input.viewport.height - input.anchor.bottom - gap - margin;
  const above = input.anchor.top - gap - margin;
  const prefer = input.prefer ?? 'below';
  const fitsPreferred = (prefer === 'below' ? below : above) >= Math.min(input.height, cap);
  const side: 'below' | 'above' = fitsPreferred ? prefer : below >= above ? 'below' : 'above';
  const space = Math.max(side === 'below' ? below : above, 120);
  const maxHeight = Math.min(cap, space);
  const height = Math.min(input.height, maxHeight);
  const top = side === 'below' ? input.anchor.bottom + gap : input.anchor.top - gap - height;

  const align = input.align ?? 'start';
  let left =
    align === 'start'
      ? input.anchor.left
      : align === 'end'
        ? input.anchor.right - input.width
        : input.anchor.left + input.anchor.width / 2 - input.width / 2;
  left = Math.min(left, input.viewport.width - input.width - margin);
  left = Math.max(left, margin);
  return { top: Math.max(top, margin), left, maxHeight, side };
}
