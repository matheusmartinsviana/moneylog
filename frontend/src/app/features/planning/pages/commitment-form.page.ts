import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import { CheckboxComponent } from '~/app/common/components/forms/checkbox/checkbox.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { valueSignal } from '~/app/common/forms/control-signal';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { CommitmentFormFacade } from '~/modules/commitments/core/facades/commitment-form.facade';
import {
  COMMITMENT_CURRENCY,
  COMMITMENT_ITEM_TYPES,
  COMMITMENT_KINDS,
  type CommitmentInput,
  type CommitmentItemInput,
  type CommitmentItemType,
  type CommitmentKind,
} from '~/modules/commitments/core/types/commitment';

/** Máximo de itens do cronograma (contrato). */
const MAX_ITEMS = 120;

function itemGroup() {
  return new FormGroup({
    label: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    type: new FormControl<string | null>('INSTALLMENT'),
    dueDate: new FormControl<string | null>(null),
    amount: new FormControl<string | null>(null),
    paid: new FormControl(false, { nonNullable: true }),
    paidOn: new FormControl<string | null>({ value: null, disabled: true }),
  });
}

/**
 * Novo compromisso acompanhado (modal sobre a lista). O tipo decide os campos: empréstimo de terceiro
 * (parcelas pagas/total, valor pago, próximo vencimento: só o que o usuário sabe, sem saldo) ou projeto de
 * longo prazo (cronograma de itens). Total, pago, saldo e progresso são calculados pelo servidor. Salvar usa
 * `exhaustMap` e `Idempotency-Key`; erros 422 (`COMMITMENT_INVALID`) vão para os campos ou para o aviso.
 */
@Component({
  selector: 'app-commitment-form-page',
  imports: [
    ReactiveFormsModule,
    FormModalComponent,
    SegmentedControlComponent,
    SelectComponent,
    TextFieldComponent,
    NumberStepperComponent,
    MoneyInputComponent,
    DatePickerComponent,
    CheckboxComponent,
  ],
  providers: [CommitmentFormFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commitment-form.page.html',
  styleUrl: './commitment-form.page.css',
})
export class CommitmentFormPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(CommitmentFormFacade);
  protected readonly currency = COMMITMENT_CURRENCY;
  protected readonly maxItems = MAX_ITEMS;

  protected readonly form = new FormGroup({
    kind: new FormControl<string | null>('TRACKED_THIRD_PARTY'),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    counterparty: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    installmentsTotal: new FormControl<number | null>(null),
    installmentsPaid: new FormControl<number | null>(0),
    paidAmount: new FormControl<string | null>(null),
    nextDueDate: new FormControl<string | null>(null),
    schedule: new FormArray<ReturnType<typeof itemGroup>>([]),
  });
  protected readonly dirty = dirtySignal(this.form);
  private readonly kindValue = valueSignal(this.form.controls.kind);
  protected readonly isProject = computed(() => this.kindValue() === 'LONG_TERM_PROJECT');
  protected readonly items = this.form.controls.schedule;
  protected readonly itemCount = signal(0);

  protected readonly kindOptions = computed<readonly ChoiceOption[]>(() =>
    COMMITMENT_KINDS.map((kind) => ({ value: kind, label: this.t().commitments.kinds[kind] })),
  );
  protected readonly typeOptions = computed<readonly ChoiceOption[]>(() =>
    COMMITMENT_ITEM_TYPES.map((type) => ({
      value: type,
      label: this.t().commitments.itemTypes[type],
    })),
  );

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    // Só os campos do tipo escolhido participam da validação.
    effect(() => {
      const project = this.isProject();
      untracked(() => {
        const c = this.form.controls;
        const toggle = (control: FormControl<unknown> | FormArray, on: boolean) =>
          on ? control.enable({ emitEvent: false }) : control.disable({ emitEvent: false });
        toggle(c.installmentsTotal, !project);
        toggle(c.installmentsPaid, !project);
        toggle(c.paidAmount, !project);
        toggle(c.nextDueDate, !project);
        toggle(c.schedule, project);
        if (project && this.items.length === 0) this.addItem();
        c.installmentsTotal.setValidators(project ? [] : [Validators.required]);
        c.installmentsTotal.updateValueAndValidity({ emitEvent: false });
      });
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() =>
        this.fieldHandled.set(problem ? applyProblemToForm(this.form, problem) : false),
      );
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.toast.show(this.t().commitments.form.toast);
      void this.router.navigate(['/planning/commitments']);
    });
  }

  protected addItem(): void {
    if (this.items.length >= MAX_ITEMS) return;
    const group = itemGroup();
    // "Já pago" liga o campo da data de pagamento.
    group.controls.paid.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paid) => {
      if (paid) group.controls.paidOn.enable({ emitEvent: false });
      else {
        group.controls.paidOn.reset(null, { emitEvent: false });
        group.controls.paidOn.disable({ emitEvent: false });
      }
    });
    this.items.push(group);
    this.items.markAsDirty();
    this.itemCount.set(this.items.length);
  }

  protected removeItem(index: number): void {
    this.items.removeAt(index);
    this.items.markAsDirty();
    this.itemCount.set(this.items.length);
  }

  protected itemLabel(index: number): string {
    return interpolate(this.t().commitments.form.schedule.item, { number: String(index + 1) });
  }

  protected removeLabel(index: number): string {
    return interpolate(this.t().commitments.form.schedule.remove, { number: String(index + 1) });
  }

  protected close(): void {
    void this.router.navigate(['/planning/commitments']);
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const kind = (value.kind ?? 'TRACKED_THIRD_PARTY') as CommitmentKind;
    const project = kind === 'LONG_TERM_PROJECT';
    if (project && this.items.length === 0) return;
    const input: CommitmentInput = {
      kind,
      name: value.name,
      counterparty: value.counterparty,
      notes: value.notes,
      installmentsTotal: project ? null : value.installmentsTotal,
      installmentsPaid: project ? null : value.installmentsPaid,
      paidAmount: project ? null : value.paidAmount,
      nextDueDate: project ? null : value.nextDueDate,
      schedule: project
        ? value.schedule.map((item): CommitmentItemInput => ({
            label: item.label,
            type: (item.type ?? 'INSTALLMENT') as CommitmentItemType,
            dueDate: item.dueDate,
            amount: item.amount ?? '',
            paid: item.paid,
            paidOn: item.paid ? item.paidOn : null,
          }))
        : null,
    };
    this.facade.save(input);
  }
}
