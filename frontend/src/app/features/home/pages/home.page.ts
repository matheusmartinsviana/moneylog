import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { MotionStaggerDirective } from '~/app/common/motion/motion-stagger.directive';
import { AiAskDialogComponent } from '~/app/features/ai/components/ai-ask-dialog/ai-ask-dialog.component';
import { ReserveSheetComponent } from '~/app/features/goals/components/reserve-sheet/reserve-sheet.component';
import { AccountsStripComponent } from '~/app/features/home/components/accounts-strip/accounts-strip.component';
import { AvailableBalanceComponent } from '~/app/features/home/components/available-balance/available-balance.component';
import { BudgetCardComponent } from '~/app/features/home/components/budget-card/budget-card.component';
import { CardsSummaryComponent } from '~/app/features/home/components/cards-summary/cards-summary.component';
import { CategorySpendingComponent } from '~/app/features/home/components/category-spending/category-spending.component';
import { CommitmentsComponent } from '~/app/features/home/components/commitments/commitments.component';
import { DebtSummaryCardComponent } from '~/app/features/home/components/debt-summary-card/debt-summary-card.component';
import { GoalsSummaryComponent } from '~/app/features/home/components/goals-summary/goals-summary.component';
import {
  hasInsight,
  InsightCardComponent,
} from '~/app/features/home/components/insight-card/insight-card.component';
import { KpiCardsComponent } from '~/app/features/home/components/kpi-cards/kpi-cards.component';
import { MonthSummaryComponent } from '~/app/features/home/components/month-summary/month-summary.component';
import { NetWorthComponent } from '~/app/features/home/components/net-worth/net-worth.component';
import { QuickCaptureComponent } from '~/app/features/home/components/quick-capture/quick-capture.component';
import { RecentTransactionsComponent } from '~/app/features/home/components/recent-transactions/recent-transactions.component';
import { SpendingOverviewComponent } from '~/app/features/home/components/spending-overview/spending-overview.component';
import { ThirdPartySummaryCardComponent } from '~/app/features/home/components/third-party-summary-card/third-party-summary-card.component';
import { UpcomingListComponent } from '~/app/features/home/components/upcoming-list/upcoming-list.component';
import { dailyText } from '~/app/features/notifications/notification-text';
import {
  RealizeSheetComponent,
  RealizeTarget,
} from '~/app/features/planning/components/realize-sheet/realize-sheet.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { AiStatusFacade } from '~/modules/ai/core/facades/ai-status.facade';
import { InsightsFacade } from '~/modules/ai/core/facades/insights.facade';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import { DashboardFacade } from '~/modules/dashboard/core/facades/dashboard.facade';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { UpcomingItem } from '~/modules/dashboard/core/types/upcoming';
import { GoalsListFacade } from '~/modules/goals/core/facades/goals-list.facade';
import { MonthlySummaryFacade } from '~/modules/monthly-summary/core/facades/monthly-summary.facade';
import { DailyMessageFacade } from '~/modules/notifications/core/facades/daily-message.facade';
import { CategorySpendingFacade } from '~/modules/reports/core/facades/category-spending.facade';
import { SpendingOverviewFacade } from '~/modules/reports/core/facades/spending-overview.facade';
import type { ReportPeriod } from '~/modules/reports/core/types/reports';
import { RecentTransactionsFacade } from '~/modules/transactions/core/facades/recent-transactions.facade';
import { LEDGER_GATE, LedgerGate } from '~/util/api/ledger-gate';
import { formatCompetence, formatIsoDate } from '~/util/date';

/**
 * Início (smart, redesenhado na fatia C): fala só com as facades de negócio (FE 01) e trata os estados
 * carregando, vazio, erro (com tentar de novo), sem permissão e com dados.
 *
 * Composição (DS 02): atalho do Quick Capture (o único botão primário da tela) → 4 KPIs → contas e fatura dos
 * cartões → entradas e saídas (7 dias a 12 meses) + "para onde vai o dinheiro" → recentes + orçamento ("em breve") +
 * insight → **"Compromissos e patrimônio"** (o que já existia: disponível, a seguir, mês, patrimônio, cartões e
 * ações, com os mesmos `data-cy`). **Cada bloco tem o próprio estado** (uma falha num cartão não derruba o
 * Início) e **as leituras do razão entram numa fila por prioridade, no máximo 2 em voo** (R13, `LedgerGate`):
 * dashboard primeiro, depois o resumo mensal, as contas e os cartões, a divisão por categoria e por último a série.
 * Nenhum valor, percentual ou variação é calculado aqui.
 */
