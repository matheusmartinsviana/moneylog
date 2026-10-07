import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, startWith } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { interpolate } from '~/app/common/i18n/interpolate';
import { PersonFieldComponent } from '~/app/features/people/components/person-field/person-field.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type { Category } from '~/modules/categories/core/types/category';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import { todayIso } from '~/util/date';
import type { PersonRef } from '~/util/debt';

export type CaptureType = 'EXPENSE' | 'INCOME';
/** O que o cartão registra: despesa, receita ou dinheiro emprestado a uma pessoa. */
type FormType = CaptureType | 'LOAN';

/**
 * Formulário do Quick Capture (presentational, sem IA): valor, descrição e Salvar sempre visíveis; tipo,
 * categoria, conta e data aparecem quando o cartão expande. Nada é interpretado: o texto da descrição nunca
 * preenche o valor nem sugere categoria. Reaproveita a base dos formulários de movimentação (erro do backend
 * no campo certo, foco no valor, limpar depois de salvar).
 */
@Component({
  selector: 'app-quick-capture-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    DatePickerComponent,
    SegmentedControlComponent,
    PersonFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quick-capture-form.component.html',
  styleUrl: './quick-capture-form.component.css',
})
export class QuickCaptureFormComponent extends TransactionFormBase {
  /** Pedido de tipo (a ação rápida do cabeçalho ou `?mode=`): cada pedido novo troca o tipo. */
  readonly request = input<{ readonly type: CaptureType; readonly n: number }>({
    type: 'EXPENSE',
    n: 0,
  });
  readonly accounts = input.required<readonly Account[]>();
  readonly expenseCategories = input.required<readonly Category[]>();
  readonly incomeCategories = input.required<readonly Category[]>();
  readonly defaultAccountId = input<string | null>(null);
  /** Data padrão: a do backend (`summary.asOf`); sem ela, hoje no calendário local. */
  readonly defaultDate = input<string | null>(null);
  readonly people = input<readonly PersonRef[]>([]);
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  /** Escolheu "Emprestei": quem hospeda carrega as pessoas se ainda não tem. */
  readonly peopleNeeded = output<void>();
  readonly expanded = input(false);
  readonly expand = output<void>();

  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    type: new FormControl<string | null>('EXPENSE'),
    amount: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    categoryId: new FormControl<string | null>(null),
    personId: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>(null, [Validators.required]),
    date: new FormControl<string | null>(todayIso()),
  });

  private readonly values = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );
  protected readonly type = computed<FormType>(() => {
    const type = this.values().type;
    return type === 'INCOME' || type === 'LOAN' ? type : 'EXPENSE';
  });
  protected readonly loaning = computed(() => this.type() === 'LOAN');

  protected readonly typeOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'EXPENSE', label: this.t().dashboard.quickCapture.expense },
    { value: 'INCOME', label: this.t().dashboard.quickCapture.income },
    { value: 'LOAN', label: this.t().dashboard.quickCapture.loan },
  ]);
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly categoryOptions = computed<readonly ChoiceOption[]>(() =>
    (this.type() === 'INCOME' ? this.incomeCategories() : this.expenseCategories()).map(
      (category) => ({ value: category.id, label: category.name }),
    ),
  );

  /** "Mais opções" leva ao `/quick-add` completo com o que já foi digitado (valor e texto, nada sensível). */
  protected readonly moreParams = computed(() => {
    const value = this.values();
    const params: Record<string, string> = {
      mode: { INCOME: 'income', LOAN: 'loan', EXPENSE: 'expense' }[this.type()],
    };
    if (this.type() === 'LOAN') {
      const { personId, date } = this.values();
      if (personId) params['personId'] = personId;
      if (date) params['date'] = date;
    }
    const amount = (value.amount ?? '').trim();
    if (/^\d+(\.\d{1,2})?$/.test(amount)) params['amount'] = amount;
    const description = (value.description ?? '').trim();
    if (description !== '') params['description'] = description.slice(0, 200);
    return params;
  });

  constructor() {
    super();
    effect(() => {
      const { type } = this.request();
      untracked(() => this.form.controls.type.setValue(type));
    });
    effect(() => {
      const date = this.defaultDate();
      if (date) untracked(() => this.form.controls.date.setValue(date));
    });
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.accountId;
        if (accountId && control.value === null) control.setValue(accountId);
      });
    });
    // Trocou receita por despesa (ou o contrário): a categoria escolhida deixa de valer.
    this.form.controls.type.valueChanges.subscribe((type) => {
      const { categoryId, personId } = this.form.controls;
      const loan = type === 'LOAN';
      categoryId.reset(null);
      personId.reset(null);
      // Emprestei pede a pessoa; categoria e descrição são opcionais (vazio = omitido no envio).
      personId.setValidators(loan ? [Validators.required] : []);
      personId.updateValueAndValidity();
      if (loan) this.peopleNeeded.emit();
    });
  }

  protected override onSubmit(): void {
    this.expand.emit();
    super.onSubmit();
    if (this.form.invalid) {
      // Primeiro campo com erro (a categoria, p. ex.) recebe o foco: nada é enviado nem sugerido.
      queueMicrotask(() => this.focusFirstInvalid());
    }
  }

  private focusFirstInvalid(): void {
    this.root.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    if (this.type() === 'LOAN') {
      const name = this.people().find((person) => person.id === value.personId)?.name ?? '';
      return {
        type: 'LOAN_GIVEN',
        amount: value.amount ?? '',
        date: value.date ?? todayIso(),
        description: interpolate(this.t().lending.loan.defaultDescription, { name }),
        notes: null,
        accountId: value.accountId ?? '',
        newDebt: { personId: value.personId ?? '', expectedDate: null, description: null },
      };
    }
    return {
      type: this.type() as CaptureType,
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim(),
      notes: null,
      accountId: value.accountId ?? '',
      categoryId: value.categoryId ?? '',
    } as TransactionInput;
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
    this.form.controls.categoryId.reset(null);
    this.form.controls.personId.reset(null);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
