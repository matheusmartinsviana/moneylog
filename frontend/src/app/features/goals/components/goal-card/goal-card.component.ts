import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { ProgressBarComponent } from '~/app/common/components/progress-bar/progress-bar.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Goal } from '~/modules/goals/core/types/goal';
import { formatIsoDate } from '~/util/date';
import { formatMoney } from '~/util/money';
import { formatRatio, ratioForBar } from '~/util/ratio';

/**
 * Uma meta na lista (presentational). **Nada é calculado aqui**: o valor atual, o alvo, a razão de
 * progresso (`progress`), o que falta (`remaining`) e a estimativa mensal (`monthlyNeeded`) vêm do backend;
 * a tela só formata. A estimativa leva o rótulo "Estimativa" e o aviso de reserva descoberta é texto, nunca
 * só cor.
 */
@Component({
  selector: 'li[app-goal-card]',
  imports: [RouterLink, MoneyComponent, ProgressBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-card.component.html',
  styleUrl: './goal-card.component.css',
  host: { class: 'card', '[attr.data-cy]': "'goal-card-' + goal().id" },
})
export class GoalCardComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly goal = input.required<Goal>();

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly bar = computed(() => ratioForBar(this.goal().progress));
  protected readonly percent = computed(() => formatRatio(this.goal().progress, this.locale()));
  protected readonly progressText = computed(() => {
    const goal = this.goal();
    return interpolate(this.t().goals.card.progressText, {
      current: formatMoney(goal.current),
      target: formatMoney(goal.target),
    });
  });
  protected readonly deadline = computed(() => {
    const deadline = this.goal().deadline;
    return deadline === null
      ? this.t().goals.card.noDeadline
      : interpolate(this.t().goals.card.deadline, {
          date: formatIsoDate(deadline, this.locale(), 'long'),
        });
  });
  protected readonly openLabel = computed(() =>
    interpolate(this.t().goals.card.open, { name: this.goal().name }),
  );
  protected readonly progressLabel = computed(() =>
    interpolate(this.t().goals.card.progressLabel, { name: this.goal().name }),
  );
  protected readonly priority = computed(() =>
    interpolate(this.t().goals.priorityTag, {
      priority: this.t().goals.priority[this.goal().priority],
    }),
  );
}
