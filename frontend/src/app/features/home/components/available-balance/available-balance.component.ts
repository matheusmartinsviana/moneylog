import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { DashboardBalances } from '~/modules/dashboard/core/types/dashboard-summary';
import { isNegative, isPositive } from '~/util/money';

let nextId = 0;

/**
 * "Quanto tenho": o disponível em destaque e, logo abaixo, a fórmula com os valores recebidos
 * (em contas − comprometido em 30 dias − reservado, S-21). O front não refaz a conta.
 */
@Component({
  selector: 'app-available-balance',
  imports: [MoneyComponent, RouterLink, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './available-balance.component.html',
  styleUrl: './available-balance.component.css',
})
export class AvailableBalanceComponent {
  protected readonly t = inject(I18nService).t;

  readonly balances = input.required<DashboardBalances>();

  protected readonly headingId = `available-title-${++nextId}`;
  protected readonly negative = computed(() => isNegative(this.balances().available));
  /** Há valor reservado em metas: só lê o sinal do texto da API, sem somar nada. */
  protected readonly hasReserved = computed(() => isPositive(this.balances().reserved));
}
