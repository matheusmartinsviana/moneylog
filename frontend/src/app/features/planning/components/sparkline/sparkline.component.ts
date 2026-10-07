import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Uma série da sparkline: valores decimais do backend (strings) na ordem do eixo X. */
export interface SparklineSeries {
  readonly id: string;
  readonly values: readonly string[];
  /**
   * Posição de cada valor no eixo X (a competência, `YYYY-MM`, ordenável como texto). Com `keys` as séries se
   * alinham pelo mês, mesmo com tamanhos diferentes; sem `keys`, vale a posição no índice (FE-S-174).
   */
  readonly keys?: readonly string[];
  /** Linha tracejada (a estimativa não se confunde com a base: nunca só cor). */
  readonly dashed?: boolean;
}

const WIDTH = 320;
const HEIGHT = 96;
const PAD = 8;

interface DrawnSeries {
  readonly id: string;
  readonly dashed: boolean;
  readonly line: string;
  readonly dots: readonly { readonly x: number; readonly y: number }[];
}

/**
 * Sparkline em SVG próprio (sem biblioteca de gráficos): desenha **os valores do backend** com escala
 * visual apenas (`Number()` só para posicionar pontos; nenhuma conta financeira). Decorativa para leitor de
 * tela (`aria-hidden`): a tabela equivalente ao lado carrega os mesmos valores. A tendência é tracejada e
 * os pontos têm forma, então a leitura não depende só de cor.
 */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="spark"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      aria-hidden="true"
      focusable="false"
      data-cy="sparkline"
    >
      @if (zeroY(); as zero) {
        <line
          class="spark__zero"
          [attr.x1]="pad"
          [attr.x2]="width - pad"
          [attr.y1]="zero.y"
          [attr.y2]="zero.y"
        />
      }
      @for (item of drawn(); track item.id) {
        <polyline
          class="spark__line"
          [class.spark__line--dashed]="item.dashed"
          [class.spark__line--trend]="item.dashed"
          [attr.points]="item.line"
          [attr.data-cy]="'sparkline-' + item.id"
        />
        @for (dot of item.dots; track $index) {
          <circle
            class="spark__dot"
            [class.spark__dot--trend]="item.dashed"
            [attr.cx]="dot.x"
            [attr.cy]="dot.y"
            r="3"
          />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }

    .spark {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .spark__line {
      fill: none;
      stroke: var(--color-accent);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }

    .spark__line--trend {
      stroke: var(--color-warning);
    }

    .spark__line--dashed {
      stroke-dasharray: 6 4;
    }

    .spark__dot {
      fill: var(--color-surface);
      stroke: var(--color-accent);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .spark__dot--trend {
      stroke: var(--color-warning);
    }

    .spark__zero {
      stroke: var(--color-border);
      stroke-width: 1;
      stroke-dasharray: 2 3;
      vector-effect: non-scaling-stroke;
    }

    @media (forced-colors: active) {
      .spark__line,
      .spark__dot {
        stroke: CanvasText;
      }
    }
  `,
})
export class SparklineComponent {
  readonly series = input.required<readonly SparklineSeries[]>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;

  private readonly extent = computed(() => {
    const all = this.series()
      .flatMap((s) => s.values.map(Number))
      .filter(Number.isFinite);
    if (all.length === 0) return null;
    return { min: Math.min(...all), max: Math.max(...all) };
  });

  private readonly scaleY = computed(() => {
    const extent = this.extent();
    return (value: number): number => {
      if (extent === null || extent.max === extent.min) return HEIGHT / 2;
      const ratio = (value - extent.min) / (extent.max - extent.min);
      return HEIGHT - PAD - ratio * (HEIGHT - PAD * 2);
    };
  });

  /** Linha do zero (só quando a escala atravessa o zero): é só desenho. */
  protected readonly zeroY = computed(() => {
    const extent = this.extent();
    return extent !== null && extent.min < 0 && extent.max > 0 ? { y: this.scaleY()(0) } : null;
  });

  /** O domínio do eixo X: as chaves (competências) de todas as séries, sem repetir, em ordem. */
  private readonly domain = computed(() => {
    const keys = new Set<string>();
    for (const series of this.series()) for (const key of series.keys ?? []) keys.add(key);
    return [...keys].sort();
  });

  protected readonly drawn = computed<readonly DrawnSeries[]>(() => {
    const scaleY = this.scaleY();
    const domain = this.domain();
    const longest = Math.max(0, ...this.series().map((series) => series.values.length));
    return this.series().map((series) => {
      const aligned = series.keys !== undefined && series.keys.length === series.values.length;
      const slots = aligned ? domain.length : longest;
      const dots = series.values.map((raw, index) => {
        const slot = aligned ? domain.indexOf(series.keys![index]!) : index;
        return {
          x: slots <= 1 ? WIDTH / 2 : PAD + (slot / (slots - 1)) * (WIDTH - PAD * 2),
          y: scaleY(Number(raw)),
        };
      });
      return {
        id: series.id,
        dashed: series.dashed === true,
        line: dots.map((dot) => `${dot.x.toFixed(1)},${dot.y.toFixed(1)}`).join(' '),
        dots,
      };
    });
  });
}
