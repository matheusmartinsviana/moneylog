import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProgressBarComponent } from '~/app/common/components/progress-bar/progress-bar.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { GoalStageBadgeComponent } from '~/app/features/goals/components/goal-stage-badge/goal-stage-badge.component';
import { goalName } from '~/app/features/goals/services/goal-name';
import type { Goal } from '~/modules/goals/core/types/goal';
import { formatRatio, ratioForBar } from '~/util/ratio';

export type FeaturedGoalStatus = 'loading' | 'ready' | 'error';

/**
 * "Meta em destaque" do Início (presentational). O servidor ainda não tem o marcador de destaque: por ora é a
 * **primeira meta ativa** (a ordem é a do servidor: prioridade, prazo, nome), com o selo do degrau e o
 * progresso como o servidor devolveu. Nada é calculado aqui. Sem metas, convida a criar uma; as fotos e o
 * seletor de destaque ficam para outra tarefa.
 */
@Component({
  selector: 'app-featured-goal',
  imports: [RouterLink, ProgressBarComponent, GoalStageBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="fg glass"
      aria-labelledby="home-featured-goal-title"
      data-cy="home-featured-goal"
    >
      <h2 class="fg__title" id="home-featured-goal-title">{{ t().brief.featuredGoal.title }}</h2>
      @switch (status()) {
        @case ('loading') {
          <p class="visually-hidden" role="status">{{ t().goals.loading }}</p>
          <div class="fg__skeleton sk" aria-hidden="true"></div>
        }
        @case ('error') {
          <button
            type="button"
            class="button"
            data-cy="home-featured-goal-retry"
            (click)="retry.emit()"
          >
            {{ t().home.error.retry }}
          </button>
        }
        @default {
          @if (view(); as goal) {
            <div class="fg__body">
              <a
                class="fg__name"
                [routerLink]="['/goals', goal.id]"
                [attr.aria-label]="goal.openLabel"
                data-cy="home-featured-goal-open"
                >{{ goal.name }}</a
              >
              <app-goal-stage-badge [stage]="goal.stage" cy="home-featured-goal-stage" />
              <app-progress-bar
                class="fg__bar"
                fieldId="home-featured-goal-progress"
                [label]="goal.name"
                [hideLabel]="true"
                [value]="goal.bar"
              />
              <span class="fg__percent num" data-cy="home-featured-goal-percent">{{
                goal.percent
              }}</span>
            </div>
          } @else {
            <div class="fg__empty">
              <p data-cy="home-featured-goal-empty">{{ t().brief.featuredGoal.empty }}</p>
              <a class="button" routerLink="/goals/new-smart" data-cy="home-featured-goal-create">
                {{ t().brief.featuredGoal.create }}
              </a>
            </div>
          }
        }
      }
    </section>
  `,
  styleUrl: './featured-goal.component.css',
})
export class FeaturedGoalComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  /** Metas ativas na ordem do servidor. */
  readonly goals = input.required<readonly Goal[]>();
  readonly status = input<FeaturedGoalStatus>('ready');
  readonly retry = output<void>();

  protected readonly view = computed(() => {
    const goal = this.goals()[0];
    if (!goal) return null;
    const name = goalName(goal, this.t().goals);
    const bar = ratioForBar(goal.progress);
    return {
      id: goal.id,
      name,
      stage: goal.stage,
      bar: bar === null ? null : Math.min(1, Math.max(0, bar)),
      percent: formatRatio(goal.progress, HTML_LANG[this.i18n.language()]),
      openLabel: interpolate(this.t().brief.featuredGoal.open, { name }),
    };
  });
}
