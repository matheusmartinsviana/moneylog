import { DeferBlockBehavior } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { defer, delay, Observable, of, tap, throwError } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { HomePage } from '~/app/features/home/pages/home.page';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';
import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';
import type { IncomeExpenseSeries } from '~/modules/reports/core/types/reports';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { AiGatewayStub, anInsight, anAiStatus, provideAiStub } from '~/testing/ai-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import { provideCategoriesStub } from '~/testing/categories-testing';
import {
  aDashboardSummary,
  DashboardGatewayStub,
  provideDashboardStub,
} from '~/testing/dashboard-testing';
import { provideDebtOverviewStub } from '~/testing/debt-overview-testing';
import {
  aSummary,
  MonthlySummaryGatewayStub,
  provideMonthlySummaryStub,
} from '~/testing/etapa5-testing';
import { provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotificationsStub } from '~/testing/notifications-testing';
import {
  anIncomeExpenseSeries,
  aSpendingByCategory,
  provideReportsStub,
  ReportsGatewayStub,
} from '~/testing/reports-testing';
import { provideTransactionsStub, TransactionsGatewayStub } from '~/testing/transactions-testing';
import { LedgerGate } from '~/util/api/ledger-gate';

/** Dinheiro no formato bruto do contrato (moeda literal), para as respostas tipadas pelos schemas. */
const wire = (amount: string) => ({ amount, currency: 'BRL' as const });

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Tudo o que o Início lê, com os dados do contrato (o consumo do KPI e o total das categorias são o mesmo número). */
function stubs() {
  const dashboard = new DashboardGatewayStub();
  const monthly = new MonthlySummaryGatewayStub();
  const reports = new ReportsGatewayStub();
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [
    anAccount({ id: 'acc-1', name: 'Nubank' }),
    anAccount({ id: 'acc-2', name: 'Antiga', status: 'ARCHIVED' }),
  ];
  const cards = new CardsGatewayStub();
  cards.cards = [aCard({ id: 'card-1', name: 'Roxinho' })];
  const transactions = new TransactionsGatewayStub();
  const ai = new AiGatewayStub();
  ai.insightsResult = () => of({ items: [anInsight()], hasNext: false });
  reports.spendingResult = () => of(aSpendingByCategory({ total: wire('1620.50') }));
  return { dashboard, monthly, reports, accounts, cards, transactions, ai };
}

type Stubs = ReturnType<typeof stubs>;

