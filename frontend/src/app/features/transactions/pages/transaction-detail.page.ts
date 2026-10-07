import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { ToastService } from '~/app/common/services/toast.service';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { CancelInstallmentsActionComponent } from '~/app/features/transactions/components/cancel-installments-action/cancel-installments-action.component';
import { ImpactPanelComponent } from '~/app/features/transactions/components/impact-panel/impact-panel.component';
import { InstallmentsListComponent } from '~/app/features/transactions/components/installments-list/installments-list.component';
import { VoidActionComponent } from '~/app/features/transactions/components/void-action/void-action.component';
import { flowOf, flowSign } from '~/app/features/transactions/transaction-flow';
import { TransactionDetailFacade } from '~/modules/transactions/core/facades/transaction-detail.facade';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { formatCompetenceShort, formatInstant, formatIsoDate } from '~/util/date';
import { formatMoney } from '~/util/money';

interface Field {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** Destino de um link (a despesa original de um reembolso, a fatura de um pagamento). */
  readonly link?: readonly string[];
  readonly linkCy?: string;
}

/**
 * Detalhe de uma movimentação (`/transactions/:id`, smart). Mostra os dados, o `impact` calculado
 * pelo backend e as ações de editar e estornar, que seguem as flags `editable`/`voidable` e
 * `voidBlockedBy` (S-88, S-89). No desktop (≥ 1280 px) abre como painel lateral sobre a lista; no
 * celular, como página. Esc fecha e devolve o foco à linha de onde veio. Na compra no cartão (T70), mostra
 * as parcelas (situação, fatura, lançamento tardio), bloqueia o estorno com a razão quando há parcela em
 * fatura fechada e oferece "Cancelar parcelas restantes"; no pagamento de fatura e no crédito, liga à fatura.
 */
