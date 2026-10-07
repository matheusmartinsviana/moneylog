import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { revealOnEnter } from '~/app/common/components/charts/reveal';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { formatMoney, type Money } from '~/util/money';
import { formatRatio, ratioForBar } from '~/util/ratio';

/** Um item já calculado pelo backend (`GET /v1/reports/spending-by-category`). */
export interface BarListItem {
  readonly id: string;
  readonly label: string;
  readonly amount: Money;
  /** Razão decimal (`0.2007`) ou `null` (sem base): `null` esconde a barra e o percentual. */
  readonly share: string | null;
  /** Torna o rótulo um link (ex.: as movimentações da categoria); `label` é o nome acessível do link. */
  readonly link?: BarListLink;
}

export interface BarListLink {
  readonly commands: readonly unknown[];
  readonly queryParams?: Readonly<Record<string, string>>;
  readonly label: string;
}

/** "Outras": as categorias que o backend agrupou; o último item da lista. */
export interface BarListOther {
  readonly amount: Money;
  readonly share: string | null;
  readonly categories: number;
}

/**
 * Barras horizontais de categoria (DS 02, M34; o donut foi descartado: exige ângulo e legenda e lê pior por
 * teclado). Lista semântica (`<ul>`): o **valor e o percentual estão em texto** e a barra é só reforço
 * (`aria-hidden`), então a cor nunca é o único sinal. O `share` vem do backend e é só **formatado**
 * (`formatRatio`); a largura da barra posiciona esse mesmo número, sem aritmética. Valor negativo usa o tom
 * de risco com o sinal no texto. Entra na viewport revelando as barras (≤ 300 ms; sem animação com
 * `prefers-reduced-motion`). Presentational.
 */
@Component({
  selector: 'app-bar-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="bl" [class.is-pending]="pending()" [attr.data-cy]="cy()">
      @for (row of rows(); track row.id) {
        <li
          class="bl__row"
          [class.is-negative]="row.negative"
          [attr.data-cy]="cy() + '-item-' + row.id"
        >
          <div class="bl__head">
            @if (row.link; as link) {
              <a
                class="bl__label bl__link"
                [routerLink]="link.commands"
                [queryParams]="link.queryParams"
                [attr.aria-label]="link.label"
                [attr.data-cy]="cy() + '-link-' + row.id"
                >{{ row.label }}</a
              >
            } @else {
              <span class="bl__label">{{ row.label }}</span>
            }
            <span class="bl__value">
              <span class="num bl__amount">{{ row.amountText }}</span>
              @if (row.shareText) {
                <span class="num bl__share">{{ row.shareText }}</span>
              }
            </span>
          </div>
          @if (row.bar !== null) {
            <div class="bl__track" aria-hidden="true">
              <!-- Largura = o share do backend (posicionamento, não conta). -->
              <!-- eslint-disable-next-line @angular-eslint/template/no-inline-styles -->
              <div class="bl__fill" [style.width.%]="row.bar"></div>
            </div>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    .bl {
      display: grid;
      gap: var(--space-3);
    }

    .bl__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: var(--text-sm);
    }

    .bl__label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .bl__link {
      color: inherit;
      text-decoration: none;
    }

    /* Alvo de toque de 44 px sem mudar o desenho da linha. */
    @media (pointer: coarse) {
      .bl__link {
        padding-block: var(--space-3);
        margin-block: calc(var(--space-3) * -1);
      }
    }

    .bl__link:hover {
      text-decoration: underline;
    }

    .bl__link:focus-visible {
      border-radius: 4px;
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .bl__value {
      display: inline-flex;
      flex: none;
      align-items: baseline;
      gap: var(--space-2);
    }

    .bl__share {
      min-width: 3.25rem;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      text-align: right;
    }

    .bl__track {
      height: 0.375rem;
      margin-top: var(--space-1);
      border-radius: var(--radius-pill);
      background-color: var(--color-surface-muted);
    }

    .bl__fill {
      height: 100%;
      min-width: 2px;
      border-radius: var(--radius-pill);
      background-color: var(--color-chart-1);
      clip-path: inset(0);
      transition: clip-path var(--duration-slow) var(--ease-emphasized);
    }

    /* Revela as barras da esquerda para a direita quando a lista entra na viewport. */
    .bl.is-pending .bl__fill {
      clip-path: inset(0 100% 0 0);
    }

    .is-negative .bl__amount {
      color: var(--color-risk);
    }

    .is-negative .bl__fill {
      background-color: var(--color-risk);
    }

    @media (prefers-reduced-motion: reduce) {
      .bl__fill,
      .bl.is-pending .bl__fill {
        clip-path: none;
        transition: none;
      }
    }

    @media (forced-colors: active) {
      .bl__fill {
        background-color: CanvasText;
      }
    }
  `,
})
export class BarListComponent {
  private readonly i18n = inject(I18nService);
  protected readonly pending = revealOnEnter();

  readonly items = input.required<readonly BarListItem[]>();
  readonly other = input<BarListOther | null>(null);
  readonly cy = input('bar-list');

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly rows = computed(() => {
    const t = this.i18n.t();
    const locale = this.locale();
    const all = [
      ...this.items().map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        share: item.share,
        link: item.link,
      })),
    ];
    const other = this.other();
    if (other) {
      all.push({
        id: 'other',
        label:
          other.categories === 1
            ? t.charts.otherOne
            : interpolate(t.charts.other, { count: String(other.categories) }),
        amount: other.amount,
        share: other.share,
        link: undefined,
      });
    }
    return all.map((row) => {
      const bar = row.share === null ? null : ratioForBar(row.share);
      return {
        id: row.id,
        label: row.label,
        link: row.link,
        negative: row.amount.amount.startsWith('-'),
        amountText: formatMoney(row.amount),
        shareText: row.share === null ? '' : formatRatio(row.share, locale),
        // Posiciona a barra (0 a 100%); o valor negativo e o fora do formato não desenham barra.
        bar: bar === null ? null : Math.min(100, Math.max(0, Math.round(bar * 10_000) / 100)),
      };
    });
  });
}
