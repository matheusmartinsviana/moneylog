import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, startWith } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { PersonFieldComponent } from '~/app/features/people/components/person-field/person-field.component';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import type { Category } from '~/modules/categories/core/types/category';
import { DEBT_CURRENCY, DebtInput } from '~/modules/debts/core/types/debt';
import type { Problem } from '~/util/api/problem';
import { todayIso } from '~/util/date';
import type { PersonRef } from '~/util/debt';

/** Códigos de regra do backend → campo do formulário. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  PERSON_ARCHIVED: 'personId',
  PERSON_NOT_FOUND: 'personId',
  DEBT_INVALID_PRINCIPAL: 'principal',
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'principal',
  DEBT_CATEGORY_NOT_ALLOWED: 'categoryId',
  CATEGORY_NOT_FOUND: 'categoryId',
  CATEGORY_KIND_MISMATCH: 'categoryId',
  CATEGORY_ARCHIVED: 'categoryId',
  DEBT_CREDITOR_INVALID: 'creditorName',
  DEBT_DESCRIPTION_TOO_LONG: 'description',
  DEBT_FIELD_REQUIRED: 'description',
};

/**
 * "Nova dívida" (presentational, T85): registro **sem movimentação**, que não mexe no saldo das contas.
 * Sentido (me devem / eu devo), pessoa (existente ou nova, S-138), valor, data, previsão e descrição;
 * a categoria só aparece em "Eu devo" ("gasto que alguém pagou por você", S-137). Emite um `DebtInput`;
 * quem usa salva e mostra o erro do backend.
 */
@Component({
  selector: 'app-debt-form',
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
  templateUrl: './debt-form.component.html',
  styleUrl: '../entry-form.css',
})
export class DebtFormComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18nService).t;

  readonly people = input.required<readonly PersonRef[]>();
  readonly categories = input.required<readonly Category[]>();
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  /** `?personId=` da URL: a pessoa já escolhida (o botão "Nova dívida" da tela dela). */
  readonly defaultPersonId = input<string | null>(null);
  readonly saving = input(false);
  readonly problem = input<Problem | null>(null);
  readonly canRetry = input(false);
  readonly resetToken = input(0);
  readonly focusToken = input(0);

  readonly submitted = output<DebtInput>();
  readonly retry = output<void>();

  protected readonly currency = DEBT_CURRENCY;
  protected readonly form = new FormGroup({
    direction: new FormControl<string | null>('RECEIVABLE'),
    creditorKind: new FormControl<string | null>('PERSON'),
    personId: new FormControl<string | null>(null),
    creditorName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    principal: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    expectedDate: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    categoryId: new FormControl<string | null>(null),
  });

  protected readonly directionOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'RECEIVABLE', label: this.t().debts.direction.RECEIVABLE },
    { value: 'PAYABLE', label: this.t().debts.direction.PAYABLE },
  ]);
  protected readonly categoryOptions = computed<readonly ChoiceOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  private readonly directionValue = toSignal(
    this.form.controls.direction.valueChanges.pipe(startWith(this.form.controls.direction.value)),
    { initialValue: this.form.controls.direction.value },
  );
  /** A categoria só existe em "Eu devo" (S-137). */
  protected readonly payable = computed(() => this.directionValue() === 'PAYABLE');
  private readonly creditorKindValue = toSignal(
    this.form.controls.creditorKind.valueChanges.pipe(
      startWith(this.form.controls.creditorKind.value),
    ),
    { initialValue: this.form.controls.creditorKind.value },
  );
  /** Credor livre (banco, loja, financiamento): só em "Eu devo" e sem categoria. */
  protected readonly freeCreditor = computed(
    () => this.payable() && this.creditorKindValue() === 'OTHER',
  );
  protected readonly creditorOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'PERSON', label: this.t().lending.debt.creditorPerson },
    { value: 'OTHER', label: this.t().lending.debt.creditorOther },
  ]);

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    effect(() => {
      const problem = this.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
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
    effect(() => {
      if (!this.payable()) {
        untracked(() => {
          this.form.controls.categoryId.setValue(null);
          this.form.controls.creditorKind.setValue('PERSON');
        });
      }
    });
    effect(() => {
      if (this.resetToken() > 0) {
        untracked(() => {
          this.form.controls.principal.reset(null);
          this.form.controls.description.reset('');
          this.form.controls.expectedDate.reset(null);
          this.form.controls.categoryId.reset(null);
          this.form.controls.creditorName.reset('');
          this.focusAmount();
        });
      }
    });
    effect(() => {
      if (this.focusToken() > 0) untracked(() => this.focusAmount());
    });
    afterNextRender(() => this.focusAmount());
  }

  protected onSubmit(): void {
    // O campo de pessoa saiu da tela (credor livre): o `required` dele não vale mais.
    if (this.freeCreditor()) this.form.controls.personId.updateValueAndValidity();
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const direction = value.direction === 'PAYABLE' ? 'PAYABLE' : 'RECEIVABLE';
    const free = this.freeCreditor();
    if (free && value.creditorName.trim() === '') {
      this.form.controls.creditorName.setErrors({ required: true });
      return;
    }
    this.submitted.emit({
      personId: free ? null : (value.personId ?? ''),
      ...(free ? { creditorName: value.creditorName.trim() } : {}),
      direction,
      principal: value.principal ?? '',
      date: value.date ?? todayIso(),
      expectedDate: value.expectedDate,
      description: value.description.trim(),
      categoryId: direction === 'PAYABLE' && !free ? value.categoryId : null,
    });
  }

  private focusAmount(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input[data-cy$="principal"]')?.focus();
  }
}
