import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { GoalPlanComponent } from '~/app/features/goals/components/goal-plan/goal-plan.component';
import type { Goal, GoalAction } from '~/modules/goals/core/types/goal';
import { brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aMetricGoal } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { todayIso } from '~/util/date';

vi.setConfig({ testTimeout: 30_000 });

const action = (overrides: Partial<GoalAction> = {}): GoalAction => ({
  id: 'a-1',
  title: 'Pagar a fatura inteira',
  frequency: 'MONTHLY',
  doneIn: [],
  ...overrides,
});

async function setup(goal: Goal, inputs: Record<string, unknown> = {}) {
  const outputs = {
    noteSaved: vi.fn(),
    actionAdded: vi.fn(),
    actionUpdated: vi.fn(),
    actionRemoved: vi.fn(),
    checkedIn: vi.fn(),
  };
  const result = await render(GoalPlanComponent, {
    inputs: { goal, ...inputs },
    on: outputs,
    providers: [provideI18nTesting('pt')],
  });
  return { ...result, outputs };
}

describe('GoalPlanComponent', () => {
  it('Dado o plano automático, então mostra o ritmo por mês, meses, marco e "No ritmo" como o servidor devolveu', async () => {
    await setup(aMetricGoal({ onTrack: true, gap: brl('50.00') }));

    expect(screen.getByTestId('goal-plan-suggestion')).toHaveTextContent(
      /Para chegar até .*2027.*, são R\$\s500,00 por mês\./,
    );
    expect(screen.getByTestId('goal-plan-months')).toHaveTextContent('8');
    expect(screen.getByTestId('goal-plan-milestone')).toHaveTextContent(/7\.500,00/);
    expect(screen.getByTestId('goal-plan-on-track')).toHaveTextContent('No ritmo');
  });

  it('Dado atraso, então mostra "Atrasado em" com o valor positivo do servidor', async () => {
    await setup(aMetricGoal({ onTrack: false, gap: brl('-120.00') }));

    expect(screen.getByTestId('goal-plan-behind')).toHaveTextContent(/Atrasado em R\$\s120,00/);
  });

  it('Dado meta sem prazo, então pede um prazo em vez de mostrar ritmo', async () => {
    await setup(
      aMetricGoal({ deadline: null, requiredPace: null, monthsLeft: null, onTrack: null }),
    );

    expect(screen.getByTestId('goal-plan-no-pace')).toBeInTheDocument();
    expect(screen.queryByTestId('goal-plan-suggestion')).toBeNull();
  });

  it('Dado o texto do plano alterado, quando salvo, então emite o texto aparado', async () => {
    const { outputs } = await setup(aMetricGoal());
    const save = screen.getByTestId('goal-plan-note-save');
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByTestId('goal-plan-note'), '  Pagar em dia ');
    await userEvent.click(save);

    expect(outputs.noteSaved).toHaveBeenCalledWith('Pagar em dia');
  });

  it('Dado nenhuma ação, então explica e oferece adicionar; ao salvar, emite título e frequência', async () => {
    const { outputs } = await setup(aMetricGoal());
    expect(screen.getByTestId('goal-plan-actions-empty')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('goal-action-add'));
    await userEvent.type(screen.getByTestId('goal-action-title'), ' Revisar as dívidas ');
    await userEvent.click(screen.getByTestId('goal-action-frequency-WEEKLY'));
    await userEvent.click(screen.getByTestId('goal-action-save'));

    expect(outputs.actionAdded).toHaveBeenCalledWith({
      title: 'Revisar as dívidas',
      frequency: 'WEEKLY',
    });
  });

  it('Dado título vazio, quando salvo, então não emite', async () => {
    const { outputs } = await setup(aMetricGoal());

    await userEvent.click(screen.getByTestId('goal-action-add'));
    await userEvent.click(screen.getByTestId('goal-action-save'));

    expect(outputs.actionAdded).not.toHaveBeenCalled();
  });

  it('Dado o limite de 10 ações, então bloqueia o adicionar e diz por quê', async () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      action({ id: `a-${i}`, title: `Ação ${i}` }),
    );
    await setup(aMetricGoal({ actions }));

    expect(screen.getByTestId('goal-action-add')).toBeDisabled();
    expect(screen.getByTestId('goal-action-limit')).toHaveTextContent('10');
  });

  it('Dado uma ação, quando marco o período atual, então emite o check-in do mês', async () => {
    const { outputs } = await setup(aMetricGoal({ actions: [action()] }));
    const button = screen.getByTestId('goal-action-check-a-1');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);

    expect(outputs.checkedIn).toHaveBeenCalledWith({
      actionId: 'a-1',
      period: todayIso().slice(0, 7),
      done: true,
    });
  });

  it('Dado o período atual já marcado, então mostra os períodos feitos e desmarcar emite done=false', async () => {
    const month = todayIso().slice(0, 7);
    const { outputs } = await setup(
      aMetricGoal({ actions: [action({ doneIn: ['2026-08', month] })] }),
    );
    const button = screen.getByTestId('goal-action-check-a-1');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('goal-action-done-a-1')).toHaveTextContent(/ago/i);

    await userEvent.click(button);

    expect(outputs.checkedIn).toHaveBeenCalledWith({
      actionId: 'a-1',
      period: month,
      done: false,
    });
  });

  it('Dado remover, quando confirmo, então emite o id da ação', async () => {
    const { outputs } = await setup(aMetricGoal({ actions: [action()] }));

    await userEvent.click(screen.getByTestId('goal-action-remove-a-1'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remover ação' }));

    expect(outputs.actionRemoved).toHaveBeenCalledWith('a-1');
  });

  it('Dado meta arquivada, então o plano é só leitura', async () => {
    await setup(aMetricGoal({ actions: [action()] }), { locked: true });

    expect(screen.queryByTestId('goal-action-add')).toBeNull();
    expect(screen.queryByTestId('goal-action-edit-a-1')).toBeNull();
    expect(screen.getByTestId('goal-action-check-a-1')).toBeDisabled();
  });

  it('Dado erro do servidor, então mostra o aviso do plano', async () => {
    await setup(aMetricGoal(), { problem: 'Você chegou ao limite de 10 ações nesta meta.' });

    expect(screen.getByTestId('goal-plan-error')).toHaveTextContent('limite de 10 ações');
  });

  it('Dado o plano com ações, então não tem violações de acessibilidade', async () => {
    const { container } = await setup(
      aMetricGoal({ actions: [action({ doneIn: ['2026-09'] })], planNote: 'Pagar em dia' }),
    );

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
