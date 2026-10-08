import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { MotionStaggerDirective } from '~/app/common/motion/motion-stagger.directive';
import { STAGE_ICON } from '~/app/features/goals/components/goal-stage-badge/goal-stage-badge.component';
import { GOAL_STAGES, type GoalStage } from '~/modules/goals/core/types/goal';

type StepState = 'done' | 'current' | 'todo';

/**
 * Escada de maturidade da meta (presentational): Fantasia, Objetivo, Estratégia, Consistente e Sucesso,
 * com o `stage` do servidor destacado. Cada degrau tem ícone e texto (concluído, você está aqui, adiante):
 * o estado não depende de cor. Embaixo, a dica do próximo passo.
 */
@Component({
  selector: 'app-goal-stage-ladder',
  imports: [IconComponent, MotionStaggerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-stage-ladder.component.html',
  styleUrl: './goal-stage-ladder.component.css',
})
export class GoalStageLadderComponent {
  protected readonly t = inject(I18nService).t;

  readonly stage = input.required<GoalStage>();

  protected readonly steps = computed(() => {
    const copy = this.t().goals;
    const index = GOAL_STAGES.indexOf(this.stage());
    const reached = this.stage() === 'ACHIEVED';
    return GOAL_STAGES.map((stage, i) => {
      const state: StepState = reached || i < index ? 'done' : i === index ? 'current' : 'todo';
      return {
        stage,
        state,
        icon: state === 'done' ? ('check' as const) : STAGE_ICON[stage],
        label: copy.stage[stage],
        description: copy.stageDescription[stage],
        stateLabel:
          state === 'done'
            ? copy.ladder.done
            : state === 'current'
              ? copy.ladder.here
              : copy.ladder.todo,
      };
    });
  });

  protected readonly hint = computed(() => {
    const copy = this.t().goals;
    const hint = copy.stageHint[this.stage()];
    return this.stage() === 'ACHIEVED' ? hint : interpolate(copy.ladder.next, { hint });
  });
}
