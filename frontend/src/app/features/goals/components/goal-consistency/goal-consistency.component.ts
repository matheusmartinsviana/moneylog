import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { Goal } from '~/modules/goals/core/types/goal';
import { formatCompetence } from '~/util/date';
import { formatRatio } from '~/util/ratio';

/**
 * Consistência da meta (presentational): linha do tempo mensal (esperado x realizado), a sequência
 * (`streak`) e a taxa (`consistencyRate`), tudo como o servidor devolve. Mês sem dado (`actual`/`met`
 * nulos) aparece como "Sem dado", nunca como cumprido; o estado de cada mês é ícone + texto.
 */
@Component({
  selector: 'app-goal-consistency',
  imports: [IconComponent, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-consistency.component.html',
  styleUrl: './goal-consistency.component.css',
})
export class GoalConsistencyComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly goal = input.required<Goal>();

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly rate = computed(() => {
    const rate = this.goal().consistencyRate;
    return rate === null ? this.t().goals.consistency.noRate : formatRatio(rate, this.locale());
  });
  protected readonly months = computed(() => {
    const copy = this.t().goals.consistency;
    return this.goal().consistency.map((month) => {
      const state =
        month.met === true
          ? ('met' as const)
          : month.met === false
            ? ('missed' as const)
            : month.actual === null
              ? ('nodata' as const)
              : ('open' as const);
      return {
        ...month,
        label: formatCompetence(month.month, this.locale()),
        state,
        stateLabel:
          state === 'met'
            ? copy.met
            : state === 'missed'
              ? copy.notMet
              : state === 'nodata'
                ? copy.noData
                : copy.inProgress,
      };
    });
  });
}
