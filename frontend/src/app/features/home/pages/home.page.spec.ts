import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { defer, delay, NEVER, Observable, of, Subject, tap, throwError } from 'rxjs';

import { en } from '~/app/common/i18n/translations/en';
import { pt } from '~/app/common/i18n/translations/pt';
import { HomePage } from '~/app/features/home/pages/home.page';
import { DashboardFailure } from '~/modules/dashboard/core/types/dashboard-failure';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { UpcomingItem } from '~/modules/dashboard/core/types/upcoming';
import type { IncomeExpenseSeries } from '~/modules/reports/core/types/reports';
import { brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aDashboardSummary,
  anEmptyUpcoming,
  anUpcoming,
  DashboardGatewayStub,
  provideDashboardMock,
  provideDashboardStub,
} from '~/testing/dashboard-testing';
import { provideDebtOverviewStub } from '~/testing/debt-overview-testing';
import {
  aSummary,
  MonthlySummaryGatewayStub,
  provideMonthlySummaryStub,
} from '~/testing/etapa5-testing';
import { aDreamGoal, aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  anIncomeExpenseSeries,
  provideReportsStub,
  ReportsGatewayStub,
} from '~/testing/reports-testing';
import { LedgerGate } from '~/util/api/ledger-gate';
import { formatMoney, type Money } from '~/util/money';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const shown = (money: Money) => formatMoney(money).replace(/\u00a0/g, ' ');

function upcomingItem(
  label: string,
  bucket: UpcomingItem['bucket'],
  amount = '10.00',
): UpcomingItem {
  return {
    kind: 'RECURRENCE',
    bucket,
    dueDate: '2026-10-12',
    direction: 'OUT',
    amount: brl(amount),
    label,
    refType: 'RECURRENCE',
    refId: `ref-${label}`,
    items: [],
  };
}

interface Stubs {
  dashboard: DashboardGatewayStub;
  monthly: MonthlySummaryGatewayStub;
  reports: ReportsGatewayStub;
  goals: GoalsGatewayStub;
}

function stubs(): Stubs {
  return {
    dashboard: new DashboardGatewayStub(),
    monthly: new MonthlySummaryGatewayStub(),
    reports: new ReportsGatewayStub(),
    goals: new GoalsGatewayStub(),
  };
}

