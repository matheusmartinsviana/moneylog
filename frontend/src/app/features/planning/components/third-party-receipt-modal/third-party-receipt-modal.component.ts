import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ThirdPartyReceiptFacade } from '~/modules/third-parties/core/facades/third-party-receipt.facade';
import { THIRD_PARTY_CURRENCY } from '~/modules/third-parties/core/types/third-party';
import { todayIso } from '~/util/date';

/** Uma pessoa e as despesas marcadas dela às quais o recebimento pode se ligar. */
export interface ReceiptPersonOption {
  readonly id: string;
  readonly name: string;
  readonly expenses: readonly { readonly id: string; readonly label: string }[];
}

const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  PERSON_ARCHIVED: 'personId',
  PERSON_NOT_FOUND: 'personId',
  THIRD_PARTY_EXPENSE_INVALID: 'transactionId',
  THIRD_PARTY_EXPENSE_NOT_FOUND: 'transactionId',
  AMOUNT_ABOVE_LIMIT: 'amount',
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'amount',
};

/**
 * "Registrar recebimento" (modal): dinheiro que a pessoa já enviou e que **já está no saldo**. Nada é
 * lançado em conta, renda ou consumo; com despesa marcada, reduz o pendente dela, sem ela aparece como
 * "origem a confirmar". Usa o `ThirdPartyReceiptFacade` (`exhaustMap` + `Idempotency-Key`).
 */
@Component({
  selector: 'app-third-party-receipt-modal',
  imports: [
    ReactiveFormsModule,
    FormModalComponent,
    SelectComponent,
    MoneyInputComponent,
    DatePickerComponent,
    TextFieldComponent,
  ],
  providers: [ThirdPartyReceiptFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-modal
      #modal
      [heading]="t().thirdParties.receipts.modal.title"
      [dirty]="dirty()"
      [busy]="facade.saving()"
      (closed)="closed.emit()"
    >
      <form class="form" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate data-cy="tpr-form">
        <p class="hint" data-cy="tpr-description">
          {{ t().thirdParties.receipts.modal.description }}
        </p>
        @if (people().length === 0) {
          <p class="hint" data-cy="tpr-no-people">{{ t().thirdParties.receipts.modal.noPeople }}</p>
        }
        @if (banner(); as message) {
          <p class="banner" role="alert" data-cy="tpr-error">{{ message }}</p>
        }
        <app-select
          formControlName="personId"
          fieldId="tpr-person"
          [options]="personOptions()"
          [label]="t().thirdParties.receipts.modal.person"
        />
        <app-money-input
          formControlName="amount"
          fieldId="tpr-amount"
          [currency]="currency"
          [label]="t().thirdParties.receipts.modal.amount"
        />
        <app-date-picker
          formControlName="receivedOn"
          fieldId="tpr-date"
          [label]="t().thirdParties.receipts.modal.date"
        />
        <app-select
          formControlName="transactionId"
          fieldId="tpr-expense"
          [options]="expenseOptions()"
          [mandatory]="false"
          [emptyLabel]="t().thirdParties.receipts.modal.noLink"
          [label]="t().thirdParties.receipts.modal.link"
          [hint]="t().thirdParties.receipts.modal.linkHint"
        />
        <app-text-field
          formControlName="note"
          fieldId="tpr-note"
          autocomplete="off"
          [maxlength]="200"
          [mandatory]="false"
          [label]="t().thirdParties.receipts.modal.note"
        />
        <div class="actions">
          <button type="button" class="button" data-cy="tpr-cancel" (click)="modal.requestClose()">
            {{ t().thirdParties.receipts.modal.cancel }}
          </button>
          <button
            type="submit"
            class="button button--primary"
            data-cy="tpr-save"
            [disabled]="facade.saving() || people().length === 0"
            [attr.aria-busy]="facade.saving()"
          >
            {{
              facade.saving()
                ? t().thirdParties.receipts.modal.saving
                : t().thirdParties.receipts.modal.save
            }}
          </button>
        </div>
      </form>
    </app-form-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .form {
      display: grid;
      gap: var(--space-4);
    }

    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class ThirdPartyReceiptModalComponent implements OnInit {
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(ThirdPartyReceiptFacade);
  protected readonly currency = THIRD_PARTY_CURRENCY;

  /** Quem pode receber (do `third-party-receivables` já carregado). */
  readonly people = input.required<readonly ReceiptPersonOption[]>();
  readonly presetPersonId = input<string | null>(null);
  readonly presetTransactionId = input<string | null>(null);

  readonly closed = output<void>();
  /** Registrado (resposta do backend): quem usa relê o a-receber e avisa. */
  readonly recorded = output<void>();

  protected readonly form = new FormGroup({
    personId: new FormControl<string | null>(null, [Validators.required]),
    amount: new FormControl<string | null>(null, [Validators.required]),
    receivedOn: new FormControl<string | null>(todayIso()),
    transactionId: new FormControl<string | null>(null),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
  });
  protected readonly dirty = dirtySignal(this.form);
  private readonly selectedPerson = signal<string | null>(null);
  private readonly fieldHandled = signal(false);

  protected readonly personOptions = computed<readonly ChoiceOption[]>(() =>
    this.people().map((person) => ({ value: person.id, label: person.name })),
  );
  protected readonly expenseOptions = computed<readonly ChoiceOption[]>(() => {
    const person = this.people().find((entry) => entry.id === this.selectedPerson());
    return (person?.expenses ?? []).map((expense) => ({ value: expense.id, label: expense.label }));
  });
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    this.form.controls.personId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.selectedPerson.set(id);
      const link = this.form.controls.transactionId.value;
      if (link !== null && !this.expenseOptions().some((option) => option.value === link)) {
        this.form.controls.transactionId.setValue(null);
      }
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
    });
    this.facade.recorded$.pipe(takeUntilDestroyed()).subscribe(() => this.recorded.emit());
  }

  ngOnInit(): void {
    this.facade.clearProblem();
    const person = this.presetPersonId();
    if (person !== null) this.form.controls.personId.setValue(person);
    const tx = this.presetTransactionId();
    if (tx !== null) this.form.controls.transactionId.setValue(tx);
    this.form.markAsPristine();
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || value.personId === null || value.amount === null) return;
    this.facade.record({
      personId: value.personId,
      transactionId: value.transactionId,
      amount: value.amount,
      receivedOn: value.receivedOn,
      note: value.note,
    });
  }
}
