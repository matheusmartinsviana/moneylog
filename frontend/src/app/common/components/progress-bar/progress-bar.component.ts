import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';

export type ProgressTone = 'default' | 'warning' | 'risk';

let nextId = 0;

/**
 * Barra de progresso própria (`role="progressbar"`; nunca `<progress>` nem `<meter>`, que o
 * navegador desenha). Mostra uma razão que **vem do backend** (`value`, de 0 a 1: limite usado,
 * meta, importação); o componente não calcula dinheiro nem a razão, só a desenha e a anuncia.
 * `valueText` é o texto formatado por quem usa (ex.: "R$ 1.200,00 de R$ 2.000,00"). `warning` e
 * `risk` sempre vêm com texto ("Atenção", "Risco"), nunca só cor. `value=null` é indeterminado
 * (importação em andamento): sem `aria-valuenow`, sem animação com `prefers-reduced-motion`.
 * Preenchimento sólido, sem gradiente (FE-S-121); `forced-colors` legível. Presentational.
 */
@Component({
  selector: 'app-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress" [attr.data-cy]="fieldId()" [attr.data-tone]="tone()">
      <div class="progress__head">
        <span class="progress__label" [id]="labelId" [class.visually-hidden]="hideLabel()">{{
          label()
        }}</span>
        @if (toneLabel() || valueText()) {
          <span class="progress__text" [attr.data-cy]="fieldId() + '-text'">
            @if (toneLabel(); as status) {
              <strong class="progress__status">{{ status }}</strong>
            }
            {{ valueText() }}
          </span>
        }
      </div>
      <div
        class="progress__track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-labelledby]="labelId"
        [attr.aria-valuenow]="now()"
        [attr.aria-valuetext]="ariaText()"
        [attr.aria-busy]="indeterminate() || null"
        [attr.data-cy]="fieldId() + '-track'"
      >
        <!-- Largura = razão do backend (0 a 1): valor dinâmico, não cabe em classe CSS. -->
        <!-- eslint-disable-next-line @angular-eslint/template/no-inline-styles -->
        <div
          class="progress__fill"
          [class.progress__fill--indeterminate]="indeterminate()"
          [style.width.%]="indeterminate() ? null : percent()"
        ></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .progress {
      display: grid;
      gap: var(--space-2);
    }

    .progress__head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-1) var(--space-3);
      font-size: var(--text-sm);
    }

    .progress__label {
      color: var(--color-text);
      font-weight: var(--weight-medium);
    }

    .progress__text {
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .progress__status {
      margin-right: var(--space-1);
      font-weight: var(--weight-semibold);
    }

    .progress[data-tone='warning'] .progress__status {
      color: var(--color-warning);
    }

    .progress[data-tone='risk'] .progress__status {
      color: var(--color-risk);
    }

    .progress__track {
      position: relative;
      height: 0.5rem;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background-color: var(--color-surface-muted);
      box-shadow: inset 0 0 0 var(--border-width) var(--color-border);
    }

    .progress__fill {
      height: 100%;
      border-radius: var(--radius-pill);
      background-color: var(--color-accent);
      transition: width var(--duration-base) var(--ease-standard);
    }

    .progress[data-tone='warning'] .progress__fill {
      background-color: var(--color-warning);
    }

    .progress[data-tone='risk'] .progress__fill {
      background-color: var(--color-risk);
    }

    .progress__fill--indeterminate {
      width: 40%;
      transition: none;
      animation: progress-slide 1.4s var(--ease-standard) infinite;
    }

    @keyframes progress-slide {
      from {
        transform: translateX(-100%);
      }

      to {
        transform: translateX(250%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .progress__fill--indeterminate {
        animation: none;
      }
    }

    @media (forced-colors: active) {
      .progress__track {
        border: var(--border-width) solid ButtonText;
      }

      .progress__fill {
        background-color: Highlight;
      }
    }
  `,
})
export class ProgressBarComponent {
  private readonly t = inject(I18nService).t;

  /** Nome da barra (o que ela mede). Já traduzido. */
  readonly label = input.required<string>();
  /** Base do `data-cy` (`<fieldId>`, `-track`, `-text`). */
  readonly fieldId = input.required<string>();
  /** Razão de 0 a 1 vinda do backend; `null` = indeterminado. */
  readonly value = input<number | null>(null);
  /** Texto do valor, formatado por quem usa (moeda do dado). */
  readonly valueText = input<string>();
  readonly tone = input<ProgressTone>('default');
  /** Esconde o rótulo visualmente (continua sendo o nome acessível). */
  readonly hideLabel = input(false);

  protected readonly labelId = `progress-label-${++nextId}`;
  protected readonly indeterminate = computed(() => this.value() === null);
  /** Largura do preenchimento, de 0 a 100 (só desenho: a razão já veio pronta). */
  protected readonly percent = computed(() => {
    const value = this.value();
    return value === null ? 0 : Math.min(100, Math.max(0, value * 100));
  });
  protected readonly now = computed(() =>
    this.indeterminate() ? null : Math.round(this.percent()),
  );
  protected readonly toneLabel = computed(() => {
    const tone = this.tone();
    return tone === 'default' ? null : this.t().form.progress[tone];
  });
  protected readonly ariaText = computed(() => {
    const status = this.toneLabel();
    const text = this.valueText() ?? (this.now() === null ? null : `${this.now()}%`);
    const parts = [status, text].filter((part) => part !== null && part !== '');
    return parts.length > 0 ? parts.join(': ') : null;
  });
}
