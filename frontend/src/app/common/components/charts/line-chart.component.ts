import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

import { areaPath, curvePath, type Point } from '~/app/common/components/charts/chart-geometry';
import { revealOnEnter } from '~/app/common/components/charts/reveal';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { formatMoney, type Money } from '~/util/money';

/** Uma série do gráfico: valores do backend (`Money`) na ordem de `keys`. */
export interface LineChartSeries {
  readonly id: string;
  readonly label: string;
  /** `primary` = acento (entradas); `secondary` = neutro quente, sempre tracejado e com ponto quadrado. */
  readonly tone: 'primary' | 'secondary';
  readonly values: readonly Money[];
  /** Área sob a curva (padrão: só a série primária). */
  readonly area?: boolean;
}

/** Posição do eixo X: rótulos já formatados por quem usa (datas e competências vêm do backend). */
export interface LineChartKey {
  readonly id: string;
  readonly label: string;
  /** Rótulo curto do eixo (padrão: `label`). */
  readonly shortLabel?: string;
}

const W = 1000;
const H = 300;
const PAD_X = 16;
/** Folga acima do máximo: o rótulo do eixo Y fica nela e nunca encosta na curva. */
const PAD_TOP = 34;
const PAD_BOTTOM = 10;
const MAX_POINTS = 400;
let nextId = 0;

interface Drawn {
  readonly series: LineChartSeries;
  readonly line: string;
  readonly area: string;
  readonly dots: readonly { readonly leftPct: number; readonly topPct: number }[];
}

/**
 * Gráfico de linhas/área em **SVG próprio** (ADR-011; sem biblioteca). Desenha **o que o backend devolve**:
 * `Number()` só posiciona pontos, nunca exibe nem soma; o eixo Y mostra o **máximo da própria série** (a string do
 * backend) e o zero, sem "tick bonito" calculado. Curva monotônica (não inventa picos), área sólida de baixa
 * opacidade (sem gradiente), saídas tracejadas com ponto quadrado (a diferença nunca é só cor).
 *
 * Acessibilidade: `role="img"` com resumo, **tabela equivalente sempre no DOM** (visível por "Ver como
 * tabela"), tooltip próprio por mouse, toque e teclado (`←/→`, `Home/End`, `Esc`) e anúncio pela região viva. O
 * estado final está no DOM desde o início: a entrada na viewport só revela o traço (`clip-path`, ≤ 300 ms),
 * e é desligada por `prefers-reduced-motion` ou sem `IntersectionObserver`. Presentational.
 */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Toque fora do gráfico fecha o tooltip (o Safari iOS não dispara `blur` ao tocar numa área não focável).
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  templateUrl: './line-chart.component.html',
  styleUrl: './line-chart.component.css',
})
export class LineChartComponent {
  private readonly announcer = inject(LiveAnnouncer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18nService).t;

  /** Nome do gráfico (também a legenda da tabela). Já traduzido. */
  readonly label = input.required<string>();
  readonly series = input.required<readonly LineChartSeries[]>();
  readonly keys = input.required<readonly LineChartKey[]>();
  /** Base do `data-cy`. */
  readonly cy = input('line-chart');
  /** Painel principal (Início): mais alto, com halo atrás do traço. */
  readonly hero = input(false, { transform: booleanAttribute });

  protected readonly uid = ++nextId;
  protected readonly fillId = `line-chart-fill-${this.uid}`;
  protected readonly tableId = `line-chart-table-${this.uid}`;
  protected readonly hintId = `line-chart-hint-${this.uid}`;
  protected readonly width = W;
  protected readonly height = H;

  protected readonly active = signal<number | null>(null);
  protected readonly tableOpen = signal(false);
  /** `true` até o gráfico entrar na viewport (só se há como animar): o traço ainda não foi revelado. */
  protected readonly pending = revealOnEnter();

