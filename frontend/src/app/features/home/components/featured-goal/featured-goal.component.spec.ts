import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import {
  FeaturedGoalComponent,
  type FeaturedGoalStatus,
} from '~/app/features/home/components/featured-goal/featured-goal.component';
import type { Goal } from '~/modules/goals/core/types/goal';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aGoal, aMetricGoal } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(goals: readonly Goal[], status: FeaturedGoalStatus = 'ready') {
  const retry = vi.fn();
  const result = await render(FeaturedGoalComponent, {
    inputs: { goals, status },
    on: { retry },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
  return { ...result, retry };
}

describe('FeaturedGoalComponent', () => {
  it('Dado metas ativas, então destaca a primeira (a do servidor) com selo do degrau e o progresso dele', async () => {
    await setup([
      aGoal({ id: 'g-1', name: 'Reserva', stage: 'STRATEGY', progress: '0.4250' }),
      aGoal({ id: 'g-2', name: 'Viagem' }),
    ]);

    expect(screen.getByTestId('home-featured-goal-open')).toHaveTextContent('Reserva');
    expect(screen.getByTestId('home-featured-goal-open')).toHaveAttribute('href', '/goals/g-1');
    expect(screen.getByTestId('home-featured-goal-stage')).toHaveTextContent('Estratégia');
    expect(screen.getByTestId('home-featured-goal-percent')).toHaveTextContent('42,5%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43');
    expect(screen.queryByText('Viagem')).not.toBeInTheDocument();
  });

  it('Dado uma meta inteligente sem nome, então usa o nome gerado pela medida', async () => {
    await setup([aMetricGoal({ name: null })]);

    expect(screen.getByTestId('home-featured-goal-open')).toHaveTextContent(/Total de dívidas até/);
  });

  it('Dado progresso acima de 100%, então a barra para em 100% e o texto diz o que o servidor disse', async () => {
    await setup([aGoal({ progress: '1.2000' })]);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByTestId('home-featured-goal-percent')).toHaveTextContent('120%');
  });

  it('Dado nenhuma meta, então convida a criar, sem número', async () => {
    await setup([]);

    expect(screen.getByTestId('home-featured-goal-empty')).toHaveTextContent(
      pt.brief.featuredGoal.empty,
    );
    expect(screen.getByTestId('home-featured-goal-create')).toHaveAttribute(
      'href',
      '/goals/new-smart',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('Dado carregando, então só o status acessível; dado erro, então "tentar de novo" emite retry', async () => {
    const { fixture, retry } = await setup([], 'loading');
    expect(screen.getByRole('status')).toHaveTextContent(pt.goals.loading);

    fixture.componentRef.setInput('status', 'error');
    fixture.detectChanges();
    await userEvent.click(screen.getByTestId('home-featured-goal-retry'));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('Dado a meta, então não há violações de acessibilidade', async () => {
    const { container } = await setup([aGoal()]);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
