/**
 * Geometria dos gráficos: só **desenho** (coordenadas de tela). Nenhuma conta financeira: os valores
 * viram `number` apenas para posicionar pontos (a mesma regra do `Sparkline`).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CubicSegment {
  readonly from: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

const sign = (value: number): number => (value < 0 ? -1 : 1);

/** Tangente de um ponto interno (Fritsch-Carlson/Steffen): 0 em máximos e mínimos locais, nunca estoura. */
function slope3(a: Point, b: Point, c: Point): number {
  const h0 = b.x - a.x;
  const h1 = c.x - b.x;
  const s0 = (b.y - a.y) / (h0 || 1);
  const s1 = (c.y - b.y) / (h1 || 1);
  const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** Tangente da ponta, a partir da tangente vizinha. */
function slope2(a: Point, b: Point, t: number): number {
  const h = b.x - a.x;
  return h ? (3 * ((b.y - a.y) / h) - t) / 2 : t;
}

/**
 * Curva suave por **interpolação monotônica** (Fritsch-Carlson): passa por todos os pontos e nunca ultrapassa o
 * valor dos vizinhos (uma spline comum inventaria picos e vales que não estão nos dados). `x` crescente.
 */
export function monotoneSegments(points: readonly Point[]): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const tangents: number[] = new Array<number>(n).fill(0);
  if (n === 2) {
    const slope = (points[1]!.y - points[0]!.y) / (points[1]!.x - points[0]!.x || 1);
    tangents[0] = slope;
    tangents[1] = slope;
  } else {
    for (let i = 1; i < n - 1; i++)
      tangents[i] = slope3(points[i - 1]!, points[i]!, points[i + 1]!);
    tangents[0] = slope2(points[0]!, points[1]!, tangents[1]!);
    tangents[n - 1] = slope2(points[n - 2]!, points[n - 1]!, tangents[n - 2]!);
  }
  const segments: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const dx = to.x - from.x;
    segments.push({
      from,
      to,
      c1: { x: from.x + dx / 3, y: from.y + (dx * tangents[i]!) / 3 },
      c2: { x: to.x - dx / 3, y: to.y - (dx * tangents[i + 1]!) / 3 },
    });
  }
  return segments;
}

const fmt = (value: number): string => String(Math.round(value * 100) / 100);

/** Comandos `M ... C ...` do traço (1 ponto = só o `M`; 0 pontos = vazio). */
export function curvePath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return '';
  const segments = monotoneSegments(points);
  return (
    `M${fmt(first.x)} ${fmt(first.y)}` +
    segments
      .map(
        (s) =>
          `C${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.to.x)} ${fmt(s.to.y)}`,
      )
      .join('')
  );
}

/** Área fechada até a linha de base (`baselineY`): a mesma curva, descendo até o zero. */
export function areaPath(points: readonly Point[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return '';
  return `${curvePath(points)}L${fmt(last.x)} ${fmt(baselineY)}L${fmt(first.x)} ${fmt(baselineY)}Z`;
}

/** Ponto da curva de Bézier no parâmetro `t` (0 a 1): usado pelos testes para amostrar a curva. */
export function bezierAt(segment: CubicSegment, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * segment.from.x + b * segment.c1.x + c * segment.c2.x + d * segment.to.x,
    y: a * segment.from.y + b * segment.c1.y + c * segment.c2.y + d * segment.to.y,
  };
}
