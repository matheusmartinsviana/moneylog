import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { flowOf, flowSign } from '~/app/features/transactions/transaction-flow';
import { transactionLabel } from '~/app/features/transactions/transaction-label';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { formatIsoDate } from '~/util/date';

/** Uma movimentação como item de lista (celular). Presentational: o valor é o que a API devolveu. */
@Component({
  selector: 'li[app-transaction-list-item]',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'item row-hover',
    '[class.is-voided]': "transaction().status === 'VOIDED'",
    '[class.is-workspace]': 'glyph()',
    '[attr.data-cy]': "'transaction-item-' + transaction().id",
    tabindex: '0',
    '[attr.aria-label]': 'label()',
    '(click)': 'open.emit(transaction())',
    '(keydown.enter)': 'open.emit(transaction())',
  },
  template: `
    @let tx = transaction();
    @if (glyph()) {
      <!-- Glifo neutro com a inicial da categoria: não há dado de comerciante, então nenhum logotipo (M37). -->
      <span class="item__glyph" aria-hidden="true" data-cy="item-glyph">{{ initial() }}</span>
    }
    <div class="item__main">
      <span class="item__description">{{ title() }}</span>
      <span class="item__meta">
        {{ tx.category?.name ?? t().transactions.noCategory }} ·
        {{ tx.account?.name ?? tx.card?.name }} ·
        {{ dateLabel() ?? date() }}
      </span>
      @if (tx.status === 'VOIDED') {
        <span class="item__tag status" data-tone="warning">{{ t().transactions.voided }}</span>
      }
    </div>
    <span class="item__amount" [class.is-in]="flow() === 'in'"
      >{{ sign() }}<app-money [value]="tx.amount"
    /></span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-control);
      background-color: var(--color-surface-inset);
      list-style: none;
      cursor: pointer;
    }
    :host(:last-child) {
      margin-bottom: 0;
    }
    .item__main {
      display: grid;
      flex: 1;
      gap: var(--space-1);
      min-width: 0;
    }
    .item__glyph {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-icon);
      background-color: var(--color-surface-muted);
      color: var(--color-text);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
    }
    :host(.is-workspace) {
      align-items: center;
      padding-inline: var(--space-2);
      border-radius: var(--radius-control);
    }
    :host(:focus-visible) {
      outline: none;
      box-shadow: var(--focus-ring);
    }
    .item__description {
      font-weight: var(--weight-medium);
      overflow-wrap: anywhere;
    }
    .item__meta {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
    .item__tag {
      width: fit-content;
    }
    .item__amount {
      white-space: nowrap;
      font-weight: var(--weight-semibold);
    }
    .item__amount.is-in {
      color: var(--color-positive);
    }
    :host(.is-voided) .item__description,
    :host(.is-voided) .item__amount {
      text-decoration: line-through;
      color: var(--color-text-muted);
    }
  `,
})
export class TransactionListItemComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly transaction = input.required<Transaction>();
  readonly accountId = input<string | null>(null);
  /** Variante do Início: glifo com a inicial da categoria à esquerda (sem logotipo de comerciante). */
  readonly glyph = input(false);
  /** Rótulo da data já traduzido ("Hoje", "Ontem"), no lugar da data completa. */
  readonly dateLabel = input<string | null>(null);
  readonly open = output<Transaction>();

  protected readonly title = computed(() =>
    transactionLabel(this.transaction(), this.t().transactions.types),
  );
  protected readonly flow = computed(() => flowOf(this.transaction(), this.accountId()));
  protected readonly sign = computed(() => flowSign(this.flow()));
  protected readonly date = computed(() =>
    formatIsoDate(this.transaction().date, HTML_LANG[this.i18n.language()]),
  );
  protected readonly initial = computed(() => {
    const name = this.title();
    return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '·';
  });
  protected readonly label = computed(() =>
    interpolate(this.t().transactions.open, { description: this.title() }),
  );
}