@Component({
  selector: 'app-home-page',
  imports: [
    MotionStaggerDirective,
    DebtSummaryCardComponent,
    ThirdPartySummaryCardComponent,
    RouterLink,
    AccountsStripComponent,
    BudgetCardComponent,
    CategorySpendingComponent,
    InsightCardComponent,
    AiAskDialogComponent,
    KpiCardsComponent,
    QuickCaptureComponent,
    RecentTransactionsComponent,
    SpendingOverviewComponent,
    PageLayoutComponent,
    EmptyStateComponent,
    SectionContainerComponent,
    AvailableBalanceComponent,
    CommitmentsComponent,
    UpcomingListComponent,
    MonthSummaryComponent,
    NetWorthComponent,
    CardsSummaryComponent,
    RealizeSheetComponent,
    ReserveSheetComponent,
    GoalsSummaryComponent,
  ],
  providers: [
    // Uma fila por visita: no máximo 2 leituras do razão em voo (R13, ADR-008).
    { provide: LEDGER_GATE, useFactory: () => new LedgerGate() },
    DashboardFacade,
    DailyMessageFacade,
    AccountsListFacade,
    CardsListFacade,
    GoalsListFacade,
    MonthlySummaryFacade,
    InsightsFacade,
    SpendingOverviewFacade,
    CategorySpendingFacade,
    RecentTransactionsFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class HomePage implements OnInit {
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = this.i18n.t;
  protected readonly dashboard = inject(DashboardFacade);
  private readonly dailyMessage = inject(DailyMessageFacade);
  /** Mensagem do dia (chave + números do backend); `null` sem resposta: nada é mostrado. */
  protected readonly daily = computed(() => {
    const message = this.dailyMessage.message();
    return message
      ? dailyText(message, this.t().notifications, HTML_LANG[this.i18n.language()])
      : null;
  });
  protected readonly accounts = inject(AccountsListFacade);
  protected readonly cards = inject(CardsListFacade);
  protected readonly goals = inject(GoalsListFacade);
  protected readonly monthly = inject(MonthlySummaryFacade);
  protected readonly overview = inject(SpendingOverviewFacade);
  protected readonly categories = inject(CategorySpendingFacade);
  protected readonly recent = inject(RecentTransactionsFacade);
  /** A meta de quitar dívidas não tem reservas: só as de reserva entram no atalho "Meta". */
  protected readonly reservableGoals = computed(() =>
    (this.goals.data() ?? []).filter((goal) => goal.kind === 'SAVINGS'),
  );

  /** `?mode=income` no Início abre o Quick Capture em Receita; qualquer outro valor é despesa. */
  protected readonly captureType = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => (params.get('mode') === 'income' ? 'INCOME' : 'EXPENSE')),
    ),
    { initialValue: 'EXPENSE' as const },
  );

  /** Atalho "Meta" (T101): a folha de reserva rápida, com a lista de metas ativas do backend. */
  protected readonly goalSheetOpen = signal(false);

  /** Estado vazio: "Adicionar conta" leva ao cadastro; importar segue indisponível (S-33). */
  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => {
    const copy = this.t().emptyState.home;
    return [
      {
        id: 'add-account',
        label: copy.addAccount,
        available: true,
        primary: true,
        link: '/accounts/new',
      },
      { id: 'import-statement', label: copy.importStatement, available: false },
    ];
  });

  protected readonly retryActions = computed<readonly EmptyStateAction[]>(() => [
    { id: 'retry', label: this.t().home.error.retry, available: true, primary: true },
  ]);

  protected readonly asOf = computed(() => {
    const data = this.dashboard.data();
    if (!data) return undefined;
    const date = formatIsoDate(data.summary.asOf, this.locale(), 'long');
    return interpolate(this.t().home.asOf, { date });
  });

  protected readonly competence = computed(() => {
    const data = this.dashboard.data();
    return data ? formatCompetence(data.summary.month.competence, this.locale()) : undefined;
  });

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  /** Estado do resumo mensal para o KPI (que só distingue carregando, erro e pronto). */
  protected readonly monthlyStatus = computed(() => {
    const status = this.monthly.state().status;
    return status === 'ready'
      ? ('ready' as const)
      : status === 'error'
        ? ('error' as const)
        : ('loading' as const);
  });

  /** O cartão de insight só nasce com dado real (a maior categoria do mês). */
  protected readonly insights = inject(InsightsFacade);
  protected readonly aiStatus = inject(AiStatusFacade);
  protected readonly insightVisible = computed(() => hasInsight(this.insights.items()));
  protected readonly askOpen = signal(false);

  /** Cartões ativos da fatura atual no strip: só quando a lista chegou (senão o strip mostra só as contas). */
  protected readonly stripCards = computed(() => this.cards.data() ?? []);

  constructor() {
    // Dashboard pronto (ou recarregado depois de realizar/reservar): o resto do Início carrega por prioridade.
    effect(() => {
      const data = this.dashboard.data();
      if (data === null) return;
      untracked(() => this.loadSecondary(data.summary));
    });
  }

  /**
   * "Realizar" numa ocorrência de recorrência do `/upcoming` (T89): a folha de T88. Fica montada depois de
   * fechar (guarda a `Idempotency-Key` pendente) e só nasce no primeiro uso.
   */
  protected readonly realizing = signal<RealizeTarget | null>(null);
  protected readonly realizeOpen = signal(false);

  protected openRealize(item: UpcomingItem): void {
    if (item.refId === null || item.dueDate === null) return;
    this.realizeOpen.set(true);
    this.realizing.set({
      recurrenceId: item.refId,
      date: item.dueDate,
      amount: item.amount,
      label: item.label,
      viaCard: null,
    });
  }

  /** Depois de realizar (ou de a ocorrência ter mudado), o Início volta a ler tudo do backend. */
  protected afterRealized(): void {
    this.realizeOpen.set(false);
    this.dashboard.reload();
  }

  ngOnInit(): void {
    this.dashboard.load();
    this.dailyMessage.load();
    this.aiStatus.ensureLoaded();
    this.goals.load('ACTIVE');
  }

  /**
   * Os demais blocos usam a data (`asOf`) e a competência do **backend**; a fila (`LedgerGate`) decide a ordem.
   * O período do gráfico escolhido pelo usuário é mantido numa recarga.
   */
  private loadSecondary(summary: DashboardSummary): void {
    const month = summary.month.competence;
    this.monthly.load(month);
    this.insights.load(month);
    this.accounts.load('ACTIVE');
    this.cards.load('ACTIVE');
    this.categories.load(month);
    this.overview.load(this.overview.period());
    this.recent.load(summary.asOf);
  }

  /** Salvou pelo Quick Capture: o Início relê tudo do backend (nada é atualizado no front). */
  protected afterCaptured(): void {
    this.dashboard.reload();
  }

  protected changePeriod(period: ReportPeriod): void {
    this.overview.load(period);
  }

  /**
   * "Meta": sem metas leva a `/goals/new`; com metas abre a reserva rápida (a ordem é a do backend, a
   * primeira é a de maior prioridade); enquanto a lista não chegou (ou falhou) leva à lista de metas.
   */
  protected openGoalQuick(): void {
    switch (this.goals.state().status) {
      case 'ready':
        if (this.reservableGoals().length === 0) {
          void this.router.navigate(['/goals/new']);
          break;
        }
        this.goalSheetOpen.set(true);
        break;
      case 'empty':
        void this.router.navigate(['/goals/new']);
        break;
      default:
        void this.router.navigate(['/goals']);
    }
  }

  /** Reservou ou liberou: o Início volta a ler `reserved` e `available` do backend. */
  protected afterGoalReserve(): void {
    this.goalSheetOpen.set(false);
    this.dashboard.reload();
    this.goals.reload('ACTIVE');
  }

  protected retryCards(): void {
    this.cards.load('ACTIVE');
  }

  protected retryAccounts(): void {
    this.accounts.load('ACTIVE');
  }

  protected onErrorAction(id: string): void {
    if (id === 'retry') this.dashboard.load();
  }
}
