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

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import {
  DebtEdit,
  DebtEditSheetComponent,
} from '~/app/features/debts/components/debt-edit-sheet/debt-edit-sheet.component';
import { SettleSheetComponent } from '~/app/features/debts/components/settle-sheet/settle-sheet.component';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { DebtDetailFacade } from '~/modules/debts/core/facades/debt-detail.facade';
import { TransactionDetailFacade } from '~/modules/transactions/core/facades/transaction-detail.facade';
import { formatIsoDate } from '~/util/date';
import { isOpenStatus } from '~/util/debt';

type Dialog = 'forgive' | 'void' | null;

/**
 * Detalhe da dívida (smart, T85): principal, quitado e o que falta (os do backend), status em texto e as
 * quitações com a opção de estornar cada uma. Ações: quitar (devolução recebida ou pagamento), perdoar o
 * restante (motivo obrigatório, não pode ser desfeito), estornar o registro (só dívida sem movimentação e
 * sem quitações: com `voidBlockedBy` a ação fica desabilitada com a explicação e o caminho) e editar a
 * descrição e a previsão. Nenhum valor é calculado aqui; depois de cada ação a dívida vem do backend.
 */
@Component({
  selector: 'app-debt-page',
  imports: [
    LinkedNotesComponent,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    MoneyComponent,
    SettleSheetComponent,
    DebtEditSheetComponent,
  ],
  providers: [DebtDetailFacade, AccountsListFacade, TransactionDetailFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './debt.page.html',
  styleUrl: './debt.page.css',
})
export class DebtPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly accountsFacade = inject(AccountsListFacade);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(DebtDetailFacade);
  protected readonly transactions = inject(TransactionDetailFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();

  protected readonly debt = this.facade.debt;
  protected readonly state = this.facade.state;
  protected readonly settling = signal(false);
  protected readonly editing = signal(false);
  protected readonly dialog = signal<Dialog>(null);
  /** Quitação em estorno (a movimentação dela). */
  protected readonly reversing = signal<string | null>(null);
  private readonly accounts = signal<readonly Account[]>([]);

  protected readonly cashAccounts = computed(() =>
    this.accounts().filter((account) => account.liquidity === 'CASH'),
  );
  protected readonly isOpen = computed(() => {
    const debt = this.debt();
    return debt !== null && isOpenStatus(debt.status);
  });
  protected readonly closed = computed(() => {
    const debt = this.debt();
    return debt !== null && !isOpenStatus(debt.status) && debt.status !== 'SETTLED';
  });
  protected readonly title = computed(() => {
    const debt = this.debt();
    if (!debt) return this.t().nav.people;
    const copy = this.t().debts.row;
    return (
      debt.description ??
      (debt.direction === 'RECEIVABLE' ? copy.defaultTitleReceivable : copy.defaultTitlePayable)
    );
  });
  protected readonly settleLabel = computed(() =>
    this.debt()?.direction === 'RECEIVABLE'
      ? this.t().debts.detail.actions.settleReceivable
      : this.t().debts.detail.actions.settlePayable,
  );
  protected readonly dates = computed(() => {
    const debt = this.debt();
    const locale = HTML_LANG[this.i18n.language()];
    return {
      date: debt ? formatIsoDate(debt.date, locale, 'long') : '',
      expected: debt?.expectedDate ? formatIsoDate(debt.expectedDate, locale, 'long') : null,
      closure: debt?.closureDate
        ? interpolate(this.t().debts.detail.closedOn, {
            date: formatIsoDate(debt.closureDate, locale, 'long'),
          })
        : null,
    };
  });
  protected formatDate(date: string): string {
    return formatIsoDate(date, HTML_LANG[this.i18n.language()]);
  }

  protected readonly voidBlocked = computed(() => {
    const debt = this.debt();
    return debt && !debt.voidable && debt.voidBlockedBy
      ? this.t().debts.detail.voidBlocked[debt.voidBlockedBy]
      : null;
  });
  protected readonly actionError = computed(() => {
    const problem = this.facade.problem();
    return problem && !this.editing() ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly reverseError = computed(() => {
    const problem = this.transactions.voidProblem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly editProblem = computed(() => (this.editing() ? this.facade.problem() : null));

  protected readonly notFoundActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().debts.detail.notFound.back,
      available: true,
      primary: true,
      link: '/people',
    },
  ]);
  protected readonly loadProblem = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.load(id));
    });
    this.accountsFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      // Sem a lista de contas a quitação mostra "cadastre uma conta"; o resto da tela segue.
      .subscribe({ next: (accounts) => this.accounts.set(accounts), error: () => undefined });
    this.facade.done$.pipe(takeUntilDestroyed()).subscribe(({ action }) => {
      this.dialog.set(null);
      this.editing.set(false);
      const copy = this.t().debts;
      this.toast.show(
        action === 'cancel'
          ? copy.forgive.toast
          : action === 'void'
            ? copy.void.toast
            : copy.edit.toast,
      );
    });
    this.transactions.voided$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.reversing.set(null);
      this.toast.show(this.t().debts.detail.settlements.reverseToast);
      this.facade.refresh(this.id());
    });
    // Falha ao estornar a quitação: fecha o diálogo e mostra o motivo; o estado real vem do backend.
    effect(() => {
      if (this.transactions.voidProblem()) {
        untracked(() => {
          this.reversing.set(null);
          this.facade.refresh(this.id());
        });
      }
    });
  }

  protected openSettle(): void {
    this.settling.set(true);
  }

  protected afterSettled(): void {
    this.settling.set(false);
    this.facade.refresh(this.id());
  }

  protected openDialog(kind: 'forgive' | 'void'): void {
    this.facade.clearProblem();
    this.dialog.set(kind);
  }

  protected confirmDialog(reason: string): void {
    const debt = this.debt();
    if (!debt) return;
    if (this.dialog() === 'forgive') this.facade.cancel(debt.id, reason);
    else if (this.dialog() === 'void') this.facade.void(debt.id, reason);
  }

  protected closeDialog(): void {
    if (!this.facade.busy()) this.dialog.set(null);
  }

  protected openEdit(): void {
    this.facade.clearProblem();
    this.editing.set(true);
  }

  protected saveEdit(edit: DebtEdit): void {
    const debt = this.debt();
    if (debt) this.facade.update(debt.id, { ...edit, version: debt.version });
  }

  protected askReverse(transactionId: string): void {
    this.reversing.set(transactionId);
  }

  protected confirmReverse(reason: string): void {
    const id = this.reversing();
    if (id) this.transactions.voidTransaction(id, reason);
  }

  protected retry(): void {
    this.facade.load(this.id());
  }
}
