import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
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
import { formatMoney, type Money } from '~/util/money';

/** Uma dívida "me devem" em aberto que a devolução pode quitar (o saldo é o do backend). */
export interface ReceivableOption {
  readonly id: string;
  readonly person: PersonRef;
  readonly title: string;
  readonly outstanding: Money;
}

type Kind = 'repayment' | 'borrowed';

/**
 * "Dinheiro recebido" (presentational, T85): **nunca é receita**. Ou devolve uma dívida que me devem
 * (`debtId`: o valor sugerido é o `outstanding` do backend; um valor maior é recusado por ele, sem o
 * front calcular, S-143), ou registra um empréstimo recebido (`newDebt`: cria uma dívida minha). Emite
 * um `MONEY_RECEIVED`.
 */
@Component({
  selector: 'app-received-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    DatePickerComponent,
    SegmentedControlComponent,
    PersonFieldComponent,
    FormActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './received-form.component.html',
  styleUrl: '../entry-form.css',
})
export class ReceivedFormComponent extends TransactionFormBase {
  readonly accounts = input.required<readonly Account[]>();
  readonly people = input.required<readonly PersonRef[]>();
  readonly debts = input.required<readonly ReceivableOption[]>();
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  readonly defaultAccountId = input<string | null>(null);
  /** `?personId=` da URL: só as dívidas dessa pessoa; com uma única, já vem escolhida. */
  readonly defaultPersonId = input<string | null>(null);

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    kind: new FormControl<string | null>('repayment'),
    debtId: new FormControl<string | null>(null),
    personId: new FormControl<string | null>(null),
    amount: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    expectedDate: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
  });

  protected readonly kindOptions = computed<readonly ChoiceOption[]>(() => {
    const copy = this.t().lending.received;
    return [
      { value: 'repayment', label: copy.repayment },
      { value: 'borrowed', label: copy.borrowed },
    ];
  });
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  private readonly visibleDebts = computed(() => {
    const personId = this.defaultPersonId();
    const debts = this.debts();
    const ofPerson = personId ? debts.filter((debt) => debt.person.id === personId) : debts;
    return ofPerson.length > 0 ? ofPerson : debts;
  });
  protected readonly debtOptions = computed<readonly ChoiceOption[]>(() =>
    this.visibleDebts().map((debt) => ({
      value: debt.id,
      label: interpolate(this.t().lending.received.debtOption, {
        name: debt.person.name,
        title: debt.title,
        amount: formatMoney(debt.outstanding),
      }),
    })),
  );

  private readonly kindValue = valueSignal(this.form.controls.kind);
  private readonly kind = computed<Kind>(() =>
    this.kindValue() === 'borrowed' ? 'borrowed' : 'repayment',
  );
  protected readonly isRepayment = computed(() => this.kind() === 'repayment');
  private readonly debtValue = valueSignal(this.form.controls.debtId);
  private readonly selectedDebt = computed(
    () => this.debts().find((debt) => debt.id === this.debtValue()) ?? null,
  );
  /** "Falta R$ x nesta dívida": o `outstanding` que o backend devolveu, sem conta. */
  protected readonly amountHint = computed(() => {
    const debt = this.selectedDebt();
    return debt && this.isRepayment()
      ? interpolate(this.t().lending.received.amountHint, { amount: formatMoney(debt.outstanding) })
      : undefined;
  });

  constructor() {
    super();
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.accountId;
        if (accountId && control.value === null) control.setValue(accountId);
      });
    });
    // Só uma das duas escolhas vale por vez (a outra fica desabilitada e fora da validação).
    effect(() => {
      const repayment = this.isRepayment();
      untracked(() => {
        const { debtId, personId, expectedDate } = this.form.controls;
        if (repayment) {
          debtId.enable({ emitEvent: false });
          personId.disable({ emitEvent: false });
          expectedDate.disable({ emitEvent: false });
        } else {
          debtId.disable({ emitEvent: false });
          personId.enable({ emitEvent: false });
          expectedDate.enable({ emitEvent: false });
        }
      });
    });
    // Uma dívida só (a da pessoa da URL, ou a única): já vem escolhida.
    effect(() => {
      const options = this.visibleDebts();
      untracked(() => {
        const control = this.form.controls.debtId;
        if (options.length === 1 && control.value === null) control.setValue(options[0]!.id);
      });
    });
    // Escolheu a dívida: o valor sugerido é o `outstanding` do backend (só se o campo ainda está vazio).
    this.form.controls.debtId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.suggest();
    });
    effect(() => {
      this.selectedDebt();
      untracked(() => this.suggest());
    });
  }

  private suggest(): void {
    const debt = this.selectedDebt();
    const { amount, description } = this.form.controls;
    if (!debt || !this.isRepayment()) return;
    if (amount.value === null || amount.value === '') amount.setValue(debt.outstanding.amount);
    if (description.value.trim() === '') {
      description.setValue(
        interpolate(this.t().lending.received.defaultDescriptionRepayment, {
          name: debt.person.name,
        }),
      );
    }
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    const base = {
      type: 'MONEY_RECEIVED' as const,
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      notes: null,
      accountId: value.accountId ?? '',
    };
    if (this.isRepayment()) {
      const debt = this.selectedDebt();
      return {
        ...base,
        description:
          value.description.trim() ||
          interpolate(this.t().lending.received.defaultDescriptionRepayment, {
            name: debt?.person.name ?? '',
          }),
        debtId: value.debtId ?? '',
        newDebt: null,
      };
    }
    const name = this.people().find((person) => person.id === value.personId)?.name ?? '';
    return {
      ...base,
      description:
        value.description.trim() ||
        interpolate(this.t().lending.received.defaultDescriptionBorrowed, { name }),
      debtId: null,
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
    this.form.controls.debtId.reset(null);
    this.form.controls.expectedDate.reset(null);
  }
}
