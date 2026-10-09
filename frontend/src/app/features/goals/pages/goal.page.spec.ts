import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, Subject } from 'rxjs';

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
import {
  aDreamGoal,
  aGoal,
  aMetricGoal,
  aReservation,
  GoalsGatewayStub,
  provideGoalsStub,
} from '~/testing/goals-testing';
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

  describe('meta "quitar todas as dívidas" (DEBT_PAYOFF)', () => {
    const payoff = (overrides: Partial<Goal> = {}) =>
      aGoal({
        id: 'goal-1',
        kind: 'DEBT_PAYOFF',
        name: 'Quitar todas as dívidas',
        target: brl('0.00'),
        current: brl('0.00'),
        progress: '0.0000',
        remaining: brl('6500.00'),
        deadline: null,
        monthlyNeeded: null,
        reservations: [],
        baselineSet: false,
        baseline: null,
        ...overrides,
      });

    it('Dado "montando", então não mostra percentual nem reservas e explica o passo a passo', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [payoff()];
      await setup(gateway);

      expect(screen.getByTestId('goal-building')).toHaveTextContent(pt.goals.payoff.steps);
      expect(screen.queryByTestId('goal-percent')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-reserve')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-release')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-reservations')).not.toBeInTheDocument();
      expect(text(screen.getByTestId('goal-remaining'))).toBe('R$ 6.500,00');
    });

    it('Dado "Cadastrei tudo", então chama o baseline e mostra o progresso devolvido pelo servidor', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [payoff()];
      await setup(gateway);
      gateway.next = of(
        payoff({
          baselineSet: true,
          baseline: brl('6500.00'),
          target: brl('6500.00'),
          current: brl('1300.00'),
          progress: '0.2000',
          remaining: brl('5200.00'),
        }),
      );

      await userEvent.click(screen.getByTestId('goal-baseline'));

      expect(gateway.calls).toContain('baseline:goal-1');
      expect(text(screen.getByTestId('goal-percent'))).toBe('20%');
      expect(text(screen.getByTestId('goal-target'))).toBe('R$ 6.500,00');
      expect(text(screen.getByTestId('goal-current'))).toBe('R$ 1.300,00');
      expect(screen.queryByTestId('goal-baseline')).not.toBeInTheDocument();
    });

    it('Dado grewSinceBaseline, então avisa e re-ancorar pede confirmação antes de chamar o servidor', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [
        payoff({
          baselineSet: true,
          baseline: brl('5000.00'),
          target: brl('5000.00'),
          progress: '0.0000',
          remaining: brl('7000.00'),
          grewSinceBaseline: true,
        }),
      ];
      await setup(gateway);

      expect(screen.getByTestId('goal-grew')).toHaveTextContent(pt.goals.payoff.grewTitle);
      await userEvent.click(screen.getByTestId('goal-reanchor'));
      expect(gateway.calls).not.toContain('baseline:goal-1');
      await userEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

      expect(gateway.calls).toContain('baseline:goal-1');
    });

    it('Dado meta conquistada, então mostra o estado de conquista da quitação', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [
        payoff({
          status: 'ACHIEVED',
          baselineSet: true,
          baseline: brl('5000.00'),
          target: brl('5000.00'),
          current: brl('5000.00'),
          progress: '1.0000',
          remaining: brl('0.00'),
        }),
      ];
      await setup(gateway);

      expect(screen.getByTestId('goal-achieved')).toHaveTextContent(
        pt.goals.payoff.achievedDescription,
      );
    });

    it('Dado meta de reserva (SAVINGS), então a tela segue igual: reservar, liberar e editar', async () => {
      await setup();

      expect(screen.getByTestId('goal-reserve')).toBeInTheDocument();
      expect(screen.getByTestId('goal-edit')).toBeInTheDocument();
      expect(screen.queryByTestId('goal-baseline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-building')).not.toBeInTheDocument();
    });
  });
  describe('meta de medida e plano', () => {
    async function setupMetric(goal: Goal) {
      const gateway = new GoalsGatewayStub();
      gateway.getResult = of(goal);
      gateway.next = of(goal);
      return setup(gateway);
    }

    it('Dado meta de medida sem nome, então mostra o rótulo gerado, o valor atual, o que falta, a escada e o plano, sem reservas', async () => {
      await setupMetric(aMetricGoal());

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /Total de dívidas até R\$\s4\.000,00/,
      );
      expect(text(screen.getByTestId('goal-current'))).toBe('R$ 8.000,00');
      expect(text(screen.getByTestId('goal-remaining'))).toBe('R$ 4.000,00');
      expect(text(screen.getByTestId('goal-percent'))).toBe('33,3%');
      expect(text(screen.getByTestId('goal-baseline-value'))).toBe('R$ 10.000,00');
      expect(screen.getByTestId('goal-stage-badge')).toHaveTextContent('Objetivo');
      expect(screen.getByTestId('goal-stage-OBJECTIVE')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByTestId('goal-plan-suggestion')).toBeInTheDocument();
      expect(screen.getByTestId('goal-consistency')).toBeInTheDocument();
      expect(screen.queryByTestId('goal-reserve')).toBeNull();
      expect(screen.queryByTestId('goal-release')).toBeNull();
      expect(screen.queryByTestId('goal-reservations')).toBeNull();
      expect(screen.getByTestId('goal-edit')).toBeInTheDocument();
    });

    it('Dado meta de medida arquivada, então não calcula: mostra "arquivada" e não o valor atual', async () => {
      await setupMetric(aMetricGoal({ status: 'ARCHIVED', current: null, remaining: null }));

      expect(screen.getByTestId('goal-not-calculated')).toHaveTextContent(pt.goals.archivedMetric);
      expect(screen.queryByTestId('goal-current')).toBeNull();
    });

    it('Dado a meta atingida, então a escada termina em Sucesso', async () => {
      await setupMetric(
        aMetricGoal({ status: 'ACHIEVED', reached: true, stage: 'ACHIEVED', progress: '1.0000' }),
      );

      expect(screen.getByTestId('goal-stage-badge')).toHaveTextContent('Sucesso');
      expect(screen.getByTestId('goal-stage-ACHIEVED')).toHaveTextContent('Concluído');
    });

    it('Dado adicionar uma ação, então manda ao servidor, mostra a meta devolvida e avisa', async () => {
      const gateway = new GoalsGatewayStub();
      const goal = aMetricGoal();
      gateway.getResult = of(goal);
      gateway.next = of(
        aMetricGoal({
          stage: 'STRATEGY',
          actions: [{ id: 'a-1', title: 'Revisar as dívidas', frequency: 'WEEKLY', doneIn: [] }],
        }),
      );
      await setup(gateway);

      await userEvent.click(screen.getByTestId('goal-action-add'));
      await userEvent.type(screen.getByTestId('goal-action-title'), 'Revisar as dívidas');
      await userEvent.click(screen.getByTestId('goal-action-save'));

      expect(gateway.actionCalls).toEqual(['add:goal-metric:Revisar as dívidas:MONTHLY']);
      expect(await screen.findByTestId('goal-action-a-1')).toHaveTextContent('Revisar as dívidas');
      expect(screen.getByTestId('goal-stage-badge')).toHaveTextContent('Estratégia');
    });

    it('Dado o limite de ações no servidor, então mostra o erro traduzido no plano', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.getResult = of(aMetricGoal());
      gateway.next = failWith(422, 'GOAL_ACTION_LIMIT');
      await setup(gateway);

      await userEvent.click(screen.getByTestId('goal-action-add'));
      await userEvent.type(screen.getByTestId('goal-action-title'), 'Mais uma');
      await userEvent.click(screen.getByTestId('goal-action-save'));

      expect(await screen.findByTestId('goal-plan-error')).toHaveTextContent('limite de 10 ações');
    });

    it('Dado salvar o texto do plano, então o PUT reenvia os valores atuais para não apagar o prazo', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.getResult = of(aMetricGoal());
      gateway.next = of(aMetricGoal({ planNote: 'Pagar em dia', stage: 'STRATEGY' }));
      await setup(gateway);

      await userEvent.type(screen.getByTestId('goal-plan-note'), 'Pagar em dia');
      await userEvent.click(screen.getByTestId('goal-plan-note-save'));

      expect(gateway.updates[0]).toMatchObject({
        deadline: '2027-04-30',
        target: '4000.00',
        planNote: 'Pagar em dia',
      });
      expect(await screen.findByTestId('goal-stage-badge')).toHaveTextContent('Estratégia');
    });

    it('Dado a meta de medida com plano, então não tem violações de acessibilidade', async () => {
      const { container } = await setupMetric(
        aMetricGoal({
          planNote: 'Pagar em dia',
          actions: [{ id: 'a-1', title: 'Revisar', frequency: 'WEEKLY', doneIn: [] }],
        }),
      );

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe('fotos e destaque', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:sintetico');
      URL.revokeObjectURL = vi.fn();
    });

    it('Dado uma meta de reserva com fotos, então mostra a galeria e o progresso do servidor', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3, { id: 'goal-1' })];
      await setup(gateway);

      expect(await screen.findByTestId('goal-gallery')).toBeInTheDocument();
      expect(screen.getByTestId('goal-gallery-image')).toHaveAttribute(
        'alt',
        'Foto 1 de 3 da meta Carro de exemplo',
      );
      expect(screen.getByTestId('goal-percent')).toHaveTextContent('25%');
    });

    it('Dado uma meta de reserva sem fotos, então mostra o estado vazio com o caminho para adicionar', async () => {
      await setup();

      expect(await screen.findByTestId('goal-gallery-empty')).toHaveTextContent(
        pt.goals.photos.gallery.empty,
      );
      expect(screen.getByTestId('goal-photos-edit')).toHaveAttribute('href', '/goals/goal-1/edit');
    });

    it('Dado ligar o destaque, então a meta da resposta atualiza a tela e avisa', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aGoal({ featured: false })];
      await setup(gateway);

      await userEvent.click(await screen.findByTestId('goal-featured'));

      expect(gateway.calls).toContain('featured:goal-1:true');
      expect(screen.getByTestId('goal-featured')).toHaveAttribute('aria-checked', 'true');
    });

    it('Dado destaque recusado pelo servidor, então mostra o motivo e o interruptor volta ao estado real', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aGoal({ featured: false })];
      await setup(gateway);
      await screen.findByTestId('goal-featured');
      gateway.next = failWith(422, 'GOAL_ARCHIVED');

      await userEvent.click(screen.getByTestId('goal-featured'));

      expect(await screen.findByTestId('goal-featured-error')).toHaveTextContent(
        pt.errors.codes['GOAL_ARCHIVED']!,
      );
      expect(screen.getByTestId('goal-featured')).toHaveAttribute('aria-checked', 'false');
    });

    it('Dado uma meta de medida, então não há galeria nem destaque', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aMetricGoal({ id: 'goal-1' })];
      await setup(gateway);

      await screen.findByTestId('goal-summary');
      expect(screen.queryByTestId('goal-photos-section')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-featured')).not.toBeInTheDocument();
    });

    it('Dado a meta com fotos, então não há violações de acessibilidade', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3, { id: 'goal-1' })];
      const { container } = await setup(gateway);
      await screen.findByTestId('goal-gallery');

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
});