async function setup(s: Stubs = stubs(), language: 'pt' | 'en' = 'pt') {
  const result = await render(HomePage, {
    // O gráfico é um bloco @defer (chunk à parte): o Testing Library o deixa manual por padrão.
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
    providers: [
      provideI18nTesting(language),
      provideRouter([]),
      provideDashboardStub(s.dashboard),
      provideMonthlySummaryStub(s.monthly),
      provideReportsStub(s.reports),
      provideGoalsStub(s.goals),
      ...provideDebtOverviewStub(),
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, ...s };
}

describe('HomePage (Início sucinto)', () => {
  it('Dado que volto de outra tela (nova visita), então o Início pede o resumo de novo, sem cache velho', async () => {
    const s = stubs();
    let calls = 0;
    s.dashboard.summary$ = defer(() => {
      calls++;
      return of(aDashboardSummary());
    });
    const { fixture } = await setup(s);
    expect(calls).toBe(1);

    fixture.componentInstance.ngOnInit();

    expect(calls).toBe(2);
  });

  it('Dado o resumo ainda carregando, então mostra o esqueleto com status acessível e nada de valores', async () => {
    const s = stubs();
    s.dashboard.summary$ = NEVER;
    await setup(s);

    expect(screen.getByTestId('home-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.home.loading);
    expect(screen.queryByTestId('home-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-register')).not.toBeInTheDocument();
  });

  it('Dado a facade em modo mock (sem contas), então mostra o estado vazio com "adicionar conta"', async () => {
    await render(HomePage, {
      providers: [
        provideI18nTesting('pt'),
        provideRouter([]),
        provideDashboardMock(),
        provideMonthlySummaryStub(),
        provideReportsStub(),
        provideGoalsStub(),
        ...provideDebtOverviewStub(),
      ],
    });

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.home.title);
    expect(screen.getByTestId('empty-state-action-add-account')).toHaveAttribute(
      'href',
      '/accounts/new',
    );
    expect(screen.getByTestId('empty-state-action-import-statement')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByTestId('home-dashboard')).not.toBeInTheDocument();
  });

  it('Dado uma falha, quando clico em "tentar de novo", então recarrega e mostra o resumo', async () => {
    const s = stubs();
    s.dashboard.summary$ = throwError(() => new Error('rede'));
    const { fixture } = await setup(s);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.home.error.title);
    const reload = new Subject<DashboardSummary>();
    s.dashboard.summary$ = reload;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));
    expect(screen.getByTestId('home-loading')).toBeInTheDocument();

    reload.next(aDashboardSummary());
    reload.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-dashboard')).toBeInTheDocument();
  });

  it('Dado o backend negando acesso, então mostra "sem permissão" sem botão de tentar de novo', async () => {
    const s = stubs();
    s.dashboard.summary$ = throwError(() => new DashboardFailure('forbidden'));
    await setup(s);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.home.forbidden.title);
    expect(screen.queryByTestId('empty-state-action-retry')).not.toBeInTheDocument();
  });

  it('Dado a recarga em segundo plano que falha, então mantém os dados, avisa e "tentar de novo" recarrega', async () => {
    const s = stubs();
    let calls = 0;
    s.dashboard.summary$ = defer(() => {
      calls++;
      return calls === 2 ? throwError(() => new Error('rede')) : of(aDashboardSummary());
    });
    const { fixture } = await setup(s);

    fixture.componentInstance['dashboard'].reload();
    fixture.detectChanges();

    expect(screen.getByTestId('home-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('home-refresh-failed')).toHaveTextContent(pt.home.refreshFailed);
    await userEvent.click(screen.getByTestId('home-refresh-retry'));
    fixture.detectChanges();

    expect(calls).toBe(3);
    expect(screen.queryByTestId('home-refresh-failed')).not.toBeInTheDocument();
  });

  describe('com dados', () => {
    it('Dado o resumo, então saldo, gasto, receita e resultado do mês são os que o servidor devolveu (sem conta no front)', async () => {
      const summary = aDashboardSummary();
      await setup();

      expect(text(screen.getByTestId('kpi-in-accounts-value'))).toBe(
        shown(summary.balances.inAccounts),
      );
      expect(text(screen.getByTestId('kpi-in-accounts-change'))).toBe('+8% vs fim do mês passado');
      expect(text(screen.getByTestId('kpi-spending-value'))).toBe(shown(summary.month.consumption));
      expect(text(screen.getByTestId('kpi-income-value'))).toBe(shown(summary.month.income));
      expect(text(screen.getByTestId('kpi-result-value'))).toBe(shown(summary.month.net));
      expect(text(screen.getByTestId('kpi-savings-value'))).toBe('91,7%');
    });

    it('Dado resultado negativo do servidor, então mostra o menos tipográfico', async () => {
      const s = stubs();
      const base = aDashboardSummary();
      s.dashboard.summary$ = of({ ...base, month: { ...base.month, net: brl('-120.00') } });
      await setup(s);

      expect(text(screen.getByTestId('kpi-result-value'))).toBe('−R$ 120,00');
    });

    it('Dado mais de 3 compromissos, então mostra só 3 dos próximos 7 dias, na ordem do servidor, e leva ao Panorama', async () => {
      const s = stubs();
      s.dashboard.upcoming$ = of(
        anEmptyUpcomingWith([
          upcomingItem('Aluguel', 'TOMORROW', '1800.00'),
          upcomingItem('Internet', 'NEXT_7_DAYS'),
          upcomingItem('Streaming', 'NEXT_7_DAYS'),
          upcomingItem('Academia', 'NEXT_7_DAYS'),
          upcomingItem('Seguro', 'NEXT_30_DAYS'),
        ]),
      );
      await setup(s);

      const rows = screen.getAllByTestId('home-upcoming-item');
      expect(rows.map((row) => row.querySelector('.ub__label')?.textContent)).toEqual([
        'Aluguel',
        'Internet',
        'Streaming',
      ]);
      expect(text(screen.getAllByTestId('home-upcoming-amount')[0]!)).toBe('R$ 1.800,00');
      expect(screen.getByTestId('home-upcoming-all')).toHaveAttribute('href', '/planning/overview');
    });

    it('Dado nada nos próximos 7 dias (só mais adiante), então diz que nada vence', async () => {
      const s = stubs();
      s.dashboard.upcoming$ = of(anEmptyUpcomingWith([upcomingItem('Seguro', 'NEXT_30_DAYS')]));
      await setup(s);

      expect(screen.getByTestId('home-upcoming-empty')).toHaveTextContent(pt.brief.upcoming.empty);
      expect(screen.queryByTestId('home-upcoming-item')).not.toBeInTheDocument();
    });

    it('Dado as dívidas, então "Você deve" mostra o total do servidor com link para as dívidas totais', async () => {
      await setup();

      expect(await screen.findByTestId('home-debts-total')).toHaveTextContent('R$ 6.500,00');
      expect(screen.getByTestId('home-debts-open')).toHaveAttribute('href', '/planning/debts');
    });

    it('Dado uma meta marcada como destaque, então mostra só ela, com o selo do degrau, o preço e o progresso do servidor', async () => {
      const s = stubs();
      s.goals.goals = [
        aGoal({
          id: 'g-1',
          name: 'Reserva',
          stage: 'STRATEGY',
          progress: '0.4250',
          featured: true,
        }),
        aGoal({ id: 'g-2', name: 'Viagem' }),
      ];
      await setup(s);

      expect(await screen.findByTestId('home-featured-goal-open')).toHaveTextContent('Reserva');
      expect(screen.getByTestId('home-featured-goal-open')).toHaveAttribute('href', '/goals/g-1');
      expect(screen.getByTestId('home-featured-goal-stage')).toHaveTextContent('Estratégia');
      expect(screen.getByTestId('home-featured-goal-percent')).toHaveTextContent('42,5%');
      expect(screen.getByTestId('home-featured-goal-price')).toHaveTextContent('20.000,00');
      expect(s.goals.queries[0]).toMatchObject({ status: 'ACTIVE', featured: true });
      expect(screen.queryByText('Viagem')).not.toBeInTheDocument();
    });

    it('Dado nenhuma meta em destaque, então convida a marcar uma', async () => {
      await setup();

      expect(await screen.findByTestId('home-featured-goal-empty')).toHaveTextContent(
        pt.brief.featuredGoal.empty,
      );
      expect(screen.getByTestId('home-featured-goal-choose')).toHaveAttribute('href', '/goals');
    });

    it('Dado o Início, então os blocos que saíram (contas, categorias, recentes, insights, legado, captura) não estão aqui', async () => {
      await setup();

      for (const id of [
        'home-accounts-section',
        'home-categories-total',
        'home-recent',
        'home-insight',
        'home-legacy',
        'home-quick-capture',
        'home-third-parties-pending',
        'home-goals-summary',
      ]) {
        expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
      }
    });

    it('Dado a projeção, então avisa que é projeção', async () => {
      const s = stubs();
      s.dashboard.summary$ = of(aDashboardSummary({ isProjection: true }));
      await setup(s);

      expect(screen.getByTestId('home-projection')).toHaveTextContent(pt.home.projection);
    });
  });

  describe('gráfico compacto', () => {
    it('Dado o gráfico, então só oferece 7 dias, 30 dias e 12 meses e usa os valores do backend', async () => {
      const s = stubs();
      await setup(s);

      expect(await screen.findByTestId('home-overview-chart')).toBeInTheDocument();
      expect(screen.getByTestId('home-overview-period-D7')).toBeInTheDocument();
      expect(screen.getByTestId('home-overview-period-D30')).toBeInTheDocument();
      expect(screen.getByTestId('home-overview-period-M12')).toBeInTheDocument();
      expect(screen.queryByTestId('home-overview-period-M3')).not.toBeInTheDocument();
      expect(screen.getByTestId('home-overview-transactions')).toHaveAttribute(
        'href',
        '/transactions',
      );
    });

    it('Dado a troca de período, então pede o relatório do período escolhido', async () => {
      const s = stubs();
      const { fixture } = await setup(s);
      const periods: string[] = [];
      s.reports.incomeExpensesResult = (period) => {
        periods.push(period);
        return of(anIncomeExpenseSeries({ period }));
      };

      await userEvent.click(screen.getByTestId('home-overview-period-M12'));
      await fixture.whenStable();

      expect(periods).toEqual(['M12']);
    });
  });

  describe('+ Registrar', () => {
    it('Dado o botão, quando abro o menu e escolho "Emprestei", então abre o Novo registro já em "Emprestei"', async () => {
      await setup();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      expect(screen.getByTestId('home-register-open')).toHaveAttribute('href', '/quick-add');
      await userEvent.click(screen.getByTestId('home-register-menu'));
      await userEvent.click(await screen.findByTestId('home-register-menu-item-loan'));

      expect(navigate).toHaveBeenCalledWith(['/quick-add'], { queryParams: { mode: 'loan' } });
    });
  });

  it('Dado o inglês, então os rótulos vêm traduzidos', async () => {
    await setup(stubs(), 'en');

    expect(screen.getByText(en.brief.upcoming.title)).toBeInTheDocument();
    expect(screen.getByText(en.brief.register)).toBeInTheDocument();
    expect(screen.getByText(en.brief.result)).toBeInTheDocument();
  });

  it('Dado o Início completo, então não há violações de acessibilidade', async () => {
    const s = stubs();
    s.goals.goals = [aDreamGoal(3)];
    s.monthly.result = () => of(aSummary({ partial: false }));
    const { container } = await setup(s);
    await screen.findByTestId('home-featured-goal-open');

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});

function anEmptyUpcomingWith(items: UpcomingItem[]) {
  return { ...anEmptyUpcoming(), items };
}

describe('HomePage: fila das leituras do razão (R13)', () => {
  /** Observável que conta quantas leituras estão em voo e em que ordem começaram. */
  class Meter {
    inFlight = 0;
    max = 0;
    readonly started: string[] = [];

    track<T>(name: string, value: T): Observable<T> {
      return defer(() => {
        this.started.push(name);
        this.max = Math.max(this.max, ++this.inFlight);
        let open = true;
        const done = () => {
          if (!open) return;
          open = false;
          this.inFlight--;
        };
        return of(value).pipe(delay(15), tap({ complete: done, error: done, unsubscribe: done }));
      });
    }
  }

  it('Dado todos os blocos, então no máximo 2 leituras do razão ficam em voo e a ordem é a das prioridades', async () => {
    const meter = new Meter();
    const s = stubs();
    s.dashboard.summary$ = meter.track<DashboardSummary>('dashboard', aDashboardSummary());
    s.dashboard.upcoming$ = meter.track('upcoming', anUpcoming());
    s.monthly.result = () => meter.track('monthly', aSummary({ partial: false }));
    s.reports.incomeExpensesResult = () =>
      meter.track<IncomeExpenseSeries>('overview', anIncomeExpenseSeries());
    await setup(s);

    await waitFor(() => expect(screen.getByTestId('home-overview-chart')).toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(meter.max).toBeLessThanOrEqual(2);
    expect(meter.started).toEqual(['dashboard', 'upcoming', 'monthly', 'overview']);
    expect(meter.inFlight).toBe(0);
    expect(new LedgerGate().maxInFlight).toBe(2);
  });
});
