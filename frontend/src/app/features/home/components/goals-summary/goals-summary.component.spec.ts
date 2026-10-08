import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { GoalsSummaryComponent } from '~/app/features/home/components/goals-summary/goals-summary.component';
import type { Goal } from '~/modules/goals/core/types/goal';
import { aGoal, aMetricGoal } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(goals: readonly Goal[]) {
  return render(GoalsSummaryComponent, {
    inputs: { goals },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
}

describe('GoalsSummaryComponent', () => {
  it('Dado metas ativas, então lista até 3 com o selo do degrau e o progresso do servidor', async () => {
    await setup([
      aGoal({ id: 'g-1', stage: 'FANTASY', deadline: null }),
      aMetricGoal({ id: 'g-2', stage: 'STRATEGY' }),
      aGoal({ id: 'g-3' }),
      aGoal({ id: 'g-4' }),
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('home-goal-stage-g-1')).toHaveTextContent('Fantasia');
    expect(screen.getByTestId('home-goal-stage-g-2')).toHaveTextContent('Estratégia');
    expect(screen.getByTestId('home-goal-open-g-2')).toHaveTextContent(/Total de dívidas até/);
    expect(screen.getByTestId('home-goal-percent-g-1')).toHaveTextContent('42,5%');
    expect(screen.getByTestId('home-goals-add-smart')).toHaveAttribute('href', '/goals/new-smart');
  });

  it('Dado nenhuma meta ativa, então não mostra o bloco', async () => {
    await setup([]);

    expect(screen.queryByTestId('home-goals-summary')).toBeNull();
  });
});
