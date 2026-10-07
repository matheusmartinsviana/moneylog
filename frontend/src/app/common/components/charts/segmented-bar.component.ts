import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { ratioForBar } from '~/util/ratio';

export type SegmentTone = 'accent' | 'positive' | 'warning' | 'risk' | 'neutral';

/** Segmento já calculado pelo backend: `share` é a razão dele no total (o front não soma nem divide). */
export interface SegmentedBarSegment {
  readonly id: string;
  readonly label: string;
  /** Razão decimal (`0.4000`) do backend. */
  readonly share: string;
  /** Texto do valor, formatado por quem usa (ex.: "R$ 820,00"). */
  readonly valueText: string;
  readonly tone: SegmentTone;
}

/**
 * Barra segmentada (DS 02: progresso do orçamento mensal, hoje "em breve"). Desenha segmentos **já calculados**
 * pelo backend; a legenda em texto (rótulo e valor) é o sinal principal e a cor só reforça. Desabilitada
 * (`disabled`) mostra a trilha vazia e "Disponível em breve", sem número nenhum. Presentational.
 */
@Component({
  selector: 'app-segmented-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sb" [attr.aria-disabled]="disabled() || null" [attr.data-cy]="cy()">
      <div
        class="sb__track"
        role="img"
        [attr.aria-label]="ariaLabel()"
        [attr.data-cy]="cy() + '-track'"
      >
        @for (seg of drawn(); track seg.id) {
          <!-- Largura = o share do backend (posicionamento, não conta). -->
          <!-- eslint-disable-next-line @angular-eslint/template/no-inline-styles -->
          <span class="sb__seg" [attr.data-tone]="seg.tone" [style.width.%]="seg.width"></span>
        }
      </div>
      @if (disabled()) {
        <p class="sb__off" [attr.data-cy]="cy() + '-disabled'">
          {{ t().charts.segmentedDisabled }}
        </p>
      } @else {
        <ul class="sb__legend" [attr.data-cy]="cy() + '-legend'">
          @for (seg of segments(); track seg.id) {
            <li class="sb__item">
              <span class="sb__swatch" [attr.data-tone]="seg.tone" aria-hidden="true"></span>
              <span class="sb__label">{{ seg.label }}</span>
              <span class="num">{{ seg.valueText }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .sb {
      display: grid;
      gap: var(--space-2);
    }

    .sb__track {
      display: flex;
      gap: 2px;
      height: 0.5rem;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background-color: var(--color-surface-muted);
      box-shadow: inset 0 0 0 var(--border-width) var(--color-border);
    }

    .sb__seg {
      height: 100%;
      background-color: var(--color-chart-1);
    }

    .sb__seg[data-tone='positive'],
    .sb__swatch[data-tone='positive'] {
      background-color: var(--color-positive);
    }

    .sb__seg[data-tone='warning'],
    .sb__swatch[data-tone='warning'] {
      background-color: var(--color-warning);
    }

    .sb__seg[data-tone='risk'],
    .sb__swatch[data-tone='risk'] {
      background-color: var(--color-risk);
    }

    .sb__seg[data-tone='neutral'],
    .sb__swatch[data-tone='neutral'] {
      background-color: var(--color-chart-2);
    }

    .sb__legend {
      display: grid;
      gap: var(--space-1);
      font-size: var(--text-sm);
    }

    .sb__item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .sb__label {
      flex: 1;
      min-width: 0;
      color: var(--color-text-muted);
    }

    .sb__swatch {
      flex: none;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-pill);
      background-color: var(--color-chart-1);
    }

    .sb__off {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    @media (forced-colors: active) {
      .sb__seg {
        background-color: CanvasText;
      }
    }
  `,
})
export class SegmentedBarComponent {
  protected readonly t = inject(I18nService).t;

  readonly label = input.required<string>();
  readonly segments = input.required<readonly SegmentedBarSegment[]>();
  readonly disabled = input(false);
  readonly cy = input('segmented-bar');

  protected readonly drawn = computed(() =>
    this.disabled()
      ? []
      : this.segments().map((seg) => ({
          id: seg.id,
          tone: seg.tone,
          width: Math.min(100, Math.max(0, (ratioForBar(seg.share) ?? 0) * 100)),
        })),
  );

  protected readonly ariaLabel = computed(() =>
    this.disabled()
      ? `${this.label()}: ${this.t().charts.segmentedDisabled}`
      : `${this.label()}: ${this.segments()
          .map((seg) => `${seg.label} ${seg.valueText}`)
          .join(', ')}`,
  );
}
