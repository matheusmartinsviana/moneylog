import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import type { IconName } from '~/app/common/components/icon/icons';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { GoalStage } from '~/modules/goals/core/types/goal';

/** Ícone de cada degrau: o degrau nunca é dito só por cor. */
export const STAGE_ICON: Readonly<Record<GoalStage, IconName>> = {
  FANTASY: 'goals',
  OBJECTIVE: 'calendar',
  STRATEGY: 'notes',
  CONSISTENT: 'insights',
  ACHIEVED: 'check',
};

/**
 * Selo do degrau da meta (presentational): ícone + texto. O `stage` é derivado no servidor; aqui só se
 * mostra. Longo prazo (sem prazo) usa o tom neutro; Consistente e Sucesso, o positivo.
 */
@Component({
  selector: 'app-goal-stage-badge',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status stage" [attr.data-tone]="tone()" [attr.data-cy]="cy()">
      <app-icon [name]="icon()" [size]="14" />
      <span>{{ label() }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .stage {
      gap: var(--space-1);
    }
  `,
})
export class GoalStageBadgeComponent {
  private readonly t = inject(I18nService).t;

  readonly stage = input.required<GoalStage>();
  readonly cy = input<string>('goal-stage');

  protected readonly icon = computed(() => STAGE_ICON[this.stage()]);
  protected readonly label = computed(() => this.t().goals.stage[this.stage()]);
  protected readonly tone = computed(() => {
    const stage = this.stage();
    if (stage === 'ACHIEVED' || stage === 'CONSISTENT') return 'positive';
    return null;
  });
}
