import {
  areaPath,
  bezierAt,
  curvePath,
  monotoneSegments,
  type Point,
} from '~/app/common/components/charts/chart-geometry';

const pts = (ys: number[]): Point[] => ys.map((y, i) => ({ x: i * 10, y }));

describe('monotoneSegments (interpolação monotônica)', () => {
  it.each([
    ['degrau', [0, 0, 100, 100, 0, 0]],
    ['pico isolado', [10, 10, 90, 10, 10]],
    ['vale', [80, 20, 20, 80]],
    ['oscilação', [5, 50, 8, 60, 3, 70, 1]],
    ['crescente', [1, 2, 4, 8, 16]],
    ['plano com zeros', [0, 0, 0, 0]],
    ['com negativos', [-30, 40, -10, 0, 25]],
  ])(
    'Dado %s, então nenhum ponto da curva sai do intervalo dos dois pontos vizinhos do trecho',
    (_, ys) => {
      for (const seg of monotoneSegments(pts(ys))) {
        const lo = Math.min(seg.from.y, seg.to.y);
        const hi = Math.max(seg.from.y, seg.to.y);
        for (let t = 0; t <= 1; t += 0.02) {
          const p = bezierAt(seg, t);
          expect(p.y).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(p.y).toBeLessThanOrEqual(hi + 1e-9);
          expect(p.x).toBeGreaterThanOrEqual(seg.from.x - 1e-9);
          expect(p.x).toBeLessThanOrEqual(seg.to.x + 1e-9);
        }
      }
    },
  );

  it('Dado os pontos, então a curva passa por todos eles', () => {
    const points = pts([3, 9, 4, 4, 12]);
    const segments = monotoneSegments(points);
    segments.forEach((seg, i) => {
      expect(bezierAt(seg, 0)).toEqual(points[i]);
      expect(bezierAt(seg, 1)).toEqual(points[i + 1]);
    });
  });

  it('Dado menos de dois pontos, então não há segmentos; com um ponto o traço é só o início', () => {
    expect(monotoneSegments([])).toEqual([]);
    expect(monotoneSegments(pts([5]))).toEqual([]);
    expect(curvePath(pts([5]))).toBe('M0 5');
    expect(curvePath([])).toBe('');
  });

  it('Dado dois pontos, então é uma reta', () => {
    const [seg] = monotoneSegments(pts([0, 10]));
    for (let t = 0; t <= 1; t += 0.25) expect(bezierAt(seg!, t).y).toBeCloseTo(t * 10, 6);
  });

  it('Dado uma área, então fecha na linha de base e nunca usa gradiente', () => {
    const d = areaPath(pts([5, 8, 3]), 100);
    expect(d.startsWith('M0 5C')).toBe(true);
    expect(d.endsWith('L20 100L0 100Z')).toBe(true);
    expect(areaPath(pts([5]), 100)).toBe('');
  });
});
