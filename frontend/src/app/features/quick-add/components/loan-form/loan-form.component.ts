import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { valueSignal } from '~/app/common/forms/control-signal';
import { interpolate } from '~/app/common/i18n/interpolate';
import { PersonFieldComponent } from '~/app/features/people/components/person-field/person-field.component';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import { todayIso } from '~/util/date';
import type { PersonRef } from '~/util/debt';

/**
 * "Dinheiro emprestado" (presentational, T85): pessoa (existente ou nova, criada antes, S-138) → valor →
 * conta → data → previsão (opcional) → descrição. Emite um `LOAN_GIVEN` com `newDebt`: o dinheiro sai da
 * conta e vira uma dívida a receber, sem despesa. Nenhum valor é calculado aqui; o `impact` volta do backend.
 */
@Component({
  selector: 'app-loan-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    DatePickerComponent,
    PersonFieldComponent,
    FormActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loan-form.component.html',
  styleUrl: '../entry-form.css',
})
export class LoanFormComponent extends TransactionFormBase {
  readonly accounts = input.required<readonly Account[]>();
  readonly people = input.required<readonly PersonRef[]>();
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  readonly defaultAccountId = input<string | null>(null);
  /** `?personId=` da URL: a pessoa já escolhida (o botão "Emprestar" da tela dela). */
  readonly defaultPersonId = input<string | null>(null);

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    personId: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    expectedDate: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
  });

  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  private readonly personId = valueSignal(this.form.controls.personId);
  private readonly personName = computed(
    () => this.people().find((person) => person.id === this.personId())?.name ?? '',
  );

  constructor() {
    super();
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.accountId;
        if (accountId && control.value === null) control.setValue(accountId);
      });
    });
    effect(() => {
      const personId = this.defaultPersonId();
      const people = this.people();
      untracked(() => {
        const control = this.form.controls.personId;
        if (personId && control.value === null && people.some((p) => p.id === personId)) {
          control.setValue(personId);
        }
      });
    });
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    const fallback = interpolate(this.t().lending.loan.defaultDescription, {
      name: this.personName(),
    });
    return {
      type: 'LOAN_GIVEN',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim() || fallback,
      notes: null,
      accountId: value.accountId ?? '',
      newDebt: {
        personId: value.personId ?? '',
        expectedDate: value.expectedDate,
        description: null,
      },
    };
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
    this.form.controls.expectedDate.reset(null);
  }

  protected descriptionHint(): string {
    return interpolate(this.t().entryForm.descriptionHint, {
      default: interpolate(this.t().lending.loan.defaultDescription, {
        name: this.personName() || '…',
      }),
    });
  }
}
