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
import { RouterLink } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { InvoiceItemsTableComponent } from '~/app/features/cards/components/invoice-items-table/invoice-items-table.component';
import { InvoicePaymentsListComponent } from '~/app/features/cards/components/invoice-payments-list/invoice-payments-list.component';
import { InvoiceTotalsComponent } from '~/app/features/cards/components/invoice-totals/invoice-totals.component';
import { PayInvoiceSheetComponent } from '~/app/features/cards/components/pay-invoice-sheet/pay-invoice-sheet.component';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { CardDetailFacade } from '~/modules/cards/core/facades/card-detail.facade';
import { InvoiceDetailFacade } from '~/modules/cards/core/facades/invoice-detail.facade';
import type { Invoice } from '~/modules/cards/core/types/invoice';
import { formatCompetenceShort } from '~/util/date';

/**
 * Detalhe da fatura (`/cards/:id/invoices/:invoiceId`, smart, T66): itens (parcelas e créditos),
 * pagamentos, `carryIn`, `creditCarry`, `outstanding` e situação, tudo como o backend calculou. "Pagar"
 * abre a folha de pagamento (T68) e fica desabilitada com a razão quando a fatura é `PAID` ou `FUTURE`
 * (a decisão vem do `status`; a recusa final é do backend). Depois de pagar, a fatura devolvida
 * substitui a atual e o cartão é recarregado.
 */
@Component({
  selector: 'app-invoice-page',
  imports: [
    LinkedNotesComponent,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InvoiceTotalsComponent,
    InvoiceItemsTableComponent,
    InvoicePaymentsListComponent,
    PayInvoiceSheetComponent,
  ],
  providers: [InvoiceDetailFacade, CardDetailFacade, AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoice.page.html',
  styleUrl: './invoice.page.css',
})
export class InvoicePage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(I18nService);
  private readonly accountsFacade = inject(AccountsListFacade);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(InvoiceDetailFacade);
  private readonly cardFacade = inject(CardDetailFacade);

  /** `:id` da rota: o cartão. */
  readonly id = input.required<string>();
  readonly invoiceId = input.required<string>();

  protected readonly state = this.facade.state;
  protected readonly invoice = this.facade.invoice;
  protected readonly card = this.cardFacade.card;
  protected readonly paying = signal(false);
  protected readonly accounts = signal<readonly Account[]>([]);
  protected readonly cashAccounts = computed(() =>
    this.accounts().filter(
      (account) => account.liquidity === 'CASH' && account.status === 'ACTIVE',
    ),
  );

  protected readonly heading = computed(() => {
    const invoice = this.invoice();
    return invoice
      ? interpolate(this.t().cards.invoice.heading, {
          month: formatCompetenceShort(invoice.referenceMonth, HTML_LANG[this.i18n.language()]),
        })
      : this.t().nav.cards;
  });
  protected readonly backLink = computed(() => ['/cards', this.id()]);
  protected readonly canPay = computed(() => {
    const status = this.invoice()?.status;
    return status !== undefined && status !== 'PAID' && status !== 'FUTURE';
  });
  /** Por que "Pagar" não está disponível (só `PAID` e `FUTURE`). */
  protected readonly payBlocked = computed(() => {
    const status = this.invoice()?.status;
    return status === 'PAID' || status === 'FUTURE'
      ? this.t().cards.invoice.payBlocked[status]
      : null;
  });
  protected readonly loadProblem = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly notFoundActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().cards.invoice.notFound.back,
      available: true,
      primary: true,
      link: `/cards/${this.id()}`,
    },
  ]);

  constructor() {
    effect(() => {
      const invoiceId = this.invoiceId();
      untracked(() => this.facade.load(invoiceId));
    });
    effect(() => {
      const id = this.id();
      untracked(() => this.cardFacade.loadCard(id));
    });
    this.accountsFacade
      .loadAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      // Sem a lista de contas, os pagamentos aparecem sem o nome da conta.
      .subscribe({ next: (accounts) => this.accounts.set(accounts), error: () => undefined });
  }

  protected openPay(): void {
    if (this.canPay()) this.paying.set(true);
  }

  protected closePay(): void {
    this.paying.set(false);
  }

  /** A fatura devolvida pelo pagamento é a fonte da verdade; o cartão (limite) é recarregado. */
  protected onPaid(invoice: Invoice): void {
    this.paying.set(false);
    this.facade.replace(invoice);
    this.cardFacade.loadCard(this.id(), true);
  }

  protected retry(): void {
    this.facade.load(this.invoiceId());
  }
}
