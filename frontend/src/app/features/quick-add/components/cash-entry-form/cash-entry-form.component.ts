import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, startWith } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { interpolate } from '~/app/common/i18n/interpolate';
import { PersonFieldComponent } from '~/app/features/people/components/person-field/person-field.component';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import {
  newShareGroup,
  ShareGroup,
  SharesFieldComponent,
} from '~/app/features/quick-add/components/shares-field/shares-field.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type { Category } from '~/modules/categories/core/types/category';
import {
  PAYMENT_METHODS,
  PaymentMethod,
} from '~/modules/transactions/core/types/transaction-enums';
import type {
  ExpenseInput,
  IncomeInput,
  TransactionInput,
} from '~/modules/transactions/core/types/transaction-input';
import { todayIso } from '~/util/date';
import type { PersonRef } from '~/util/debt';

/**
 * Formulário de despesa e de receita (presentational): valor → descrição → categoria → conta → data
 * (→ método, quando o modo não o fixa: Pix e Débito fixam). `accounts` já chega só com contas `CASH`
 * ativas e `categories` só com as do `kind` do tipo (A19, S-91); quem usa decide. Serve ao
 * `/quick-add` e à edição (`initial`).
 */
@Component({
  selector: 'app-cash-entry-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    DatePickerComponent,
    SwitchComponent,
    SharesFieldComponent,
    FormActionsComponent,
    PersonFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cash-entry-form.component.html',
  styleUrl: '../entry-form.css',
})
export class CashEntryFormComponent extends TransactionFormBase {
  readonly type = input.required<'EXPENSE' | 'INCOME'>();
  readonly accounts = input.required<readonly Account[]>();
  readonly categories = input.required<readonly Category[]>();
  /** Método fixo do modo (Pix, Débito); `null` mostra o seletor. */
  readonly fixedMethod = input<PaymentMethod | null>(null);
  readonly initial = input<ExpenseInput | IncomeInput | null>(null);
  readonly defaultAccountId = input<string | null>(null);
  /** Valor e descrição que vieram do Quick Capture do Início (`/quick-add?amount=&description=`), só na criação. */
  readonly prefill = input<{
    amount: string | null;
    description: string | null;
    date?: string | null;
  } | null>(null);
  /** "Dividir com alguém" só na criação de uma despesa (T86): as partes não se editam depois (S-137). */
  readonly allowSplit = input(false);
  readonly people = input<readonly PersonRef[]>([]);
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  /** O usuário ligou "Dividir com alguém": quem usa carrega as pessoas se ainda não tem. */
  readonly peopleNeeded = output<void>();

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(200)],
    }),
    categoryId: new FormControl<string | null>(null),
    personId: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    method: new FormControl<string | null>(null),
    shares: new FormArray<ShareGroup>([]),
  });
  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(null)), {
    initialValue: null,
  });
  /** Pix novo: o interruptor "É um empréstimo para uma pessoa" grava `LOAN_GIVEN` no lugar do Pix. */
  protected readonly showLoanSwitch = computed(
    () => this.fixedMethod() === 'PIX' && this.initial() === null && this.type() === 'EXPENSE',
  );
  protected readonly loan = new FormControl(false, { nonNullable: true });
  private readonly loanOn = toSignal(this.loan.valueChanges.pipe(startWith(false)), {
    initialValue: false,
  });
  protected readonly loaning = computed(() => this.showLoanSwitch() && this.loanOn());
  protected readonly split = new FormControl(false, { nonNullable: true });
  private readonly splitOn = toSignal(this.split.valueChanges.pipe(startWith(false)), {
    initialValue: false,
  });
  protected readonly showSplit = computed(
    () =>
      this.allowSplit() && this.type() === 'EXPENSE' && this.initial() === null && !this.loaning(),
  );
  protected readonly splitting = computed(() => this.showSplit() && this.splitOn());

  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly categoryOptions = computed<readonly ChoiceOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly methodOptions = computed<readonly ChoiceOption[]>(() =>
    PAYMENT_METHODS.map((method) => ({
      value: method,
      label: this.t().transactions.methods[method],
    })),
  );

  constructor() {
    super();
    // Conta padrão (a última usada ou a única compatível), só enquanto o campo está vazio.
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.accountId;
        if (accountId && control.value === null && this.initial() === null) {
          control.setValue(accountId);
        }
      });
    });
    // Ligou o empréstimo: pede as pessoas; a pessoa passa a ser obrigatória e a descrição, opcional.
    this.loan.valueChanges.subscribe((on) => {
      const { personId, description, categoryId } = this.form.controls;
      if (on) {
        this.peopleNeeded.emit();
        this.split.setValue(false);
        categoryId.reset(null);
        // A categoria não se aplica ao empréstimo (o campo some): desabilitada, não bloqueia o salvar.
        categoryId.disable({ emitEvent: false });
      } else {
        personId.reset(null);
        categoryId.enable({ emitEvent: false });
      }
      personId.setValidators(on ? [Validators.required] : []);
      description.setValidators(
        on ? [Validators.maxLength(200)] : [requiredTrimmed, Validators.maxLength(200)],
      );
      personId.updateValueAndValidity();
      description.updateValueAndValidity();
    });
    // Ligou a divisão: pede as pessoas e abre a primeira parte; desligou: descarta as partes.
    this.split.valueChanges.subscribe((on) => {
      const shares = this.form.controls.shares;
      if (on) {
        this.peopleNeeded.emit();
        if (shares.length === 0) shares.push(newShareGroup());
      } else {
        shares.clear();
      }
    });
    // Pré-preenchimento vindo do Quick Capture: só campos vazios, e nunca na edição.
    effect(() => {
      const prefill = this.prefill();
      if (!prefill || this.initial() !== null) return;
      untracked(() => {
        const { amount, description } = this.form.controls;
        if (prefill.amount && amount.value === null) amount.setValue(prefill.amount);
        if (prefill.description && description.value === '')
          description.setValue(prefill.description);
      });
    });
    // Edição: o valor inicial (e cada versão nova, depois de um conflito) repõe o formulário.
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      untracked(() =>
        this.form.patchValue({
          amount: initial.amount,
          description: initial.description,
          categoryId: initial.categoryId,
          accountId: initial.accountId,
          date: initial.date,
          method: initial.method,
        }),
      );
    });
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    // A divisão leva só o que foi digitado: quanto cada pessoa deve (nada é calculado, S-137).
    const shares = this.splitting()
      ? value.shares.map((share) => ({
          amount: share.amount ?? '',
          newDebt: { personId: share.personId ?? '', expectedDate: null, description: null },
        }))
      : [];
    if (this.loaning()) {
      const name = this.people().find((person) => person.id === value.personId)?.name ?? '';
      return {
        type: 'LOAN_GIVEN',
        amount: value.amount ?? '',
        date: value.date ?? todayIso(),
        description:
          value.description.trim() ||
          interpolate(this.t().lending.loan.defaultDescription, { name }),
        notes: null,
        accountId: value.accountId ?? '',
        newDebt: { personId: value.personId ?? '', expectedDate: null, description: null },
      };
    }
    return {
      type: this.type(),
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim(),
      notes: this.initial()?.notes ?? null,
      accountId: value.accountId ?? '',
      categoryId: value.categoryId ?? '',
      method: (this.fixedMethod() ?? value.method ?? 'OTHER') as PaymentMethod,
      ...(shares.length > 0 && this.type() === 'EXPENSE' ? { shares } : {}),
    } as TransactionInput;
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
    this.split.setValue(false);
    this.loan.setValue(false);
  }
}
