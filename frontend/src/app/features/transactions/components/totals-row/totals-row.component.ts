import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { EntryTotals } from '~/modules/transactions/core/types/entry';
import type { TransactionTotals } from '~/modules/transactions/core/types/transaction';
import { isNegative } from '~/util/money';

/**
 * Totais do filtro **inteiro**, exatamente como o backend os calculou (S-79, S-80). Presentational:
 * mostra `count`, entradas, saídas e líquido (registros) ou `total` e a quebra por categoria
 * (competência). Nada é somado aqui, mesmo que a página exibida traga outras linhas.
 *
 * `variant`: `footer` é a linha fixa no rodapé da tabela (desktop); `summary` é o resumo fixo acima da
 * lista no celular. Com filtro de conta, o líquido é "Movimento da conta" (revisão A25); com
 * `status=VOIDED`, a nota "estornadas não entram nos totais" (S-80).
 */
@Component({
  selector: 'app-totals-row',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './totals-row.component.html',
  styleUrl: './totals-row.component.css',
})
export class TotalsRowComponent {
  protected readonly t = inject(I18nService).t;

  readonly variant = input<'footer' | 'summary'>('footer');
  readonly recordTotals = input<TransactionTotals | null>(null);
  readonly entryTotals = input<EntryTotals | null>(null);
  readonly accountScoped = input(false);
  readonly voidedOnly = input(false);

  protected readonly netLabel = computed(() =>
    this.accountScoped()
      ? this.t().transactions.totals.netAccount
      : this.t().transactions.totals.net,
  );
  protected readonly cy = computed(() => `totals-${this.variant()}`);

  protected negative = isNegative;
}
