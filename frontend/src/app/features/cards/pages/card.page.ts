import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MenuComponent, MenuItem } from '~/app/common/components/menu/menu.component';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { TabPanelDirective } from '~/app/common/components/tabs/tab-panel.directive';
import { TabItem, TabsComponent } from '~/app/common/components/tabs/tabs.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { CardHeaderComponent } from '~/app/features/cards/components/card-header/card-header.component';
import { FutureInstallmentsListComponent } from '~/app/features/cards/components/future-installments-list/future-installments-list.component';
import { InvoiceSummaryRowComponent } from '~/app/features/cards/components/invoice-summary-row/invoice-summary-row.component';
import { PayInvoiceSheetComponent } from '~/app/features/cards/components/pay-invoice-sheet/pay-invoice-sheet.component';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { OngoingInstallmentsModalComponent } from '~/app/features/planning/components/ongoing-installments-modal/ongoing-installments-modal.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { CardDetailFacade } from '~/modules/cards/core/facades/card-detail.facade';
import type { InvoiceSummary } from '~/modules/cards/core/types/invoice';
import { isPositive } from '~/util/money';

type TabId = 'invoices' | 'future';
type ActionId = 'pay' | 'purchase' | 'ongoing' | 'edit';

/**
 * Tela do cartão (`/cards/:id`, smart, T65): resumo (limite, disponível, **total comprometido** e, à
 * parte, o comprometido em compras futuras, ambos do backend), as abas "Faturas" e "Parcelas futuras"
 * (a aba ativa vai para `?tab=`) e as ações (Pagar fatura, Nova compra, Editar). No celular as ações
 * viram um menu. Cartão de outro usuário ou inexistente: "não encontrado" com voltar. Depois de um
 * pagamento, recarrega o cartão e as faturas do backend.
 */
@Component({
  selector: 'app-card-page',
  imports: [
    RouterOutlet,
    LinkedNotesComponent,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    MenuComponent,
    TabsComponent,
    TabPanelDirective,
    CardHeaderComponent,
    InvoiceSummaryRowComponent,
    FutureInstallmentsListComponent,
    PayInvoiceSheetComponent,
    OngoingInstallmentsModalComponent,
  ],
  providers: [CardDetailFacade, AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card.page.html',
  styleUrl: './card.page.css',
})
export class CardPage {
  private readonly changes = inject(EntityChanges);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly accountsFacade = inject(AccountsListFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(CardDetailFacade);
  protected readonly compact = inject(ViewportService).compact;

  /** `:id` da rota. */
  readonly id = input.required<string>();
  /** `?tab=` da URL; qualquer valor desconhecido abre as faturas. */
  readonly tab = input<string>();

  protected readonly card = this.facade.card;
  protected readonly state = this.facade.state;
  protected readonly invoices = this.facade.invoices;
  protected readonly future = this.facade.future;
  protected readonly paying = signal(false);
  private readonly accounts = signal<readonly Account[]>([]);

  protected readonly activeTab = computed<TabId>(() =>
    this.tab() === 'future' ? 'future' : 'invoices',
  );
  protected readonly tabs = computed<readonly TabItem[]>(() => {
    const copy = this.t().cards.detail.tabs;
    return [
      { id: 'invoices', label: copy.invoices },
      { id: 'future', label: copy.future },
    ];
  });

  protected readonly cashAccounts = computed(() =>
    this.accounts().filter((account) => account.liquidity === 'CASH'),
  );

  /**
   * A fatura que "Pagar fatura" abre: a fechada ou atrasada mais antiga com saldo; sem ela, a corrente
   * (pagamento antecipado). Escolha só por `status`, vencimento e sinal do `outstanding`: nenhuma conta.
   * Só decide com a lista de faturas **carregada**: carregando ou em erro devolve `null` (não cai na
   * corrente, que poderia ser a fatura errada com uma vencida em aberto).
   */
  protected readonly payTarget = computed<InvoiceSummary | null>(() => {
    const card = this.card();
    if (!card) return null;
    const list = this.invoices();
    if (list.status !== 'ready') return null;
    const due = list.data
      .filter(
        (invoice) =>
          (invoice.status === 'CLOSED' || invoice.status === 'OVERDUE') &&
          isPositive(invoice.outstanding),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (due) return due;
    const current = card.currentInvoice;
    return current && current.status === 'OPEN' && isPositive(current.outstanding) ? current : null;
  });

  /** Por que "Pagar" está desabilitado: a lista de faturas ainda não chegou ou falhou. */
  protected readonly payHint = computed<'loading' | 'error' | 'nothing' | null>(() => {
    if (this.payTarget() !== null) return null;
    const status = this.invoices().status;
    return status === 'ready' ? 'nothing' : status === 'error' ? 'error' : 'loading';
  });

  protected readonly menuItems = computed<readonly MenuItem[]>(() => {
    const copy = this.t().cards.detail;
    return [
      { id: 'pay', label: copy.payInvoice, disabled: this.payTarget() === null },
      { id: 'purchase', label: copy.newPurchase },
      { id: 'ongoing', label: this.t().debtOverview.actions.addOngoing },
      { id: 'edit', label: copy.edit },
    ];
  });

  protected readonly notFoundActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().cards.detail.notFound.back,
      available: true,
      primary: true,
      link: '/cards',
    },
  ]);
  protected readonly loadProblem = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    // Um cadastro foi salvo no modal por cima desta página: relê do backend.
    this.changes
      .of('cards')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.facade.refresh(this.id()));
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.load(id));
    });
    // A aba "Parcelas futuras" carrega na primeira abertura (e quando o cartão muda).
    effect(() => {
      const id = this.id();
      if (this.activeTab() === 'future' && this.facade.future().status === 'idle') {
        untracked(() => this.facade.loadFuture(id));
      }
    });
    this.accountsFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      // Sem a lista de contas o pagamento mostra "cadastre uma conta"; o resto da tela segue.
      .subscribe({ next: (accounts) => this.accounts.set(accounts), error: () => undefined });
  }

  protected setTab(tab: string | null): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'future' ? 'future' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected readonly ongoingOpen = signal(false);

  /** Cadastrou o parcelado em andamento: o cartão relê fatura, limite e parcelas futuras do backend. */
  protected afterOngoing(): void {
    this.ongoingOpen.set(false);
    this.facade.refresh(this.id());
  }

  protected run(action: string): void {
    switch (action as ActionId) {
      case 'pay':
        this.openPay();
        break;
      case 'purchase':
        void this.router.navigate(['/quick-add'], {
          queryParams: { mode: 'credit', cardId: this.id() },
        });
        break;
      case 'ongoing':
        this.ongoingOpen.set(true);
        break;
      case 'edit':
        void this.router.navigate(['/cards', this.id(), 'edit']);
        break;
    }
  }

  protected openPay(): void {
    if (this.payTarget() !== null) this.paying.set(true);
  }

  protected closePay(): void {
    this.paying.set(false);
  }

  /** Pagou: recarrega o cartão e as faturas do backend (limite, `outstanding`, status). */
  protected onPaid(): void {
    this.paying.set(false);
    this.facade.refresh(this.id());
  }

  protected retry(): void {
    this.facade.load(this.id());
  }

  protected retryInvoices(): void {
    this.facade.loadInvoices(this.id());
  }

  protected retryFuture(): void {
    this.facade.loadFuture(this.id());
  }
}
