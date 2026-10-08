import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { GoalStageBadgeComponent } from '~/app/features/goals/components/goal-stage-badge/goal-stage-badge.component';
import { goalName } from '~/app/features/goals/services/goal-name';
import type { Goal } from '~/modules/goals/core/types/goal';
import { formatRatio } from '~/util/ratio';

/** Quantas metas o resumo mostra (a ordem é a do servidor: prioridade, prazo, nome). */
const LIMIT = 3;

/**
 * Resumo de metas no Início (presentational): até 3 metas ativas com o selo do degrau (`stage`) e o
 * progresso que o servidor devolveu. Não calcula nada e some se não há metas ativas.
 */
@Component({
  selector: 'app-goals-summary',
  imports: [RouterLink, SectionContainerComponent, GoalStageBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length > 0) {
      <app-section-container
        [heading]="t().goals.summary.title"
        [description]="t().goals.summary.description"
      >
        <ul class="goals" data-cy="home-goals-summary">
          @for (item of items(); track item.goal.id) {
            <li class="goals__item row-card" [attr.data-cy]="'home-goal-' + item.goal.id">
              <a
                class="goals__name"
                [routerLink]="['/goals', item.goal.id]"
                [attr.data-cy]="'home-goal-open-' + item.goal.id"
                >{{ item.name }}</a
              >
              <app-goal-stage-badge
                [stage]="item.goal.stage"
                [cy]="'home-goal-stage-' + item.goal.id"
              />
              <span
                class="goals__percent num"
                [attr.data-cy]="'home-goal-percent-' + item.goal.id"
                >{{ item.percent }}</span
              >
            </li>
          }
        </ul>
        <div class="goals__actions">
          <a class="button" routerLink="/goals" data-cy="home-goals-view-all">
            {{ t().goals.summary.viewAll }}
          </a>
          <a class="button" routerLink="/goals/new-smart" data-cy="home-goals-add-smart">
            {{ t().goals.summary.add }}
          </a>
        </div>
      </app-section-container>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .goals {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .goals__item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
    }

    .goals__name {
      color: var(--color-text);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
      text-decoration: none;
    }

    .goals__percent {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .goals__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
  `,
})
export class GoalsSummaryComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly goals = input.required<readonly Goal[]>();

  protected readonly items = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    return this.goals()
      .slice(0, LIMIT)
      .map((goal) => ({
        goal,
        name: goalName(goal, this.t().goals),
        percent: formatRatio(goal.progress, locale),
      }));
  });
}
