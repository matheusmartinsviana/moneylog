import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { interpolate } from '~/app/common/i18n/interpolate';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type { InvestmentDirection } from '~/modules/transactions/core/types/transaction-enums';
import type {
  InvestmentInput,
  TransactionInput,
} from '~/modules/transactions/core/types/transaction-input';
import { todayIso } from '~/util/date';

/**
 * Formulário de aplicação e resgate (presentational): valor → conta (só `CASH`) → conta de
 * investimento (só `INVESTMENT`) → operação → data (→ descrição opcional). As duas listas já chegam
 * filtradas por quem usa (A19, S-91); o backend continua recusando contas trocadas
 * (`INVESTMENT_ACCOUNTS_MISMATCH`). Serve ao `/quick-add` e à edição.
 */
@Component({
  selector: 'app-investment-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    SegmentedControlComponent,
    DatePickerComponent,
    FormActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './investment-form.component.html',
  styleUrl: '../entry-form.css',
})
export class InvestmentFormComponent extends TransactionFormBase {
  readonly cashAccounts = input.required<readonly Account[]>();
  readonly investmentAccounts = input.required<readonly Account[]>();
  readonly initial = input<InvestmentInput | null>(null);
  readonly defaultCashAccountId = input<string | null>(null);
  readonly defaultInvestmentAccountId = input<string | null>(null);

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    cashAccountId: new FormControl<string | null>(null),
    investmentAccountId: new FormControl<string | null>(null),
    direction: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
  });

  protected readonly cashOptions = computed<readonly ChoiceOption[]>(() =>
    this.cashAccounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly investmentOptions = computed<readonly ChoiceOption[]>(() =>
    this.investmentAccounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly directionOptions = computed<readonly ChoiceOption[]>(() => {
    const labels = this.t().transactions.directions;
    return [
      { value: 'CONTRIBUTION', label: labels.CONTRIBUTION },
      { value: 'REDEMPTION', label: labels.REDEMPTION },
    ];
  });
  /** Descrição usada quando o campo fica vazio: o nome da operação. */
  protected readonly defaultDescription = computed(() => {
    const direction = this.form.controls.direction.value as InvestmentDirection | null;
    return this.t().transactions.directions[direction ?? 'CONTRIBUTION'];
  });
  protected readonly descriptionHint = computed(() =>
    interpolate(this.t().entryForm.descriptionHint, { default: this.defaultDescription() }),
  );

  constructor() {
    super();
    effect(() => {
      const cash = this.defaultCashAccountId();
      const investment = this.defaultInvestmentAccountId();
      untracked(() => {
        if (this.initial() !== null) return;
        const { cashAccountId, investmentAccountId } = this.form.controls;
        if (cash && cashAccountId.value === null) cashAccountId.setValue(cash);
        if (investment && investmentAccountId.value === null) {
          investmentAccountId.setValue(investment);
        }
      });
    });
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      untracked(() =>
        this.form.setValue({
          amount: initial.amount,
          cashAccountId: initial.cashAccountId,
          investmentAccountId: initial.investmentAccountId,
          direction: initial.direction,
          date: initial.date,
          description: initial.description,
        }),
      );
    });
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    const direction = (value.direction ?? 'CONTRIBUTION') as InvestmentDirection;
    return {
      type: 'INVESTMENT',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim() || this.t().transactions.directions[direction],
      notes: this.initial()?.notes ?? null,
      cashAccountId: value.cashAccountId ?? '',
      investmentAccountId: value.investmentAccountId ?? '',
      direction,
    };
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
  }
}
