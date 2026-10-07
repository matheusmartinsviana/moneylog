import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { TransactionListItemComponent } from '~/app/features/transactions/components/transaction-list-item/transaction-list-item.component';
import { Flow, flowOf, flowSign } from '~/app/features/transactions/transaction-flow';
import { transactionLabel } from '~/app/features/transactions/transaction-label';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { formatIsoDate } from '~/util/date';

/**
 * Visão Registros: tabela no desktop (Data · Descrição · Tipo · Categoria · Conta · Método · Valor)
 * e lista de itens no celular. Linhas navegáveis por setas e Enter abre o detalhe. Presentational.
 */
@Component({
  selector: 'app-records-table',
  imports: [MoneyComponent, TransactionListItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './records-table.component.html',
  styleUrl: './records-table.component.css',
})
export class RecordsTableComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly items = input.required<readonly Transaction[]>();
  /** Filtro de conta ativo (define o sentido da transferência). */
  readonly accountId = input<string | null>(null);
  readonly open = output<Transaction>();

  protected date(tx: Transaction): string {
    return formatIsoDate(tx.date, HTML_LANG[this.i18n.language()]);
  }

  protected flow(tx: Transaction): Flow {
    return flowOf(tx, this.accountId());
  }

  protected sign(tx: Transaction): string {
    return flowSign(this.flow(tx));
  }

  protected typeLabel(tx: Transaction): string {
    const labels = this.t().transactions;
    return tx.type === 'INVESTMENT' && tx.direction
      ? labels.directions[tx.direction]
      : labels.types[tx.type];
  }

  /** Conta (ou, nas movimentações de cartão, o cartão). */
  protected accountLabel(tx: Transaction): string {
    const from = tx.account?.name ?? tx.card?.name ?? '';
    return tx.counterpartAccount ? `${from} → ${tx.counterpartAccount.name}` : from;
  }

  protected title(tx: Transaction): string {
    return transactionLabel(tx, this.t().transactions.types);
  }

  protected openLabel(tx: Transaction): string {
    return interpolate(this.t().transactions.open, { description: this.title(tx) });
  }

  /** Setas sobem e descem entre as linhas; Enter abre. */
  protected onKeydown(event: KeyboardEvent, tx: Transaction): void {
    const row = event.currentTarget as HTMLElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open.emit(tx);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (
        event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling
      ) as HTMLElement | null;
      next?.focus();
    }
  }
}
