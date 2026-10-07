import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { GoalPage } from '~/app/features/goals/pages/goal.page';
import type { Goal } from '~/modules/goals/core/types/goal';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aGoal, aReservation, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(gateway = new GoalsGatewayStub()) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [
    anAccount({ id: 'acc-1', name: 'Nubank' }),
    anAccount({ id: 'acc-2', name: 'Carteira', type: 'WALLET' }),
  ];
  const result = await render(GoalPage, {
    inputs: { id: 'goal-1' },
    providers: [
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideRouter([]),
      provideGoalsStub(gateway),
      provideAccountsStub(accounts),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};

describe('GoalPage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    expect(await screen.findByTestId('goal-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('goal-notes-new')).toBeInTheDocument();
  });

  it('Dado a meta, então mostra tudo o que o backend calculou: 42,5%, valores, faltam, estimativa rotulada e a explicação de que reservar não move dinheiro', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reserva de emergência');
    expect(text(screen.getByTestId('goal-percent'))).toBe('42,5%');
    expect(text(screen.getByTestId('goal-target'))).toBe('R$ 20.000,00');
    expect(text(screen.getByTestId('goal-current'))).toBe('R$ 8.500,00');
    expect(text(screen.getByTestId('goal-remaining'))).toBe('R$ 11.500,00');
    expect(text(screen.getByTestId('goal-monthly'))).toContain('Estimativa');
    expect(text(screen.getByTestId('goal-monthly'))).toContain('R$ 766,67');
    expect(screen.getByTestId('goal-monthly-note')).toBeInTheDocument();
    expect(screen.getByTestId('goal-not-money')).toHaveTextContent(pt.goals.detail.notMoney);
  });

  it('Dado as reservas, então lista conta, data e valor, e a liberação aparece em texto', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [
      aGoal({
        reservations: [
          aReservation({
            id: 'res-2',
            amount: brl('-2000.00'),
            date: '2026-10-12',
            note: 'Usei na emergência',
          }),
          aReservation(),
        ],
      }),
    ];
    await setup(gateway);

    expect(text(screen.getByTestId('reservation-kind-res-2'))).toBe('Liberação');
    expect(text(screen.getByTestId('reservation-amount-res-2'))).toBe('R$ 2.000,00');
    expect(text(screen.getByTestId('reservation-account-res-2'))).toBe('Em Nubank');
    expect(text(screen.getByTestId('reservation-note-res-2'))).toBe('Usei na emergência');
    expect(text(screen.getByTestId('reservation-kind-res-1'))).toBe('Reserva');
  });

  it('Dado nenhuma reserva, então diz isso e "Liberar" fica desabilitado', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ reservations: [], current: brl('0.00'), progress: '0.0000' })];
    await setup(gateway);

    expect(screen.getByTestId('goal-no-reservations')).toBeInTheDocument();
    expect(screen.getByTestId('goal-release')).toBeDisabled();
  });

  it('Dado "Reservar", então a folha pede conta, valor, data e nota, e explica que não move dinheiro', async () => {
    const { gateway, fixture } = await setup();

    await userEvent.click(screen.getByTestId('goal-reserve'));
    expect(await screen.findByTestId('reserve-form')).toBeInTheDocument();
    expect(screen.getByTestId('reserve-not-money')).toBeInTheDocument();
    for (const id of ['reserve-account', 'reserve-amount', 'reserve-date', 'reserve-note']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    await pick('reserve-account', 'acc-1');
    await userEvent.type(screen.getByTestId('reserve-amount'), '1000,00');
    await userEvent.type(screen.getByTestId('reserve-note'), 'Bônus');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    await fixture.whenStable();

    expect(gateway.reservations[0]).toMatchObject({
      goalId: 'goal-1',
      input: { kind: 'reserve', accountId: 'acc-1', amount: '1000.00', note: 'Bônus' },
    });
    expect(gateway.reservations[0]?.key).toBeTruthy();
  });

  it('Dado a meta devolvida pela reserva, então ela vira o estado, sem chute', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = new Subject<Goal>();
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('goal-reserve'));
    await pick('reserve-account', 'acc-1');
    await userEvent.type(screen.getByTestId('reserve-amount'), '1000,00');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    (gateway.reserve$ as Subject<Goal>).next(
      aGoal({ current: brl('9500.00'), progress: '0.4750', remaining: brl('10500.00') }),
    );
    (gateway.reserve$ as Subject<Goal>).complete();
    await fixture.whenStable();

    expect(text(screen.getByTestId('goal-percent'))).toBe('47,5%');
    expect(text(screen.getByTestId('goal-current'))).toBe('R$ 9.500,00');
    expect(screen.queryByTestId('reserve-form')).not.toBeInTheDocument();
  });

  it('Dado "Liberar", então a chave Liberar manda o valor como liberação e só oferece as contas da meta', async () => {
    const { gateway, fixture } = await setup();

    await userEvent.click(screen.getByTestId('goal-release'));
    expect(await screen.findByTestId('reserve-form')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('reserve-account'));
    expect(screen.getByTestId('reserve-account-option-acc-1')).toBeInTheDocument();
    expect(screen.queryByTestId('reserve-account-option-acc-2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('reserve-account-option-acc-1'));
    await userEvent.type(screen.getByTestId('reserve-amount'), '2000,00');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    await fixture.whenStable();

    expect(gateway.reservations[0]?.input).toMatchObject({ kind: 'release', amount: '2000.00' });
  });

  it('Dado liberar acima do reservado (422), então o erro vai para o valor', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = failWith(422, 'GOAL_RELEASE_EXCEEDS_RESERVED');
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('goal-release'));
    await pick('reserve-account', 'acc-1');
    await userEvent.type(screen.getByTestId('reserve-amount'), '99999,00');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    await fixture.whenStable();

    expect(screen.getByTestId('reserve-amount')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado falha de rede ao reservar, então "tentar de novo" reenvia com a MESMA chave', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.reserve$ = failWith(0, 'NETWORK');
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('goal-reserve'));
    await pick('reserve-account', 'acc-1');
    await userEvent.type(screen.getByTestId('reserve-amount'), '50,00');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    await fixture.whenStable();

    expect(screen.getByTestId('reserve-error')).toHaveTextContent(pt.errors.network);
    gateway.reserve$ = null;
    await userEvent.click(screen.getByTestId('reserve-retry'));
    await fixture.whenStable();

    expect(gateway.reservations).toHaveLength(2);
    expect(gateway.reservations[1]?.key).toBe(gateway.reservations[0]?.key);
  });

  it('Dado uncovered, então mostra o aviso de risco em texto, sem bloquear a reserva', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ uncovered: true })];
    await setup(gateway);

    expect(screen.getByTestId('goal-uncovered')).toHaveTextContent(pt.goals.uncovered.description);
    expect(screen.getByTestId('goal-reserve')).toBeEnabled();
  });

  it('Dado meta atingida, então explica as duas ações de usar o dinheiro, sem automatizar', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ status: 'ACHIEVED', progress: '1.0000', monthlyNeeded: brl('0.00') })];
    await setup(gateway);

    expect(screen.getByTestId('goal-status')).toHaveTextContent('Atingida');
    expect(screen.getByTestId('goal-achieved')).toHaveTextContent(
      pt.goals.detail.achievedDescription,
    );
  });

  it('Dado arquivar, então pede confirmação, usa a meta da resposta e troca por "Desarquivar"', async () => {
    const { gateway, fixture } = await setup();

    await userEvent.click(screen.getByTestId('goal-archive'));
    await userEvent.click(await screen.findByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(gateway.calls).toContain('archive:goal-1');
    expect(screen.getByTestId('goal-archived-note')).toBeInTheDocument();
    expect(screen.queryByTestId('goal-reserve')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('goal-unarchive'));
    await fixture.whenStable();
    expect(gateway.calls).toContain('unarchive:goal-1');
    expect(screen.getByTestId('goal-reserve')).toBeInTheDocument();
  });

  it('Dado falha ao arquivar, então avisa com a mensagem do code', async () => {
    const gateway = new GoalsGatewayStub();
    const { fixture } = await setup(gateway);
    gateway.next = failWith(422, 'GOAL_STATE_INCONSISTENT');

    await userEvent.click(screen.getByTestId('goal-archive'));
    await userEvent.click(await screen.findByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(screen.getByTestId('goal-action-error')).toHaveTextContent(
      pt.errors.codes['GOAL_STATE_INCONSISTENT']!,
    );
  });

  it('Dado meta inexistente, então mostra "não encontrada"; erro de rede, "tentar de novo"', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.getResult = failWith(404, 'GOAL_NOT_FOUND');
    await setup(gateway);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.goals.detail.notFound.title,
    );
  });

  it('Dado erro de rede ao carregar, então oferece "tentar de novo"', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.getResult = failWith(0, 'NETWORK');
    await setup(gateway);

    expect(screen.getByTestId('empty-state-action-retry')).toBeInTheDocument();
  });

  it('Dado a meta e a folha aberta, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByTestId('goal-reserve'));
    await screen.findByTestId('reserve-form');

    const violations = await axeViolations(container.ownerDocument.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
