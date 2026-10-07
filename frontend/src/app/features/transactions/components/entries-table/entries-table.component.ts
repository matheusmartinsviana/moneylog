import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { DebtEntry, Entry } from '~/modules/transactions/core/types/entry';
import { formatCompetence, formatIsoDate } from '~/util/date';
import { isNegative } from '~/util/money';

/**
 * Visão Por competência: uma linha por lançamento (coluna principal Competência; a compra parcelada
 * aparece como "Notebook 1/6" na competência da parcela). O valor é o da lente, como a API devolveu
 * (reembolso negativo em consumo; compra no cartão, uma parcela por competência). Presentational.
 */
@Component({
  selector: 'app-entries-table',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entries-table.component.html',
  styleUrl: './entries-table.component.css',
})
export class EntriesTableComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly items = input.required<readonly Entry[]>();
  /** Consumo de dívidas sem movimentação (já nos totais): linhas que levam à dívida, não a uma movimentação. */
  readonly debtItems = input<readonly DebtEntry[]>([]);
  readonly open = output<Entry>();
  readonly openDebt = output<DebtEntry>();

  protected negative = isNegative;

  protected competence(entry: Entry): string {
    return formatCompetence(entry.competence, HTML_LANG[this.i18n.language()]);
  }

  /** "Notebook 1/6": a parcela vem do backend (`installment`), junto da descrição (T70 CA1). */
  protected description(entry: Entry): string {
    return entry.installment
      ? `${entry.description} ${entry.installment.number}/${entry.installment.total}`
      : entry.description;
  }

  protected date(entry: Entry | DebtEntry): string {
    return formatIsoDate(entry.date, HTML_LANG[this.i18n.language()]);
  }

  protected debtCompetence(entry: DebtEntry): string {
    return formatCompetence(entry.competence, HTML_LANG[this.i18n.language()]);
  }

  protected debtLabel(entry: DebtEntry): string {
    return interpolate(this.t().transactions.openDebt, { description: entry.description });
  }

  protected openLabel(entry: Entry): string {
    return interpolate(this.t().transactions.open, { description: entry.description });
  }

  protected onKeydown(event: KeyboardEvent, entry: Entry): void {
    const row = event.currentTarget as HTMLElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open.emit(entry);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (
        event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling
      ) as HTMLElement | null;
      next?.focus();
    }
  }
}
