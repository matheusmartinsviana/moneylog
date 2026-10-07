import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type {
  TransactionInput,
  TransferInput,
} from '~/modules/transactions/core/types/transaction-input';
import { todayIso } from '~/util/date';

/**
 * Formulário de transferência (presentational): valor → de → para → data → descrição. A conta de
 * destino exclui a de origem e só mostra contas da mesma liquidez que ela (o backend continua sendo
 * quem recusa, `TRANSFER_ACROSS_LIQUIDITY`).
 */
@Component({
  selector: 'app-transfer-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    DatePickerComponent,
    FormActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer-form.component.html',
  styleUrl: '../entry-form.css',
})
export class TransferFormComponent extends TransactionFormBase {
  readonly accounts = input.required<readonly Account[]>();
  readonly initial = input<TransferInput | null>(null);
  readonly defaultAccountId = input<string | null>(null);

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    fromAccountId: new FormControl<string | null>(null),
    toAccountId: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
  });

  private readonly fromId = toSignal(this.form.controls.fromAccountId.valueChanges, {
    initialValue: this.form.controls.fromAccountId.value,
  });

  protected readonly fromOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly toOptions = computed<readonly ChoiceOption[]>(() => {
    const from = this.accounts().find((account) => account.id === this.fromId());
    return this.accounts()
      .filter(
        (account) => !from || (account.id !== from.id && account.liquidity === from.liquidity),
      )
      .map((account) => ({ value: account.id, label: account.name }));
  });

  constructor() {
    super();
    // Trocar a origem descarta um destino que deixou de servir.
    this.form.controls.fromAccountId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const to = this.form.controls.toAccountId.value;
      if (to !== null && !this.toOptions().some((option) => option.value === to)) {
        this.form.controls.toAccountId.setValue(null);
      }
    });
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.fromAccountId;
        if (accountId && control.value === null && this.initial() === null) {
          control.setValue(accountId);
        }
      });
    });
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      untracked(() =>
        this.form.setValue({
          amount: initial.amount,
          fromAccountId: initial.fromAccountId,
          toAccountId: initial.toAccountId,
          date: initial.date,
          description: initial.description,
        }),
      );
    });
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    return {
      type: 'TRANSFER',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim(),
      notes: this.initial()?.notes ?? null,
      fromAccountId: value.fromAccountId ?? '',
      toAccountId: value.toAccountId ?? '',
    };
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
  }
}