@Component({
  selector: 'app-transaction-detail-page',
  imports: [
    LinkedNotesComponent,
    RouterLink,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    MoneyComponent,
    ImpactPanelComponent,
    InstallmentsListComponent,
    VoidActionComponent,
    CancelInstallmentsActionComponent,
  ],
  providers: [TransactionDetailFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  templateUrl: './transaction-detail.page.html',
  styleUrl: './transaction-detail.page.css',
})
export class TransactionDetailPage {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(TransactionDetailFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();

  protected readonly cancelDone = signal(0);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly state = this.facade.state;
  protected readonly transaction = this.facade.transaction;
  protected readonly loadProblem = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly notFoundActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().transactions.detail.notFound.back,
      available: true,
      primary: true,
      link: '/transactions',
    },
  ]);

  protected readonly amountSign = computed(() => {
    const tx = this.transaction();
    return tx ? flowSign(flowOf(tx, null)) : '';
  });
  protected readonly canEdit = computed(() => {
    const tx = this.transaction();
    return tx !== null && tx.status === 'ACTIVE' && tx.editable;
  });
  protected readonly voidedOn = computed(() => {
    const tx = this.transaction();
    if (!tx?.voidedAt) return null;
    return interpolate(this.t().transactions.detail.voided.on, {
      date: formatInstant(tx.voidedAt, HTML_LANG[this.i18n.language()]),
    });
  });
  protected readonly fields = computed<readonly Field[]>(() => {
    const tx = this.transaction();
    return tx ? this.fieldsOf(tx) : [];
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.load(id));
    });
    // Ao abrir (e a cada resposta nova: movimentação, não encontrada ou erro), o foco vai para o
    // título do painel.
    effect(() => {
      if (this.state().status !== 'loading' && this.state().status !== 'idle') {
        untracked(() =>
          afterNextRender(() => this.heading()?.nativeElement.focus(), {
            injector: this.injector,
          }),
        );
      }
    });
    this.facade.voided$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.toast.show(this.t().transactions.detail.void.toast);
    });
    this.facade.canceled$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cancelDone.update((value) => value + 1);
      this.toast.show(this.t().transactions.detail.cancel.toast);
    });
  }

  protected retry(): void {
    this.facade.load(this.id());
  }

  protected confirmVoid(reason: string): void {
    this.facade.voidTransaction(this.id(), reason);
  }

  protected confirmCancel(reason: string): void {
    this.facade.cancelInstallments(this.id(), reason);
  }

  /** Fecha o painel (ou volta à lista no celular) e devolve o foco à linha de origem. */
  protected close(): void {
    const id = this.id();
    void this.router
      .navigate(['/transactions'], { queryParamsHandling: 'preserve' })
      .then(() => this.focusRow(id));
  }

  private focusRow(id: string): void {
    const rows = this.document.querySelectorAll<HTMLElement>(
      `[data-cy="transaction-row-${id}"], [data-cy="transaction-item-${id}"]`,
    );
    const visible = Array.from(rows).find((row) => row.getClientRects().length > 0) ?? rows[0];
    visible?.focus();
  }

  private fieldsOf(tx: Transaction): readonly Field[] {
    const labels = this.t().transactions;
    const copy = labels.detail.fields;
    const locale = HTML_LANG[this.i18n.language()];
    const fields: Field[] = [
      { key: 'type', label: copy.type, text: labels.types[tx.type] },
      { key: 'date', label: copy.date, text: formatIsoDate(tx.date, locale, 'long') },
    ];
    if (tx.category) fields.push({ key: 'category', label: copy.category, text: tx.category.name });
    if (tx.card) fields.push({ key: 'card', label: copy.card, text: tx.card.name });
    if (tx.card && tx.invoice) {
      const locale = HTML_LANG[this.i18n.language()];
      fields.push({
        key: 'invoice',
        label: copy.invoice,
        text: interpolate(labels.detail.installments.invoice, {
          month: formatCompetenceShort(tx.invoice.referenceMonth, locale),
          date: formatIsoDate(tx.invoice.dueDate, locale),
        }),
        link: ['/cards', tx.card.id, 'invoices', tx.invoice.id],
        linkCy: 'detail-invoice-link',
      });
    }
    if (tx.account) {
      fields.push({
        key: 'account',
        label: tx.type === 'TRANSFER' ? copy.accountFrom : copy.account,
        text: tx.account.name,
      });
    }
    if (tx.counterpartAccount) {
      fields.push({
        key: 'counterpart',
        label: tx.type === 'INVESTMENT' ? copy.counterpartInvestment : copy.counterpartTo,
        text: tx.counterpartAccount.name,
      });
    }
    if (tx.method)
      fields.push({ key: 'method', label: copy.method, text: labels.methods[tx.method] });
    if (tx.direction) {
      fields.push({
        key: 'direction',
        label: copy.direction,
        text: labels.directions[tx.direction],
      });
    }
    if (tx.adjustmentKind) {
      fields.push({
        key: 'adjustment-kind',
        label: copy.adjustmentKind,
        text: labels.adjustmentKinds[tx.adjustmentKind],
      });
    }
    if (tx.reason) fields.push({ key: 'reason', label: copy.reason, text: tx.reason });
    if (tx.refundOf) {
      fields.push({
        key: 'refund-of',
        label: copy.refundOf,
        text: tx.refundOf.description,
        link: ['/transactions', tx.refundOf.id],
        linkCy: 'detail-refund-link',
      });
    }
    if (tx.notes) fields.push({ key: 'notes', label: copy.notes, text: tx.notes });
    // Dívida da movimentação (emprestar, receber, pagar) e partes de uma despesa dividida: do backend.
    if (tx.debt) {
      fields.push({
        key: 'debt',
        label: copy.debt,
        text: `${tx.debt.person.name} · ${tx.debt.description ?? labels.types[tx.type]}`,
        link: ['/debts', tx.debt.id],
        linkCy: 'detail-debt-link',
      });
    }
    for (const share of tx.shares) {
      fields.push({
        key: `share-${share.id}`,
        label: interpolate(copy.share, { name: share.person.name }),
        text: formatMoney(share.principal),
        link: ['/debts', share.id],
        linkCy: `detail-share-link-${share.id}`,
      });
    }
    if (tx.source === 'RECURRENCE' && tx.occurrenceDate) {
      fields.push({
        key: 'recurrence',
        label: copy.recurrence,
        text: interpolate(copy.recurrenceOccurrence, {
          date: formatIsoDate(tx.occurrenceDate, locale),
        }),
        link: ['/planning/recurrences'],
        linkCy: 'detail-recurrence-link',
      });
    }
    return fields;
  }
}