  /** Quantos pontos são desenhados: as séries e as chaves precisam andar juntas. */
  protected readonly count = computed(() => {
    const lengths = this.series().map((s) => s.values.length);
    return Math.min(this.keys().length, MAX_POINTS, ...(lengths.length ? lengths : [0]));
  });

  /** Valores só para posicionar (`NaN` vira 0): nunca exibidos. */
  private readonly nums = computed(() =>
    this.series().map((s) =>
      s.values.slice(0, this.count()).map((v) => {
        const n = Number(v.amount);
        return Number.isFinite(n) ? n : 0;
      }),
    ),
  );

  /** Série vazia ou só de zeros: estado vazio honesto, não uma linha reta fingindo dado. */
  protected readonly empty = computed(
    () => this.count() === 0 || this.nums().every((values) => values.every((n) => n === 0)),
  );

  private readonly domain = computed(() => {
    const all = this.nums().flat();
    return { min: Math.min(0, ...all), max: Math.max(0, ...all) };
  });

  private readonly y = computed(() => {
    const { min, max } = this.domain();
    const span = max - min || 1;
    return (value: number): number => PAD_TOP + ((max - value) / span) * (H - PAD_TOP - PAD_BOTTOM);
  });

  private readonly x = computed(() => {
    const n = this.count();
    return (index: number): number =>
      n <= 1 ? W / 2 : PAD_X + (index * (W - PAD_X * 2)) / (n - 1);
  });

  protected readonly drawn = computed<readonly Drawn[]>(() => {
    const x = this.x();
    const y = this.y();
    const baseline = y(0);
    return this.series().map((series, s) => {
      const points: Point[] = this.nums()[s]!.map((value, i) => ({ x: x(i), y: y(value) }));
      return {
        series,
        line: points.length > 1 ? curvePath(points) : '',
        area: (series.area ?? series.tone === 'primary') ? areaPath(points, baseline) : '',
        dots: points.map((p) => ({ leftPct: (p.x / W) * 100, topPct: (p.y / H) * 100 })),
      };
    });
  });

  /** Três linhas finas de grade (máximo, zero e uma terceira), sem número inventado. */
  protected readonly gridY = computed(() => {
    const { min, max } = this.domain();
    const y = this.y();
    const third = min < 0 ? y(min) : y(max / 2);
    return [...new Set([y(max), y(0), third].map((v) => Math.round(v * 100) / 100))];
  });

  protected readonly zeroTopPct = computed(() => (this.y()(0) / H) * 100);

  /** Texto do backend do maior (ou menor) valor: seleção, não aritmética. */
  private extreme(kind: 'max' | 'min'): { n: number; money: Money } | null {
    let best: { n: number; money: Money } | null = null;
    this.series().forEach((s, si) => {
      this.nums()[si]!.forEach((n, i) => {
        const better = best === null || (kind === 'max' ? n > best.n : n < best.n);
        if (better) best = { n, money: s.values[i]! };
      });
    });
    return best;
  }

  /** Rótulo do máximo da própria série: o texto do backend do maior valor (só se positivo). */
  protected readonly maxLabel = computed(() => {
    const found = this.extreme('max');
    return found !== null && found.n > 0
      ? { text: formatMoney(found.money), topPct: (this.y()(this.domain().max) / H) * 100 }
      : null;
  });

  /** Rótulo do menor valor quando há escala negativa (sem ele só o `0` e o máximo davam referência). */
  protected readonly minLabel = computed(() => {
    const found = this.extreme('min');
    return found !== null && found.n < 0
      ? { text: formatMoney(found.money), topPct: (this.y()(this.domain().min) / H) * 100 }
      : null;
  });

