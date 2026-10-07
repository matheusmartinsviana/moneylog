import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { defer, NEVER, of, Subject, throwError } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { HomePage } from '~/app/features/home/pages/home.page';
import { DashboardFailure } from '~/modules/dashboard/core/types/dashboard-failure';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import { GoalsListFacade } from '~/modules/goals/core/facades/goals-list.facade';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { provideAiStub } from '~/testing/ai-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import {
  aDashboardSummary,
  anEmptyUpcoming,
  anUpcoming,
  DashboardGatewayStub,
  provideDashboardMock,
  provideDashboardStub,
} from '~/testing/dashboard-testing';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideHomeSupportStubs } from '~/testing/home-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { formatMoney, Money } from '~/util/money';

const text = (el: HTMLElement) => el.textContent?.replace(/\u00a0/g, ' ').trim();
const shown = (money: Money) => formatMoney(money).replace(/\u00a0/g, ' ');

async function setup(
  stub = new DashboardGatewayStub(),
  language: 'pt' | 'en' = 'pt',
  cardsGateway = new CardsGatewayStub(),
  goalsGateway = new GoalsGatewayStub(),
) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
  const result = await render(HomePage, {
    providers: [
      provideI18nTesting(language),
      provideRouter([]),
      ...provideAiStub(),
      provideDashboardStub(stub),
      provideCardsStub(cardsGateway),
      provideGoalsStub(goalsGateway),
      provideAccountsStub(accounts),
      ...provideHomeSupportStubs(),
    ],
  });
  return { ...result, stub, cardsGateway, goalsGateway };
}

