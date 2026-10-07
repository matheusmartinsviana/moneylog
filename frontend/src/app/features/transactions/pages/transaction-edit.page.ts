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
import { Router } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { ToastService } from '~/app/common/services/toast.service';
import { AdjustmentFormComponent } from '~/app/features/quick-add/components/adjustment-form/adjustment-form.component';
import { CardPurchaseFormComponent } from '~/app/features/quick-add/components/card-purchase-form/card-purchase-form.component';
import { CashEntryFormComponent } from '~/app/features/quick-add/components/cash-entry-form/cash-entry-form.component';
import { InvestmentFormComponent } from '~/app/features/quick-add/components/investment-form/investment-form.component';
import {
  RefundFormComponent,
  RefundOrigin,
} from '~/app/features/quick-add/components/refund-form/refund-form.component';
import { TransferFormComponent } from '~/app/features/quick-add/components/transfer-form/transfer-form.component';
import { FormOptions, loadFormOptions } from '~/app/features/quick-add/form-options';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import { RefundOriginSearchFacade } from '~/modules/transactions/core/facades/refund-origin-search.facade';
import { TransactionDetailFacade } from '~/modules/transactions/core/facades/transaction-detail.facade';
import { TransactionFormFacade } from '~/modules/transactions/core/facades/transaction-form.facade';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import type {
  AdjustmentInput,
  CardPurchaseInput,
  ExpenseInput,
  IncomeInput,
  InvestmentInput,
  RefundInput,
  TransactionInput,
  TransferInput,
} from '~/modules/transactions/core/types/transaction-input';
import { Problem, problemOf } from '~/util/api/problem';

/**
 * Edição (`/transactions/:id/edit`, smart): reaproveita os formulários apresentacionais do
 * `/quick-add`, preenchidos pelo mapa de S-90 (`formValue`, montado pela infra). O `PUT` leva a
 * `version`; `409 VERSION_CONFLICT` avisa e recarrega a versão mais recente; os erros de regra
 * (`REFUND_CATEGORY_LOCKED`, `REFUND_EXCEEDS_ORIGINAL`, S-81) vão para o campo, sem perder o digitado.
 * Sem `editable`, o formulário nem aparece (S-88). Na compra no cartão (S-121) só descrição, categoria e
 * observação mudam; valor, data, cartão e parcelas ficam em leitura, com a dica de como corrigir.
 */
@Component({
  selector: 'app-transaction-edit-page',
  imports: [
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    CashEntryFormComponent,
    TransferFormComponent,
    InvestmentFormComponent,
    AdjustmentFormComponent,
    RefundFormComponent,
    CardPurchaseFormComponent,
  ],
  providers: [
    TransactionDetailFacade,
    TransactionFormFacade,
    AccountsListFacade,
    RefundOriginSearchFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transaction-edit.page.html',
})
export class TransactionEditPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly accountsFacade = inject(AccountsListFacade);
  private readonly categoriesFacade = inject(CategoriesFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly detail = inject(TransactionDetailFacade);
  protected readonly form = inject(TransactionFormFacade);
  protected readonly originSearch = inject(RefundOriginSearchFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();

  /** A última versão carregada: fica na tela enquanto uma recarga (depois de um 409) acontece. */
  protected readonly transaction = signal<Transaction | null>(null);
  protected readonly options = signal<FormOptions | null>(null);
  protected readonly optionsProblem = signal<Problem | null>(null);

  protected readonly loadProblem = computed(() => {
    const state = this.detail.state();
    return state.status === 'error' ? state.problem : this.optionsProblem();
  });
  protected readonly notFound = computed(() => this.detail.state().status === 'notFound');
  protected readonly editable = computed(() => {
    const tx = this.transaction();
    return tx !== null && tx.status === 'ACTIVE' && tx.editable && tx.formValue !== null;
  });
  protected readonly backLink = computed(() => `/transactions/${this.id()}`);
  protected readonly backActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().transactions.detail.notFound.back,
      available: true,
      primary: true,
      link: '/transactions',
    },
  ]);

  protected readonly cashAccounts = computed(
    () => this.options()?.accounts.filter((account) => account.liquidity === 'CASH') ?? [],
  );
  protected readonly cashInitial = computed<ExpenseInput | IncomeInput | null>(() => {
    const value = this.transaction()?.formValue;
    return value?.type === 'EXPENSE' || value?.type === 'INCOME' ? value : null;
  });
  protected readonly transferInitial = computed<TransferInput | null>(() => {
    const value = this.transaction()?.formValue;
    return value?.type === 'TRANSFER' ? value : null;
  });

  protected readonly investmentAccounts = computed(
    () => this.options()?.accounts.filter((account) => account.liquidity === 'INVESTMENT') ?? [],
  );
  protected readonly investmentInitial = computed<InvestmentInput | null>(() => {
    const value = this.transaction()?.formValue;
    return value?.type === 'INVESTMENT' ? value : null;
  });
  protected readonly adjustmentInitial = computed<AdjustmentInput | null>(() => {
    const value = this.transaction()?.formValue;
    return value?.type === 'ADJUSTMENT' ? value : null;
  });
  protected readonly refundInitial = computed<RefundInput | null>(() => {
    const value = this.transaction()?.formValue;
    return value?.type === 'REFUND' ? value : null;
  });
  protected readonly cardPurchaseInitial = computed<CardPurchaseInput | null>(() => {
    const value = this.transaction()?.formValue;
    return value?.type === 'CARD_PURCHASE' ? value : null;
  });
  protected readonly refundOrigin = computed<RefundOrigin | null>(
    () => this.transaction()?.refundOf ?? null,
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.detail.load(id));
    });
    effect(() => {
      const tx = this.detail.transaction();
      if (tx) untracked(() => this.transaction.set(tx));
    });
    // 409: a versão do servidor é a que vale; recarrega e o formulário é preenchido de novo.
    effect(() => {
      if (this.form.problem()?.code === 'VERSION_CONFLICT') {
        untracked(() => this.detail.load(this.id()));
      }
    });
    this.form.saved$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.toast.show(this.t().transactions.detail.editPage.toast);
      void this.router.navigate(['/transactions', this.id()], { queryParamsHandling: 'preserve' });
    });
    this.loadOptions();
  }

  protected loadOptions(): void {
    this.optionsProblem.set(null);
    loadFormOptions(this.accountsFacade, this.categoriesFacade)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => this.options.set(options),
        error: (error: unknown) => this.optionsProblem.set(problemOf(error)),
      });
  }

  protected retry(): void {
    this.detail.load(this.id());
    if (this.options() === null) this.loadOptions();
  }

  protected submit(input: TransactionInput): void {
    const tx = this.transaction();
    if (!tx) return;
    this.form.submit({ kind: 'update', id: tx.id, input, version: tx.version });
  }
}
