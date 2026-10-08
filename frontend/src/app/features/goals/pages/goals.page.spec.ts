import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { GoalsPage } from '~/app/features/goals/pages/goals.page';
import {
  AccountsGatewayStub,
  anAccount,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aGoal, aMetricGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(gateway = new GoalsGatewayStub(), status?: string) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
  const result = await render(GoalsPage, {
    inputs: { status },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideGoalsStub(gateway),
      provideAccountsStub(accounts),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

describe('GoalsPage', () => {
  it('Dado nenhuma meta, então o estado vazio mostra "Criar meta" habilitado, levando ao formulário', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.goals.title);
    const action = screen.getByTestId('empty-state-action-create-goal');
    expect(action).toHaveAttribute('href', '/goals/new');
    expect(action).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('goals-add')).toHaveAttribute('href', '/goals/new');
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.listError = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('goals-loading')).toHaveTextContent(pt.goals.loading);
  });

  it('Dado a meta de 8.500,00 de 20.000,00, então mostra 42,5% VINDO de progress, o que falta e a estimativa rotulada do backend', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal()];
    await setup(gateway);

    expect(text(screen.getByTestId('goal-percent-goal-1'))).toBe('42,5%');
    expect(text(screen.getByTestId('goal-remaining-goal-1'))).toBe('R$ 11.500,00');
    expect(text(screen.getByTestId('goal-monthly-goal-1'))).toContain('Estimativa');
    expect(text(screen.getByTestId('goal-monthly-goal-1'))).toContain('R$ 766,67');
    expect(text(screen.getByTestId('goal-deadline-goal-1'))).toBe('Prazo: 31 de dezembro de 2027');
    expect(screen.getByTestId('goal-progress-goal-1')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar').getAttribute('aria-valuetext')?.replace(/\s/g, ' '),
    ).toBe('R$ 8.500,00 de R$ 20.000,00');
    expect(screen.getByTestId('goal-open-goal-1')).toHaveAttribute('href', '/goals/goal-1');
  });

  it('Dado progresso acima de 100%, então mostra o que o backend mandou, sem limitar', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ progress: '1.2500', status: 'ACHIEVED', monthlyNeeded: null })];
    await setup(gateway, 'ACHIEVED');

    expect(text(screen.getByTestId('goal-percent-goal-1'))).toBe('125%');
    expect(screen.getByTestId('goal-status-goal-1')).toHaveTextContent('Atingida');
    expect(screen.getByTestId('goal-achieved-goal-1')).toHaveTextContent(pt.goals.card.achieved);
    expect(screen.queryByTestId('goal-monthly-goal-1')).not.toBeInTheDocument();
  });

  it('Dado meta sem prazo, então diz "Sem prazo"', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ deadline: null, monthlyNeeded: null })];
    await setup(gateway);

    expect(text(screen.getByTestId('goal-deadline-goal-1'))).toBe('Sem prazo');
  });

  it('Dado uncovered, então o aviso é um texto, sem bloquear', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ uncovered: true })];
    await setup(gateway);

    expect(screen.getByTestId('goal-uncovered-goal-1')).toHaveTextContent(pt.goals.uncovered.title);
    expect(screen.getByTestId('goal-reserve-goal-1')).toBeEnabled();
  });

  it('Dado a aba Atingidas na URL, então pede só as atingidas; vazio diz isso', async () => {
    const { gateway } = await setup(new GoalsGatewayStub(), 'ACHIEVED');

    expect(gateway.queries[0]).toMatchObject({ status: 'ACHIEVED' });
    expect(screen.getByTestId('goals-empty-achieved')).toBeInTheDocument();
    expect(screen.getByTestId('goals-tab-achieved')).toHaveAttribute('aria-current', 'page');
  });

  it('Dado erro, então oferece "tentar de novo" e recarrega', async () => {
    const gateway = new GoalsGatewayStub();
    const { failWith } = await import('~/testing/accounts-testing');
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    expect(screen.getByTestId('empty-state-action-retry')).toBeInTheDocument();
    gateway.listError = null;
    gateway.goals = [aGoal()];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('goal-card-goal-1')).toBeInTheDocument();
  });

  it('Dado "Reservar" num card, então abre a folha da meta, que reserva e recarrega a lista', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal()];
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('goal-reserve-goal-1'));
    expect(await screen.findByTestId('reserve-form')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('reserve-account'));
    await userEvent.click(screen.getByTestId('reserve-account-option-acc-1'));
    await userEvent.type(screen.getByTestId('reserve-amount'), '100,00');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    await fixture.whenStable();

    expect(gateway.reservations[0]).toMatchObject({
      goalId: 'goal-1',
      input: { kind: 'reserve', accountId: 'acc-1', amount: '100.00' },
    });
    expect(gateway.queries.length).toBeGreaterThanOrEqual(2);
  });

  it('Dado a lista, então não tem violações de acessibilidade', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal(), aGoal({ id: 'goal-2', name: 'Viagem', uncovered: true })];
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado "Quitar todas as dívidas", então cria a meta sem nome nem alvo e abre o detalhe dela', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = of(aGoal({ id: 'goal-9', kind: 'DEBT_PAYOFF' }));
    await setup(gateway);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('goals-add-payoff'));

    expect(gateway.creates).toEqual([
      { kind: 'DEBT_PAYOFF', name: '', target: '', deadline: null, description: null },
    ]);
    expect(navigate).toHaveBeenCalledWith(['/goals', 'goal-9']);
  });

  it('Dado erro DEBT_PAYOFF_GOAL_EXISTS, então mostra o motivo do servidor', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(422, 'DEBT_PAYOFF_GOAL_EXISTS');
    await setup(gateway);

    await userEvent.click(screen.getByTestId('goals-add-payoff'));

    expect(screen.getByTestId('goals-payoff-error')).toHaveTextContent(
      pt.errors.codes['DEBT_PAYOFF_GOAL_EXISTS']!,
    );
  });

  it('Dado já existir a meta de quitar dívidas, então não oferece criar outra nem reservar nela', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ id: 'goal-9', kind: 'DEBT_PAYOFF', baselineSet: false })];
    await setup(gateway);

    expect(screen.queryByTestId('goals-add-payoff')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-reserve-goal-9')).not.toBeInTheDocument();
    expect(screen.getByTestId('goal-building-goal-9')).toHaveTextContent(pt.goals.payoff.building);
    expect(screen.queryByTestId('goal-percent-goal-9')).not.toBeInTheDocument();
  });
  it('Dado metas de reserva e de medida, então cada card mostra o degrau; só a de reserva tem "Reservar"; e há o atalho de meta inteligente', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [
      aGoal({ id: 'g-1', stage: 'FANTASY', deadline: null }),
      aMetricGoal({ id: 'g-2' }),
    ];
    await setup(gateway);

    expect(screen.getByTestId('goals-add-smart')).toHaveAttribute('href', '/goals/new-smart');
    expect(screen.getByTestId('goal-stage-g-1')).toHaveTextContent('Fantasia');
    expect(screen.getByTestId('goal-stage-g-2')).toHaveTextContent('Objetivo');
    expect(screen.getByTestId('goal-open-g-2')).toHaveTextContent(/Total de dívidas até/);
    expect(text(screen.getByTestId('goal-current-g-2'))).toBe('R$ 8.000,00');
    expect(screen.getByTestId('goal-reserve-g-1')).toBeInTheDocument();
    expect(screen.queryByTestId('goal-reserve-g-2')).toBeNull();
  });

  it('Dado meta de medida arquivada, então o card diz que não é calculada', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [
      aMetricGoal({ id: 'g-2', status: 'ARCHIVED', current: null, remaining: null }),
    ];
    await setup(gateway, 'ARCHIVED');

    expect(screen.getByTestId('goal-not-calculated-g-2')).toHaveTextContent(
      pt.goals.archivedMetric,
    );
  });
});
