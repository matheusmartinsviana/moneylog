import { render, screen } from '@testing-library/angular';

import { GoalConsistencyComponent } from '~/app/features/goals/components/goal-consistency/goal-consistency.component';
import type { Goal } from '~/modules/goals/core/types/goal';
import { brl } from '~/testing/accounts-testing';
import { aMetricGoal } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(goal: Goal) {
  return render(GoalConsistencyComponent, {
    inputs: { goal },
    providers: [provideI18nTesting('pt')],
  });
}

describe('GoalConsistencyComponent', () => {
  it('Dado meses cumpridos, abaixo do ritmo, sem dado e em andamento, então cada um tem texto próprio', async () => {
    await setup(
      aMetricGoal({
        streak: 1,
        consistencyRate: '0.5000',
        consistency: [
          {
            month: '2026-06',
            expected: brl('1000.00'),
            actual: brl('900.00'),
            met: true,
            closed: true,
          },
          {
            month: '2026-07',
            expected: brl('900.00'),
            actual: brl('950.00'),
            met: false,
            closed: true,
          },
          { month: '2026-08', expected: brl('800.00'), actual: null, met: null, closed: true },
          {
            month: '2026-09',
            expected: brl('700.00'),
            actual: brl('720.00'),
            met: null,
            closed: false,
          },
        ],
      }),
    );

    expect(screen.getByTestId('goal-month-2026-06')).toHaveTextContent('Cumprido');
    expect(screen.getByTestId('goal-month-2026-07')).toHaveTextContent('Abaixo do ritmo');
    expect(screen.getByTestId('goal-month-2026-08')).toHaveTextContent('Sem dado');
    expect(screen.getByTestId('goal-month-2026-09')).toHaveTextContent('Em andamento');
    expect(screen.getByTestId('goal-streak')).toHaveTextContent('1');
    expect(screen.getByTestId('goal-consistency-rate')).toHaveTextContent('50');
  });

  it('Dado meta sem prazo (sem linha do tempo) e sem taxa, então explica e mostra "Sem dado"', async () => {
    await setup(aMetricGoal({ consistency: [], consistencyRate: null, deadline: null }));

    expect(screen.getByTestId('goal-consistency-empty')).toBeInTheDocument();
    expect(screen.getByTestId('goal-consistency-rate')).toHaveTextContent('Sem dado');
  });
});
