import { render, screen } from '@testing-library/angular';

import { pt } from '~/app/common/i18n/translations/pt';
import { GoalStageLadderComponent } from '~/app/features/goals/components/goal-stage-ladder/goal-stage-ladder.component';
import type { GoalStage } from '~/modules/goals/core/types/goal';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(stage: GoalStage) {
  return render(GoalStageLadderComponent, {
    inputs: { stage },
    providers: [provideI18nTesting('pt')],
  });
}

const state = (stage: GoalStage) => screen.getByTestId(`goal-stage-${stage}`).dataset['state'];

describe('GoalStageLadderComponent', () => {
  it('Dado Objetivo, então mostra os 5 degraus, destaca o atual e dá a dica do próximo passo', async () => {
    await setup('OBJECTIVE');

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(state('FANTASY')).toBe('done');
    expect(state('OBJECTIVE')).toBe('current');
    expect(state('STRATEGY')).toBe('todo');
    expect(screen.getByTestId('goal-stage-OBJECTIVE')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('goal-stage-OBJECTIVE')).toHaveTextContent(pt.goals.ladder.here);
    expect(screen.getByTestId('goal-ladder-hint')).toHaveTextContent(
      'Próximo passo: Escreva um plano ou adicione uma ação',
    );
  });

  it('Dado Fantasia, então a dica é definir um prazo', async () => {
    await setup('FANTASY');

    expect(screen.getByTestId('goal-ladder-hint')).toHaveTextContent('Defina um prazo');
  });

  it('Dado Estratégia, então a dica é cumprir o ritmo por 2 meses', async () => {
    await setup('STRATEGY');

    expect(screen.getByTestId('goal-ladder-hint')).toHaveTextContent('Cumpra o ritmo por 2 meses');
  });

  it('Dado Sucesso, então todos os degraus estão concluídos, com texto e não só cor', async () => {
    await setup('ACHIEVED');

    for (const stage of ['FANTASY', 'OBJECTIVE', 'STRATEGY', 'CONSISTENT', 'ACHIEVED'] as const) {
      expect(state(stage)).toBe('done');
      expect(screen.getByTestId(`goal-stage-${stage}`)).toHaveTextContent(pt.goals.ladder.done);
    }
  });

  it('Dado a escada, então não tem violações de acessibilidade', async () => {
    const { container } = await setup('STRATEGY');

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
