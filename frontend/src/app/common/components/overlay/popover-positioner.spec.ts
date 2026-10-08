import { computePosition } from '~/app/common/components/overlay/popover-positioner';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

const VIEWPORT = { width: 1000, height: 800 };

describe('computePosition', () => {
  it('Dado espaço abaixo, quando posiciona, então abre abaixo do gatilho com a folga', () => {
    const result = computePosition({
      anchor: rect(100, 100, 200, 40),
      width: 200,
      height: 200,
      viewport: VIEWPORT,
    });

    expect(result).toMatchObject({ side: 'below', top: 146, left: 100 });
    expect(result.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('Dado pouco espaço abaixo e muito acima, quando posiciona, então vira para cima (flip)', () => {
    const result = computePosition({
      anchor: rect(100, 700, 200, 40),
      width: 200,
      height: 300,
      viewport: VIEWPORT,
    });

    expect(result.side).toBe('above');
    expect(result.top).toBe(700 - 6 - 300);
  });

  it('Dado pouco espaço nos dois lados, quando posiciona, então fica do lado maior e limita a altura', () => {
    const result = computePosition({
      anchor: rect(100, 150, 200, 40),
      width: 200,
      height: 600,
      viewport: { width: 1000, height: 400 },
    });

    expect(result.side).toBe('below');
    expect(result.maxHeight).toBeLessThan(600);
    expect(result.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it('Dado o lado menor, quando o espaço é menor que o mínimo, então a altura não cai de 120 px', () => {
    const result = computePosition({
      anchor: rect(100, 380, 200, 40),
      width: 200,
      height: 500,
      viewport: { width: 1000, height: 440 },
    });

    expect(result.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it('Dado o gatilho colado na borda direita, quando posiciona, então desloca na horizontal (shift)', () => {
    const result = computePosition({
      anchor: rect(900, 100, 90, 40),
      width: 300,
      height: 100,
      viewport: VIEWPORT,
    });

    expect(result.left).toBe(1000 - 300 - 8);
  });

  it('Dado o gatilho colado na borda esquerda com alinhamento ao fim, quando posiciona, então respeita a margem', () => {
    const result = computePosition({
      anchor: rect(0, 100, 50, 40),
      width: 300,
      height: 100,
      viewport: VIEWPORT,
      align: 'end',
    });

    expect(result.left).toBe(8);
  });

  it('Dado o alinhamento ao centro e a preferência por cima, quando cabe, então centraliza e fica acima', () => {
    const result = computePosition({
      anchor: rect(400, 400, 100, 40),
      width: 200,
      height: 100,
      viewport: VIEWPORT,
      align: 'center',
      prefer: 'above',
    });

    expect(result).toMatchObject({ side: 'above', left: 350 });
  });

  it('Dado a altura máxima menor que o conteúdo, quando posiciona, então respeita o teto', () => {
    const result = computePosition({
      anchor: rect(100, 100, 200, 40),
      width: 200,
      height: 700,
      viewport: VIEWPORT,
      maxHeight: 250,
    });

    expect(result.maxHeight).toBe(250);
  });

  it('Dado o gatilho acima da área visível, quando abre para cima, então o topo não passa da margem', () => {
    const result = computePosition({
      anchor: rect(100, 20, 200, 40),
      width: 200,
      height: 300,
      viewport: { width: 1000, height: 100 },
    });

    expect(result.top).toBeGreaterThanOrEqual(8);
  });

  it('Dado o trilho lateral, quando abre em linha, então fica à direita do gatilho, alinhado ao topo', () => {
    const result = computePosition({
      anchor: rect(16, 300, 40, 40),
      width: 220,
      height: 300,
      viewport: VIEWPORT,
      placement: 'inline',
    });

    expect(result).toMatchObject({ side: 'end', left: 62, top: 300 });
  });

  it('Dado pouco espaço abaixo, quando abre em linha, então sobe para caber na área visível', () => {
    const result = computePosition({
      anchor: rect(16, 700, 40, 40),
      width: 220,
      height: 300,
      viewport: VIEWPORT,
      placement: 'inline',
    });

    expect(result.top).toBe(492);
  });
});
