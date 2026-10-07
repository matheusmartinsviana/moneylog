import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { MonthSummary, PAYMENT_METHODS } from '~/modules/dashboard/core/types/dashboard-summary';
import { isNegative, isPositive } from '~/util/money';

/**
 * Contexto do mês (competência): receitas, consumo e saldo do mês em destaque; abaixo, a composição
 * do consumo e o fluxo de caixa. Todos os valores são os recebidos (S-23, S-10).
 */
@Component({
  selector: 'app-month-summary',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-summary.component.html',
  styleUrl: './month-summary.component.css',
})
export class MonthSummaryComponent {
  protected readonly t = inject(I18nService).t;
  protected readonly methods = PAYMENT_METHODS;

  readonly month = input.required<MonthSummary>();

  protected readonly netNegative = computed(() => isNegative(this.month().net));
  /** "Gastos pagos por outra pessoa" (S-137): a linha só aparece quando há valor; já está no consumo. */
  protected readonly hasDebtConsumption = computed(() => {
    const value = this.month().debtConsumption;
    return value !== null && isPositive(value);
  });
}
