import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { TRANSACTION_CODE_TO_FIELD } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type { Debt } from '~/modules/debts/core/types/debt';
import { TransactionFormFacade } from '~/modules/transactions/core/facades/transaction-form.facade';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { todayIso } from '~/util/date';
import { formatMoney, isPositive } from '~/util/money';

/** Códigos de regra que o backend atribui a um campo do formulário (além dos de movimentação). */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  ...TRANSACTION_CODE_TO_FIELD,
  ACCOUNT_ARCHIVED: 'accountId',
  ACCOUNT_NOT_FOUND: 'accountId',
  DEBT_DIRECTION_MISMATCH: 'amount',
  DEBT_CLOSED: 'amount',
  DEBT_ALREADY_SETTLED: 'amount',
};

/**
 * "Quitar" uma dívida (T85): devolução recebida (`MONEY_RECEIVED` com `debtId`, nunca receita) quando
 * "me devem" ou pagamento (`DEBT_PAYMENT`) quando "eu devo". O valor sugerido é o `outstanding` **do
 * backend**; um valor maior recebe o erro dele traduzido (`DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING`, S-143),
 * sem o front calcular nada. O envio leva `Idempotency-Key` por tentativa, reutilizada no "tentar de novo"
 * depois de falha de rede/5xx/`409 CONFLICT` e ao reabrir a folha com os mesmos dados; clique duplo = uma
 * requisição. Em sucesso emite a movimentação devolvida e quem usa recarrega a dívida do backend.
 */
@Component({
  selector: 'app-settle-sheet',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SheetComponent,
    SelectComponent,
    MoneyInputComponent,
    DatePickerComponent,
    TextFieldComponent,
  ],
  providers: [TransactionFormFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settle-sheet.component.html',
  styleUrl: './settle-sheet.component.css',
})
export class SettleSheetComponent {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(TransactionFormFacade);
  protected readonly currency = ACCOUNT_CURRENCY;

  readonly open = input.required<boolean>();
  /** A dívida a quitar: o `outstanding` dela é a sugestão de valor (vem do backend). */
  readonly debt = input.required<Debt>();
  /** Contas `CASH` ativas. */
  readonly accounts = input.required<readonly Account[]>();
  readonly defaultAccountId = input<string | null>(null);

  readonly closed = output<void>();
  readonly settled = output<Transaction>();

  protected readonly form = new FormGroup({
    accountId: new FormControl<string | null>(null),
    amount: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
  });

  protected readonly receivable = computed(() => this.debt().direction === 'RECEIVABLE');
  protected readonly heading = computed(() =>
    this.receivable() ? this.t().debts.settle.titleReceivable : this.t().debts.settle.titlePayable,
  );
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly amountHint = computed(() =>
    interpolate(this.t().debts.settle.amountHint, {
      amount: formatMoney(this.debt().outstanding),
    }),
  );
  private readonly defaultDescription = computed(() =>
    interpolate(
      this.receivable()
        ? this.t().debts.settle.defaultDescriptionReceivable
        : this.t().debts.settle.defaultDescriptionPayable,
      { name: this.debt().person.name },
    ),
  );

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    // Abriu: valor = `outstanding` do backend, data = hoje, conta = a padrão. Uma falha ambígua (resposta
    // perdida) continua pendente, com o "tentar de novo" e a mesma chave; qualquer outra é descartada.
    effect(() => {
      const open = this.open();
      const debt = this.debt();
      untracked(() => {
        if (!open) return;
        if (!this.facade.canRetry()) this.facade.dismissProblem();
        const suggested = isPositive(debt.outstanding) ? debt.outstanding.amount : null;
        this.form.reset({
          accountId: this.initialAccount(),
          amount: suggested,
          date: todayIso(),
          description: this.defaultDescription(),
        });
      });
    });
    // As contas podem chegar depois de a folha abrir (a tela as carrega à parte): se nenhuma conta foi
    // escolhida ainda, a padrão (ou a única) entra assim que a lista chega.
    effect(() => {
      this.accounts();
      untracked(() => {
        const control = this.form.controls.accountId;
        if (!this.open() || control.value !== null) return;
        const initial = this.initialAccount();
        if (initial !== null) control.setValue(initial);
      });
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((transaction) => {
      this.toast.show(
        this.receivable()
          ? this.t().debts.settle.toastReceivable
          : this.t().debts.settle.toastPayable,
      );
      this.settled.emit(transaction);
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const debt = this.debt();
    const value = this.form.getRawValue();
    const base = {
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim() || this.defaultDescription(),
      notes: null,
      accountId: value.accountId ?? '',
    };
    this.facade.submit({
      kind: 'create',
      input:
        debt.direction === 'RECEIVABLE'
          ? { ...base, type: 'MONEY_RECEIVED', debtId: debt.id, newDebt: null }
          : { ...base, type: 'DEBT_PAYMENT', debtId: debt.id },
    });
  }

  protected close(): void {
    if (!this.facade.saving()) this.closed.emit();
  }

  private initialAccount(): string | null {
    const preferred = this.defaultAccountId();
    const accounts = this.accounts();
    if (preferred && accounts.some((account) => account.id === preferred)) return preferred;
    return accounts.length === 1 ? (accounts[0]?.id ?? null) : null;
  }
}