describe('HomePage (dashboard)', () => {
  it('Dado que volto do /quick-add (nova visita), então o Início pede o resumo de novo, sem cache velho', async () => {
    const stub = new DashboardGatewayStub();
    let calls = 0;
    stub.summary$ = defer(() => {
      calls++;
      return of(aDashboardSummary());
    });
    const { fixture } = await setup(stub);
    expect(calls).toBe(1);

    // Cada visita inicializa a página de novo e a facade (escopo de componente) não guarda cache.
    fixture.componentInstance.ngOnInit();

    expect(calls).toBe(2);
  });

  it('Dado o resumo ainda carregando, então mostra o esqueleto com status acessível e nada de valores', async () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = NEVER;
    await setup(stub);

    expect(screen.getByTestId('home-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.home.loading);
    expect(screen.queryByTestId('home-dashboard')).not.toBeInTheDocument();
  });

  it('Dado a facade de requisições em modo mock (sem contas), quando a página carrega, então mostra o estado vazio do Início', async () => {
    await render(HomePage, {
      providers: [
        provideI18nTesting('pt'),
        provideRouter([]),
        ...provideAiStub(),
        provideDashboardMock(),
        provideCardsStub(),
        provideGoalsStub(),
        provideAccountsStub(),
        ...provideHomeSupportStubs(),
      ],
    });

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.home.title);
    expect(screen.getByTestId('empty-state-action-add-account')).toHaveAttribute(
      'href',
      '/accounts/new',
    );
    expect(screen.getByTestId('empty-state-action-add-account')).not.toHaveAttribute(
      'aria-disabled',
    );
    // "Importar extrato" continua indisponível, com a dica "disponível em breve".
    expect(screen.getByTestId('empty-state-action-import-statement')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByTestId('empty-state-coming-soon')).toBeInTheDocument();
    expect(screen.queryByTestId('home-dashboard')).not.toBeInTheDocument();
  });

  it('Dado uma falha, quando clico em "tentar de novo", então recarrega e mostra o resumo', async () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = throwError(() => new Error('rede'));
    const { fixture } = await setup(stub);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByTestId('empty-state-title')).toHaveTextContent(pt.home.error.title);
    const retry = screen.getByTestId('empty-state-action-retry');
    expect(retry).toHaveTextContent(pt.home.error.retry);
    expect(retry).toBeEnabled();

    const reload = new Subject<DashboardSummary>();
    stub.summary$ = reload;
    await userEvent.click(retry);
    expect(screen.getByTestId('home-loading')).toBeInTheDocument();

    reload.next(aDashboardSummary());
    reload.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-dashboard')).toBeInTheDocument();
  });

  it('Dado o backend negando acesso, então mostra "sem permissão" sem botão de tentar de novo', async () => {
    const stub = new DashboardGatewayStub();
    stub.summary$ = throwError(() => new DashboardFailure('forbidden'));
    await setup(stub);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.home.forbidden.title);
    expect(screen.queryByTestId('empty-state-action-retry')).not.toBeInTheDocument();
  });

  describe('com dados', () => {
    it('Dado o resumo, então "quanto tenho" exibe exatamente os valores recebidos, sem recalcular', async () => {
      const summary = aDashboardSummary();
      await setup();

      expect(text(screen.getByTestId('home-available'))).toBe(shown(summary.balances.available));
      expect(text(screen.getByTestId('home-in-accounts'))).toBe(shown(summary.balances.inAccounts));
      expect(text(screen.getByTestId('home-committed-30d'))).toBe(
        shown(summary.balances.committed30d),
      );
      expect(text(screen.getByTestId('home-reserved'))).toBe(shown(summary.balances.reserved));
      expect(text(screen.getByTestId('home-investments'))).toBe(
        shown(summary.balances.investments),
      );
      expect(text(screen.getByTestId('home-available'))).toBe('R$ 17.617,00');
    });

    it('Dado valores que não "fecham" a conta, então a tela mostra o que veio (o front não calcula)', async () => {
      const stub = new DashboardGatewayStub();
      const brl = (amount: string) => ({ amount, currency: 'BRL' });
      stub.summary$ = of(
        aDashboardSummary({
          balances: {
            inAccounts: brl('100.00'),
            investments: brl('0.00'),
            available: brl('1.23'),
            reserved: brl('0.00'),
            committed30d: brl('0.00'),
            inAccountsChange: null,
          },
        }),
      );
      await setup(stub);

      expect(text(screen.getByTestId('home-available'))).toBe('R$ 1,23');
    });

    it('Dado o disponível negativo, então mostra o menos tipográfico e o aviso em texto', async () => {
      const stub = new DashboardGatewayStub();
      const base = aDashboardSummary();
      stub.summary$ = of(
        aDashboardSummary({
          balances: { ...base.balances, available: { amount: '-250.00', currency: 'BRL' } },
        }),
      );
      await setup(stub);

      expect(text(screen.getByTestId('home-available'))).toBe('−R$ 250,00');
      expect(screen.getByTestId('home-available')).toHaveClass('is-negative');
      expect(screen.getByTestId('home-available-negative')).toHaveTextContent(
        pt.home.available.negative,
      );
    });

    it('Dado os horizontes, então "o que está comprometido" lista os 6 horizontes e a projeção só onde existe', async () => {
      const summary = aDashboardSummary();
      await setup();

      const table = screen.getByTestId('home-commitments');
      expect(
        within(table)
          .getAllByRole('rowheader')
          .map((th) => th.textContent?.trim()),
      ).toEqual(Object.values(pt.home.committed.horizons));
      expect(text(screen.getByTestId('home-committed-m12'))).toBe(shown(summary.committed.m12));
      expect(text(screen.getByTestId('home-projected-d90'))).toBe(shown(summary.projected.d90));
      expect(screen.getByTestId('home-projected-d7')).toHaveTextContent(
        pt.home.committed.notApplicable,
      );
      expect(screen.getByText(pt.home.committed.projectionNote)).toBeInTheDocument();
    });

    it('Dado os próximos, então "o que pago a seguir" agrupa pelo bucket do backend, aninha as parcelas e mostra os totais recebidos', async () => {
      const upcoming = anUpcoming();
      await setup();

      const groups = screen.getAllByTestId(/^home-upcoming-group-/);
      expect(groups.map((g) => g.getAttribute('data-cy'))).toEqual([
        'home-upcoming-group-OVERDUE',
        'home-upcoming-group-NEXT_7_DAYS',
        'home-upcoming-group-UNDATED',
      ]);
      const overdue = groups[0]!;
      expect(within(overdue).getByRole('heading', { level: 3 })).toHaveTextContent(
        pt.home.upcoming.buckets.OVERDUE,
      );
      expect(overdue).toHaveTextContent('Roxinho');
      expect(overdue).toHaveTextContent(pt.home.upcoming.kinds.INVOICE);
      expect(overdue).toHaveTextContent('Vence em 5 de out.');

      // As parcelas ficam recolhidas na fatura e abrem com um toque (Disclosure).
      const toggle = within(overdue).getByTestId('home-upcoming-installments-OVERDUE-0-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(overdue).queryByTestId('home-upcoming-installment')).not.toBeInTheDocument();
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const installments = within(overdue).getByRole('list', {
        name: pt.home.upcoming.installments,
      });
      expect(text(within(installments).getByTestId('home-upcoming-installment'))).toMatch(
        /^Notebook\s+4\/10\s*R\$ 320,00$/,
      );

      expect(text(screen.getByTestId('home-upcoming-total-out'))).toBe(shown(upcoming.totals.out));
      expect(text(screen.getByTestId('home-upcoming-total-in'))).toBe(shown(upcoming.totals.in));
      expect(groups[2]).toHaveTextContent(pt.home.upcoming.undated);
    });

    it('Dado contas sem vencimentos, então a seção "a seguir" diz que não há nada no período', async () => {
      const stub = new DashboardGatewayStub();
      stub.upcoming$ = of(anEmptyUpcoming());
      await setup(stub);

      expect(screen.getByTestId('home-upcoming-empty')).toHaveTextContent(pt.home.upcoming.empty);
      expect(screen.queryByTestId('home-upcoming-total-out')).not.toBeInTheDocument();
    });

    it('Dado o mês e o patrimônio, então exibe os valores recebidos e explica as parcelas fora do total', async () => {
      const { month, netWorth } = aDashboardSummary();
      await setup();

      expect(text(screen.getByTestId('home-month-income'))).toBe(shown(month.income));
      expect(text(screen.getByTestId('home-month-consumption'))).toBe(shown(month.consumption));
      expect(text(screen.getByTestId('home-month-net'))).toBe(shown(month.net));
      expect(text(screen.getByTestId('home-month-refunds'))).toBe(shown(month.refunds));
      expect(text(screen.getByTestId('home-month-method-PIX'))).toBe(
        shown(month.expensesPaid.byMethod.PIX),
      );
      expect(text(screen.getByTestId('home-month-cash-net'))).toBe(shown(month.cashFlow.net));
      expect(text(screen.getByTestId('home-net-worth-total'))).toBe(shown(netWorth.total));
      expect(text(screen.getByTestId('home-net-worth-cards'))).toBe('−R$ 200,00');
      expect(text(screen.getByTestId('home-net-worth-future-installments'))).toBe(
        shown(netWorth.cardFutureInstallments),
      );
      expect(screen.getByText(pt.home.netWorth.cardFutureInstallmentsNote)).toBeInTheDocument();
      expect(screen.getByText('outubro de 2026')).toBeInTheDocument();
    });

    it('Dado o resumo, então o cabeçalho mostra a data de referência e as ações levam a rotas reais', async () => {
      await setup();

      expect(screen.getByTestId('page-description')).toHaveTextContent(
        'Posição de 10 de outubro de 2026.',
      );
      expect(screen.queryByTestId('home-projection')).not.toBeInTheDocument();
      expect(screen.getByTestId('home-action-quick-add')).toHaveAttribute('href', '/quick-add');
      expect(screen.getByTestId('home-action-transactions')).toHaveAttribute(
        'href',
        '/transactions',
      );
    });

    it('Dado um resumo de projeção, então o cabeçalho sinaliza "projeção"', async () => {
      const stub = new DashboardGatewayStub();
      stub.summary$ = of(aDashboardSummary({ isProjection: true }));
      await setup(stub);

      expect(screen.getByTestId('home-projection')).toHaveTextContent(pt.home.projection);
    });

    it('Dado BRL com a UI em inglês, então os rótulos mudam e os valores seguem a moeda do dado', async () => {
      await setup(new DashboardGatewayStub(), 'en');

      expect(screen.getByRole('heading', { name: 'Available' })).toBeInTheDocument();
      expect(text(screen.getByTestId('home-available'))).toBe('R$ 17.617,00');
      expect(screen.getByTestId('page-description')).toHaveTextContent('As of October 10, 2026.');
    });

    describe('cartões e crédito (T71)', () => {
      it('Dado o cartão do cenário, então mostra o total comprometido e as compras futuras em linhas SEPARADAS, como o backend', async () => {
        const cardsGateway = new CardsGatewayStub();
        cardsGateway.cards = [
          aCard({
            id: 'card-1',
            name: 'Roxinho',
            availableLimit: brl('7717.00'),
            totalCommitted: brl('1283.00'),
            committedFuture: brl('1000.00'),
          }),
        ];
        await setup(new DashboardGatewayStub(), 'pt', cardsGateway);

        expect(text(screen.getByTestId('home-card-total-committed-card-1'))).toBe('R$ 1.283,00');
        expect(text(screen.getByTestId('home-card-committed-future-card-1'))).toBe('R$ 1.000,00');
        expect(text(screen.getByTestId('home-card-available-card-1'))).toBe('R$ 7.717,00');
        // Nenhuma soma dos dois (2.283,00) em lugar nenhum.
        expect(screen.getByTestId('home-cards')).not.toHaveTextContent('2.283,00');
        expect(screen.getByTestId('home-card-open-card-1')).toHaveAttribute(
          'href',
          '/cards/card-1',
        );
        expect(screen.getByText(pt.home.cards.note)).toBeInTheDocument();
      });

      it('Dado cartão acima do limite, então aparece com texto "acima do limite"', async () => {
        const cardsGateway = new CardsGatewayStub();
        cardsGateway.cards = [
          aCard({ id: 'card-1', overLimit: true, availableLimit: brl('-50.00') }),
        ];
        await setup(new DashboardGatewayStub(), 'pt', cardsGateway);

        expect(screen.getByTestId('home-card-available-card-1')).toHaveTextContent(
          pt.home.cards.overLimit,
        );
        expect(text(screen.getByTestId('home-card-available-card-1'))).toContain('−R$ 50,00');
      });

      it('Dado nenhum cartão, então diz isso com a ação "Adicionar cartão"', async () => {
        await setup();

        expect(screen.getByTestId('home-cards-empty')).toHaveTextContent(pt.home.cards.empty);
        expect(screen.getByTestId('home-cards-add')).toHaveAttribute('href', '/cards/new');
      });

      it('Dado erro nos cartões, então o resto do Início continua e "tentar de novo" recarrega', async () => {
        const cardsGateway = new CardsGatewayStub();
        cardsGateway.listError = failWith(500, 'INTERNAL_ERROR');
        await setup(new DashboardGatewayStub(), 'pt', cardsGateway);

        expect(screen.getByTestId('home-cards-error')).toHaveTextContent(pt.home.cards.error);
        expect(screen.getByTestId('home-dashboard')).toBeInTheDocument();
        cardsGateway.listError = null;
        cardsGateway.cards = [aCard({ id: 'card-1' })];
        await userEvent.click(screen.getByTestId('home-cards-retry'));

        expect(await screen.findByTestId('home-card-card-1')).toBeInTheDocument();
      });

      it('Dado a ação rápida "Crédito", então leva a /quick-add?mode=credit e está habilitada', async () => {
        await setup();

        const credit = screen.getByTestId('home-action-credit');
        expect(credit).toHaveAttribute('href', '/quick-add?mode=credit');
        expect(credit).not.toHaveAttribute('aria-disabled');
        expect(credit).toHaveTextContent(pt.quickAdd.modes.credit);
        expect(credit).not.toHaveTextContent(/breve/i);
      });

      it('Dado a fatura nos próximos, então mostra o valor do backend e as parcelas só ao expandir', async () => {
        await setup();

        const item = screen.getAllByTestId('home-upcoming-item')[0]!;
        expect(item).toHaveTextContent('Roxinho');
        expect(text(within(item).getByTestId('home-upcoming-amount'))).toBe('R$ 1.283,00');
        expect(within(item).queryByTestId('home-upcoming-installment')).not.toBeInTheDocument();
        await userEvent.click(within(item).getByRole('button', { name: /Parcelas incluídas/ }));
        expect(within(item).getByTestId('home-upcoming-installment')).toBeInTheDocument();
      });

      it('Dado fatura vencida, então vai para "Vencidos" com cor de risco e o texto do grupo', async () => {
        await setup();

        const group = screen.getByTestId('home-upcoming-group-OVERDUE');
        expect(within(group).getByRole('heading', { level: 3 })).toHaveClass('is-negative');
        expect(group).toHaveTextContent(pt.home.upcoming.buckets.OVERDUE);
        expect(group).toHaveTextContent(pt.home.upcoming.kinds.INVOICE);
      });

      it('Dado cartões carregando, então o Início mostra o estado de carregamento da seção', async () => {
        const cardsGateway = new CardsGatewayStub();
        cardsGateway.listError = NEVER as never;
        await setup(new DashboardGatewayStub(), 'pt', cardsGateway);

        expect(screen.getByTestId('home-cards-loading')).toHaveTextContent(pt.home.cards.loading);
      });
    });

    it('Dado o dashboard com dados, então o axe não aponta violações', async () => {
      const { container } = await setup();

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
});

describe('HomePage: metas e reservado (T101)', () => {
  const withReserved = (reserved: Money) => {
    const stub = new DashboardGatewayStub();
    const base = aDashboardSummary();
    stub.summary$ = of(aDashboardSummary({ balances: { ...base.balances, reserved } }));
    return stub;
  };

  it('Dado reserved > 0, então mostra o reservado e o disponível do backend, com o link para as metas e a dica da fórmula', async () => {
    const summary = aDashboardSummary();
    const { fixture } = await setup(withReserved(brl('8500.00')));
    await fixture.whenStable();

    expect(text(screen.getByTestId('home-reserved'))).toBe(shown(brl('8500.00')));
    expect(text(screen.getByTestId('home-available'))).toBe(shown(summary.balances.available));
    expect(screen.getByTestId('home-reserved-goals')).toHaveAttribute('href', '/goals');
    expect(screen.getByTestId('home-reserved-hint')).toBeInTheDocument();
  });

  it('Dado reserved zero, então não há link para as metas reservadas', async () => {
    const { fixture } = await setup(withReserved(brl('0.00')));
    await fixture.whenStable();

    expect(screen.queryByTestId('home-reserved-goals')).not.toBeInTheDocument();
  });

  it('Dado "Meta" sem metas, então leva a /goals/new', async () => {
    const { fixture } = await setup();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('home-action-goal'));

    expect(navigate).toHaveBeenCalledWith(['/goals/new']);
  });

  it('Dado "Meta" com metas, então abre a reserva rápida com a meta de maior prioridade (a primeira do backend)', async () => {
    const goals = new GoalsGatewayStub();
    goals.goals = [
      aGoal({ id: 'g-high', name: 'Reserva' }),
      aGoal({ id: 'g-low', name: 'Viagem' }),
    ];
    const { fixture } = await setup(
      new DashboardGatewayStub(),
      'pt',
      new CardsGatewayStub(),
      goals,
    );
    await fixture.whenStable();

    await userEvent.click(screen.getByTestId('home-action-goal'));

    expect(await screen.findByTestId('reserve-form')).toBeInTheDocument();
    expect(screen.getByTestId('reserve-goal')).toBeInTheDocument();
    expect(screen.getByTestId('reserve-goal')).toHaveTextContent('Reserva');
  });

  it('Dado a reserva rápida concluída, então o Início volta a ler o resumo do backend', async () => {
    const stub = new DashboardGatewayStub();
    let calls = 0;
    stub.summary$ = defer(() => {
      calls++;
      return of(aDashboardSummary());
    });
    const goals = new GoalsGatewayStub();
    goals.goals = [aGoal()];
    const { fixture } = await setup(stub, 'pt', new CardsGatewayStub(), goals);
    await fixture.whenStable();
    expect(calls).toBe(1);

    await userEvent.click(screen.getByTestId('home-action-goal'));
    await userEvent.click(await screen.findByTestId('reserve-account'));
    await userEvent.click(screen.getByTestId('reserve-account-option-acc-1'));
    await userEvent.type(screen.getByTestId('reserve-amount'), '100,00');
    await userEvent.click(screen.getByTestId('reserve-submit'));
    await fixture.whenStable();

    expect(goals.reservations).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('Dado a folha de reserva aberta, quando a lista de metas recarrega (silenciosa e pendente), então a folha e o digitado continuam', async () => {
    const goals = new GoalsGatewayStub();
    goals.goals = [aGoal()];
    const { fixture } = await setup(
      new DashboardGatewayStub(),
      'pt',
      new CardsGatewayStub(),
      goals,
    );
    await fixture.whenStable();
    await userEvent.click(screen.getByTestId('home-action-goal'));
    await userEvent.type(await screen.findByTestId('reserve-amount'), '100,00');

    vi.spyOn(goals, 'list').mockReturnValue(new Subject());
    (fixture.componentInstance as unknown as { goals: GoalsListFacade }).goals.reload('ACTIVE');
    fixture.detectChanges();

    expect(screen.getByTestId('reserve-form')).toBeInTheDocument();
    expect((screen.getByTestId('reserve-amount') as HTMLInputElement).value).toContain('100');
  });

  it('Dado o resumo, então há atalhos para metas, resumo do mês (competência do backend) e projeções', async () => {
    const { fixture } = await setup();
    await fixture.whenStable();
    const competence = aDashboardSummary().month.competence;

    expect(screen.getByTestId('home-action-goals')).toHaveAttribute('href', '/goals');
    expect(screen.getByTestId('home-action-summary')).toHaveAttribute(
      'href',
      `/planning/summary/${competence}`,
    );
    expect(screen.getByTestId('home-action-projections')).toHaveAttribute(
      'href',
      '/planning/projections',
    );
  });
});