  /** Rótulos do eixo X: pontas e até dois do meio (seleção de posição, nada calculado). */
  protected readonly axisLabels = computed(() => {
    const n = this.count();
    if (n === 0) return [];
    const picks =
      n <= 4
        ? [...Array(n).keys()]
        : [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
    const ticks = [...new Set(picks)];
    // Rótulos longos não se sobrepõem: cada marca tem uma largura máxima de 2/3 do menor vão entre marcas
    // vizinhas (1/2 se só há as duas pontas) e o texto que não cabe vira reticências (o nome inteiro está no
    // tooltip e na tabela; o eixo é só uma pista). Os vãos não são iguais (pontas e meio): vale o menor.
    const positions = ticks.map((i) => (this.x()(i) / W) * 100);
    const gaps = positions.slice(1).map((p, i) => p - positions[i]!);
    const minGap = gaps.length > 0 ? Math.min(...gaps) : 100;
    const maxPct = Math.floor(ticks.length === 2 ? minGap / 2 : (minGap * 2) / 3);
    return ticks.map((i) => {
      const key = this.keys()[i]!;
      return {
        text: key.shortLabel ?? key.label,
        maxPct,
        leftPct: (this.x()(i) / W) * 100,
        edge: i === 0 ? 'start' : i === n - 1 ? 'end' : 'mid',
      };
    });
  });

  protected readonly summary = computed(() =>
    interpolate(this.t().charts.summary, {
      label: this.label(),
      series: this.series()
        .map((s) => s.label)
        .join(', '),
      points: String(this.count()),
    }),
  );

  protected readonly rows = computed(() =>
    this.keys()
      .slice(0, this.count())
      .map((key, i) => ({
        label: key.label,
        cells: this.series().map((s) => formatMoney(s.values[i]!)),
      })),
  );

  /** O ponto ativo: rótulo e o valor de cada série, para o tooltip e o anúncio. */
  protected readonly tip = computed(() => {
    const i = this.active();
    if (i === null || i >= this.count()) return null;
    const leftPct = (this.x()(i) / W) * 100;
    return {
      index: i,
      label: this.keys()[i]!.label,
      leftPct,
      flip: leftPct > 50,
      rows: this.series().map((s, si) => ({
        id: s.id,
        label: s.label,
        tone: s.tone,
        value: formatMoney(s.values[i]!),
        topPct: (this.y()(this.nums()[si]![i]!) / H) * 100,
      })),
    };
  });

  protected toggleTable(): void {
    this.tableOpen.update((open) => !open);
  }

  private indexAt(event: PointerEvent): number {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const n = this.count();
    if (n <= 1 || rect.width === 0) return 0;
    const inner = ((event.clientX - rect.left) / rect.width) * W;
    const index = Math.round(((inner - PAD_X) / (W - PAD_X * 2)) * (n - 1));
    return Math.min(n - 1, Math.max(0, index));
  }

  protected onPointer(event: PointerEvent): void {
    if (this.empty()) return;
    this.active.set(this.indexAt(event));
  }

  protected onPointerCancel(): void {
    // O gesto virou rolagem da página (ou o sistema o cancelou): nada de tooltip preso.
    this.active.set(null);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (this.active() === null) return;
    const plot = this.host.nativeElement.querySelector('.lc__plot');
    if (!(event.target instanceof Node) || !plot?.contains(event.target)) this.active.set(null);
  }

  protected onPointerLeave(event: PointerEvent): void {
    // No toque o tooltip fica depois de soltar o dedo (some ao tocar fora ou com Esc).
    if (event.pointerType === 'mouse') this.active.set(null);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.count();
    if (this.empty() || n === 0) return;
    const current = this.active();
    let next: number | null;
    switch (event.key) {
      case 'ArrowRight':
        next = current === null ? 0 : Math.min(n - 1, current + 1);
        break;
      case 'ArrowLeft':
        next = current === null ? n - 1 : Math.max(0, current - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      case 'Escape':
        if (current === null) return;
        event.preventDefault();
        this.active.set(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.active.set(next);
    const tip = this.tip();
    if (tip) {
      this.announcer.announce(
        `${tip.label}: ${tip.rows.map((row) => `${row.label} ${row.value}`).join(', ')}`,
      );
    }
  }

  protected onBlur(): void {
    this.active.set(null);
  }
}
