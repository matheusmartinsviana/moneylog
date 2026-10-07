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
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { interpolate } from '~/app/common/i18n/interpolate';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type {
  AdjustmentDirection,
  AdjustmentKind,
} from '~/modules/transactions/core/types/transaction-enums';
import type {
  AdjustmentInput,
  TransactionInput,
} from '~/modules/transactions/core/types/transaction-input';
import { todayIso } from '~/util/date';

/**
 * Formulário de ajuste (presentational): valor → conta → sentido (aumentar/diminuir) → tipo
 * (correção/rendimento) → motivo obrigatório → data (→ descrição opcional). Rendimento só vale em
 * conta `INVESTMENT`. O texto de ajuda lembra que ajuste não é receita nem despesa.
 */
@Component({
  selector: 'app-adjustment-form',
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
  templateUrl: './adjustment-form.component.html',
  styleUrl: '../entry-form.css',
})
export class AdjustmentFormComponent extends TransactionFormBase {
  /** Todas as contas ativas: ajuste vale em conta de caixa e de investimento. */
  readonly accounts = input.required<readonly Account[]>();
  readonly initial = input<AdjustmentInput | null>(null);
  readonly defaultAccountId = input<string | null>(null);

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>(null),
    direction: new FormControl<string | null>(null),
    kind: new FormControl<string | null>('CORRECTION'),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(500)],
    }),
    date: new FormControl<string | null>(todayIso()),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
  });

  private readonly accountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: this.form.controls.accountId.value,
  });

  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly directionOptions = computed<readonly ChoiceOption[]>(() => {
    const labels = this.t().transactions.directions;
    return [
      { value: 'INCREASE', label: labels.INCREASE },
      { value: 'DECREASE', label: labels.DECREASE },
    ];
  });
  /** Rendimento só com conta de investimento (`ADJUSTMENT_YIELD_REQUIRES_INVESTMENT_ACCOUNT`). */
  protected readonly yieldAllowed = computed(
    () => this.accounts().find((a) => a.id === this.accountId())?.liquidity === 'INVESTMENT',
  );
  protected readonly kindOptions = computed<readonly ChoiceOption[]>(() => {
    const labels = this.t().transactions.adjustmentKinds;
    return [
      { value: 'CORRECTION', label: labels.CORRECTION },
      {
        value: 'YIELD',
        label: labels.YIELD,
        disabled: !this.yieldAllowed(),
        hint: this.yieldAllowed() ? undefined : this.t().entryForm.adjustment.yieldNeedsInvestment,
      },
    ];
  });
  protected readonly descriptionHint = computed(() =>
    interpolate(this.t().entryForm.descriptionHint, {
      default: this.t().entryForm.adjustment.defaultDescription,
    }),
  );

  constructor() {
    super();
    // Trocar para uma conta que não rende desfaz o "rendimento".
    this.form.controls.accountId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.yieldAllowed() && this.form.controls.kind.value === 'YIELD') {
        this.form.controls.kind.setValue('CORRECTION');
      }
    });
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.accountId;
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
          accountId: initial.accountId,
          direction: initial.direction,
          kind: initial.kind,
          reason: initial.reason,
          date: initial.date,
          description: initial.description,
        }),
      );
    });
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    return {
      type: 'ADJUSTMENT',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim() || this.t().entryForm.adjustment.defaultDescription,
      notes: this.initial()?.notes ?? null,
      accountId: value.accountId ?? '',
      direction: (value.direction ?? 'INCREASE') as AdjustmentDirection,
      kind: (value.kind ?? 'CORRECTION') as AdjustmentKind,
      reason: value.reason.trim(),
    };
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.reason.reset('');
    this.form.controls.description.reset('');
  }
}