async function setup(s: Stubs = stubs(), language: 'pt' | 'en' = 'pt') {
  const result = await render(HomePage, {
    // O gráfico é um bloco @defer (chunk à parte): o Testing Library o deixa manual por padrão.
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
    providers: [
      provideI18nTesting(language),
      provideRouter([]),
      ...provideAiStub(s.ai),
      provideDashboardStub(s.dashboard),
      provideMonthlySummaryStub(s.monthly),
      provideReportsStub(s.reports),
      provideAccountsStub(s.accounts),
      provideCardsStub(s.cards),
      provideTransactionsStub(s.transactions),
      provideGoalsStub(),
      ...provideCategoriesStub(),
      ...provideNotificationsStub(),
      ...provideDebtOverviewStub(),
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, ...s };
}

const closedMonth = (): MonthlySummary => aSummary({ partial: false, competence: '2026-10' });

describe('HomePage: novo Início (fatia C1)', () => {
  it('Dado o Início, então a ordem é: gráfico, KPIs do mês, Quick Capture, saldo e poupança, recentes, contas, categorias, orçamento e compromissos', async () => {
    const s = stubs();
    s.monthly.result = () => of(closedMonth());
    await setup(s);
    // O gráfico é um chunk à parte (@defer): espera ele chegar.
    await screen.findByTestId('home-overview-chart');

    const order = [
      'home-overview-chart',
      'home-kpis',
      'home-quick-capture',
      'home-kpis-balance',
      'home-recent',
      'home-accounts-section',
      'home-categories',
      'home-budget',
      'home-insight-text',
      'home-legacy',
    ].map((id) => screen.getByTestId(id));
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${i - 1} antes de ${i}`,
      ).toBeTruthy();
    }
  });

  it('Dado o Início, então há um único botão primário (o Salvar do Quick Capture) e "Mais opções" leva ao /quick-add', async () => {
    const { container } = await setup();

    const primaries = container.querySelectorAll('.button--primary');
    expect(primaries).toHaveLength(1);
    expect(screen.getByTestId('quick-capture-save')).toBe(primaries[0]);
    const more = screen.getByTestId('home-quick-capture-link');
    expect(more).not.toHaveClass('button--primary');
    expect(more).toHaveAttribute('href', '/quick-add?mode=expense');
    expect(screen.getByTestId('home-action-quick-add')).not.toHaveClass('button--primary');
  });

  it('Dado os KPIs e as categorias, então o gasto do KPI é igual ao total de "Where your money goes" (mesma fonte)', async () => {
    await setup();

    await screen.findByTestId('home-categories-total');
    expect(text(screen.getByTestId('kpi-spending-value'))).toBe('R$ 1.620,50');
    expect(text(screen.getByTestId('home-categories-total'))).toContain('R$ 1.620,50');
  });

  it('Dado o dashboard, então os demais blocos usam a competência e o asOf do backend (não o relógio)', async () => {
    const s = stubs();
    await setup(s);

    expect(s.monthly.months).toEqual(['2026-10']);
    expect(s.reports.months).toEqual(['2026-10']);
    expect(s.reports.periods).toEqual(['D30']);
    expect(s.transactions.listCalls[0]?.filters).toMatchObject({
      to: '2026-10-10',
      from: null,
      status: 'ACTIVE',
    });
    expect(s.transactions.listCalls[0]?.pageSize).toBe(5);
  });

  it('Dado contas ativas e arquivadas, então o strip mostra só as ativas e o cartão como "Fatura atual"', async () => {
    await setup();

    expect(screen.getByTestId('home-account-acc-1')).toBeInTheDocument();
    expect(screen.queryByTestId('home-account-acc-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-card-tile-card-1')).toHaveTextContent(
      pt.dashboard.accounts.invoiceTitle,
    );
  });

  it('Dado nenhuma conta ativa (só arquivadas), então o strip diz isso com "Criar conta"', async () => {
    const s = stubs();
    s.accounts.accounts = [anAccount({ status: 'ARCHIVED' })];
    await setup(s);

    expect(screen.getByTestId('home-accounts-empty')).toHaveTextContent(
      pt.dashboard.accounts.empty.title,
    );
    expect(screen.getByTestId('home-accounts-create')).toHaveAttribute('href', '/accounts/new');
  });

  describe('falhas isoladas: só o bloco afetado mostra erro, o resto segue', () => {
    it('Dado erro no gráfico, então só ele mostra "tentar de novo"; o retry repete o período e recupera', async () => {
      const s = stubs();
      s.reports.incomeExpensesResult = () => failWith(500, 'INTERNAL_ERROR');
      await setup(s);

      expect(screen.getByTestId('home-overview-error')).toBeInTheDocument();
      expect(screen.getByTestId('home-kpis')).toBeInTheDocument();
      expect(screen.getByTestId('home-categories')).toBeInTheDocument();
      expect(screen.getByTestId('home-recent')).toBeInTheDocument();

      s.reports.incomeExpensesResult = (period) => of(anIncomeExpenseSeries({ period }));
      await userEvent.click(screen.getByTestId('home-overview-retry'));

      expect(await screen.findByTestId('home-overview-chart')).toBeInTheDocument();
      expect(s.reports.periods).toEqual(['D30', 'D30']);
    });

    it('Dado erro no resumo mensal, então só a taxa de poupança fica indisponível (os valores do dashboard seguem)', async () => {
      const s = stubs();
      s.monthly.result = () => failWith(500, 'INTERNAL_ERROR');
      await setup(s);

      expect(screen.getByTestId('kpi-savings-error')).toBeInTheDocument();
      expect(text(screen.getByTestId('kpi-spending-value'))).toBe('R$ 1.620,50');
      expect(screen.getByTestId('home-insight-text')).toBeInTheDocument();
    });

    it('Dado erro nas categorias e nas recentes, então cada cartão tem o seu erro', async () => {
      const s = stubs();
      s.reports.spendingResult = () => throwError(() => new Error('x'));
      s.transactions.list$ = () => failWith(500, 'INTERNAL_ERROR');
      await setup(s);

      expect(screen.getByTestId('home-categories-error')).toBeInTheDocument();
      expect(screen.getByTestId('home-recent-error')).toBeInTheDocument();
      expect(await screen.findByTestId('home-overview-chart')).toBeInTheDocument();
    });

    it('Dado erro nas contas, então o strip mostra "tentar de novo" e recarrega', async () => {
      const s = stubs();
      s.accounts.listError = failWith(500, 'INTERNAL_ERROR');
      await setup(s);
      expect(screen.getByTestId('home-accounts-error')).toBeInTheDocument();

      s.accounts.listError = null;
      await userEvent.click(screen.getByTestId('home-accounts-retry'));

      expect(await screen.findByTestId('home-account-acc-1')).toBeInTheDocument();
    });
  });

  it('Dado a troca de período, então chama o relatório do período e mostra os valores do JSON', async () => {
    const s = stubs();
    s.reports.incomeExpensesResult = (period) =>
      of(
        period === 'M3'
          ? anIncomeExpenseSeries({
              period: 'M3',
              granularity: 'WEEK',
              totals: { income: wire('9000.00'), expenses: wire('4000.00'), net: wire('5000.00') },
            })
          : anIncomeExpenseSeries({ period }),
      );
    await setup(s);

    await userEvent.click(screen.getByTestId('home-overview-period-M3'));

    await waitFor(() => expect(s.reports.periods).toEqual(['D30', 'M3']));
    expect(text(screen.getByTestId('home-overview-income'))).toBe('R$ 9.000,00');
    expect(text(screen.getByTestId('home-overview-net'))).toBe('R$ 5.000,00');
    expect(screen.getByTestId('home-overview-period-M3')).toHaveAttribute('aria-checked', 'true');
  });

  describe('mês em andamento (R5)', () => {
    it('Dado partial = true e -80%, então os chips são neutros', async () => {
      const s = stubs();
      const base = aSummary({ partial: true });
      s.monthly.result = () =>
        of({
          ...base,
          comparison: {
            ...base.comparison,
            expensesDelta: { amount: brl('-4800.00'), percent: '-0.8000' },
          },
        });
      await setup(s);

      expect(screen.getByTestId('kpi-spending-change')).toHaveAttribute('data-tone', 'neutral');
      expect(text(screen.getByTestId('kpi-spending-change'))).toContain(
        'mês em andamento vs mês anterior inteiro',
      );
    });
  });

  it('Dado nenhum insight do backend, então o cartão de insight não aparece', async () => {
    const s = stubs();
    s.ai.insightsResult = () => of({ items: [], hasNext: false });
    await setup(s);

    expect(screen.queryByTestId('home-insight-text')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-budget')).toBeInTheDocument();
  });

  it('Dado a IA desligada, então "Perguntar à IA" e o orçamento seguem desabilitados e sem efeito (nada finge funcionar)', async () => {
    const s = stubs();
    s.monthly.result = () => of(closedMonth());
    await setup(s);

    for (const id of ['home-insight-ask-ai', 'home-budget']) {
      expect(screen.getByTestId(id)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(within(screen.getByTestId('home-budget')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('Dado a IA ligada, então "Perguntar à IA" abre o consentimento com o conteúdo da prévia', async () => {
    const s = stubs();
    s.ai.statusResult = () => of(anAiStatus({ enabled: true, provider: 'fake', model: 'm' }));
    await setup(s);

    const ask = await screen.findByTestId('home-insight-ask-ai');
    await waitFor(() => expect(ask).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(ask);

    expect(await screen.findByTestId('ai-ask-consent')).toBeInTheDocument();
    expect(s.ai.previews[0]).toMatchObject({ purpose: 'INSIGHTS' });
    expect(s.ai.runs).toEqual([]);
  });

  it('Dado os compromissos e o patrimônio (o que já existia), então continuam na seção de baixo com os mesmos data-cy', async () => {
    await setup();

    const legacy = screen.getByTestId('home-legacy');
    for (const id of [
      'home-available',
      'home-commitments',
      'home-action-goal',
      'home-action-summary',
      'home-cards',
    ]) {
      expect(within(legacy).getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('home-dashboard')).toContainElement(legacy);
  });

  it('Dado a visita nova, então o resumo mensal e os relatórios são pedidos de novo (sem cache velho)', async () => {
    const s = stubs();
    const { fixture } = await setup(s);
    expect(s.monthly.months).toHaveLength(1);

    fixture.componentInstance.ngOnInit();
    await fixture.whenStable();

    expect(s.monthly.months).toHaveLength(2);
    expect(s.reports.periods).toHaveLength(2);
  });

  it('Dado o inglês, então os rótulos dos blocos vêm traduzidos', async () => {
    const s = stubs();
    s.monthly.result = () => of(closedMonth());
    await setup(s, 'en');

    expect(screen.getByRole('heading', { name: 'Where your money goes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Income and expenses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Monthly budget' })).toBeInTheDocument();
  });

  it('Dado o Início completo, então não há violações de acessibilidade', async () => {
    const s = stubs();
    s.monthly.result = () => of(closedMonth());
    const { container } = await setup(s);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});

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
        // A leitura deixa de estar em voo quando completa (antes de avisar o assinante), falha ou é cancelada.
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
    s.dashboard.upcoming$ = meter.track<Upcoming>('upcoming', {
      items: [],
      undated: [],
      totals: { out: brl('0.00'), in: brl('0.00') },
      overdueTruncated: false,
    });
    s.monthly.result = () => meter.track('monthly', closedMonth());
    s.reports.spendingResult = () => meter.track('categories', aSpendingByCategory());
    s.reports.incomeExpensesResult = () =>
      meter.track<IncomeExpenseSeries>('overview', anIncomeExpenseSeries());
    const accountsList = s.accounts.list.bind(s.accounts);
    s.accounts.list = (query) =>
      meter
        .track('accounts', undefined)
        .pipe(
          delay(0),
          (source) =>
            new Observable((subscriber) =>
              source.subscribe({ complete: () => accountsList(query).subscribe(subscriber) }),
            ),
        );
    const cardsList = s.cards.list.bind(s.cards);
    s.cards.list = (query) =>
      meter
        .track('cards', undefined)
        .pipe(
          (source) =>
            new Observable((subscriber) =>
              source.subscribe({ complete: () => cardsList(query).subscribe(subscriber) }),
            ),
        );
    await setup(s);

    await waitFor(() => expect(screen.getByTestId('home-overview-chart')).toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(meter.max).toBeLessThanOrEqual(2);
    expect(meter.started).toEqual([
      'dashboard',
      'upcoming',
      'monthly',
      'accounts',
      'cards',
      'categories',
      'overview',
    ]);
    expect(meter.inFlight).toBe(0);
    expect(new LedgerGate().maxInFlight).toBe(2);
  });
});
