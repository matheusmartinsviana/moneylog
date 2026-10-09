import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { AvailableBalanceComponent } from '~/app/features/home/components/available-balance/available-balance.component';
import { CardsSummaryComponent } from '~/app/features/home/components/cards-summary/cards-summary.component';
import { CommitmentsComponent } from '~/app/features/home/components/commitments/commitments.component';
import { MonthSummaryComponent } from '~/app/features/home/components/month-summary/month-summary.component';
import { NetWorthComponent } from '~/app/features/home/components/net-worth/net-worth.component';
import { UpcomingListComponent } from '~/app/features/home/components/upcoming-list/upcoming-list.component';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import {
  RealizeSheetComponent,
  RealizeTarget,
} from '~/app/features/planning/components/realize-sheet/realize-sheet.component';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import { DashboardFacade } from '~/modules/dashboard/core/facades/dashboard.facade';
import type { UpcomingItem } from '~/modules/dashboard/core/types/upcoming';
import { formatCompetence } from '~/util/date';

/**
 * Panorama (smart): o que o Início tinha em "Compromissos e patrimônio", agora numa aba de Planejamento. Disponível,
 * comprometido por horizonte, a seguir (com "Realizar"), mês, patrimônio e cartões, todos **como o servidor
 * calculou** (nada é somado aqui), com os mesmos `data-cy` de antes. Trata carregando, vazio, erro (com tentar de
 * novo) e sem permissão.
 */
@Component({
  selector: 'app-overview-page',
  imports: [
    RouterLink,
    PageLayoutComponent,
    DisclosureComponent,
    EmptyStateComponent,
    SectionContainerComponent,
    PlanningNavComponent,
    AvailableBalanceComponent,
    CommitmentsComponent,
    UpcomingListComponent,
    MonthSummaryComponent,
    NetWorthComponent,
    CardsSummaryComponent,
    RealizeSheetComponent,
  ],
  providers: [DashboardFacade, CardsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.css',
})
export class OverviewPage implements OnInit {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly dashboard = inject(DashboardFacade);
  protected readonly cards = inject(CardsListFacade);

  protected readonly competence = computed(() => {
    const data = this.dashboard.data();
    return data
      ? formatCompetence(data.summary.month.competence, HTML_LANG[this.i18n.language()])
      : undefined;
  });

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

  /** A folha de "Realizar" fica montada depois de fechar (guarda a `Idempotency-Key` pendente). */
  protected readonly realizing = signal<RealizeTarget | null>(null);
  protected readonly realizeOpen = signal(false);

  ngOnInit(): void {
    this.dashboard.load();
    this.cards.load('ACTIVE');
  }

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

  /** Depois de realizar (ou de a ocorrência ter mudado), a página volta a ler tudo do backend. */
  protected afterRealized(): void {
    this.realizeOpen.set(false);
    this.dashboard.reload();
  }

  protected onErrorAction(id: string): void {
    if (id === 'retry') this.dashboard.load();
  }
}
