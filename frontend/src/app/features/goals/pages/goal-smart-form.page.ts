import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { GoalFormFacade } from '~/modules/goals/core/facades/goal-form.facade';
import { GoalMetricValueFacade } from '~/modules/goals/core/facades/goal-metric-value.facade';
import {
  GOAL_CURRENCY,
  GOAL_METRICS,
  type GoalInput,
  type GoalMetric,
} from '~/modules/goals/core/types/goal';

/** Regras do servidor que pertencem a um campo (as demais viram aviso geral). */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  GOAL_METRIC_TARGET_EQUALS_BASELINE: 'target',
  AMOUNT_ABOVE_LIMIT: 'target',
  GOAL_NAME_TOO_LONG: 'name',
};

/**
 * Nova meta inteligente (`/goals/new-smart`, em modal sobre a lista): escolhe a medida, mostra o valor de
 * hoje (lido do servidor, nunca calculado aqui), pede o alvo (aceita 0,00), o prazo e um nome opcional.
 * Sem prazo, só um aviso gentil ("meta sem prazo é só fantasia"): não bloqueia. A direção (reduzir ou
 * aumentar) é derivada pelo servidor. Erros: alvo igual ao valor de hoje no campo; meta repetida no aviso.
 */
@Component({
  selector: 'app-goal-smart-form-page',
  imports: [
    ReactiveFormsModule,
    FormModalComponent,
    SelectComponent,
    MoneyInputComponent,
    DatePickerComponent,
    TextFieldComponent,
    MoneyComponent,
  ],
  providers: [GoalFormFacade, GoalMetricValueFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-smart-form.page.html',
  styleUrl: './goal-smart-form.page.css',
})
export class GoalSmartFormPage {
  private readonly router = inject(Router);
  private readonly changes = inject(EntityChanges);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(GoalFormFacade);
  protected readonly current = inject(GoalMetricValueFacade);
  protected readonly currency = GOAL_CURRENCY;

  protected readonly form = new FormGroup({
    metric: new FormControl<string | null>(null, { validators: [Validators.required] }),
    target: new FormControl<string | null>(null),
    deadline: new FormControl<string | null>(null),
    name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
  });
  protected readonly dirty = dirtySignal(this.form);

  protected readonly metricOptions = computed<readonly ChoiceOption[]>(() =>
    GOAL_METRICS.map((metric) => ({ value: metric, label: this.t().goals.metric[metric] })),
  );

  private readonly deadline = toSignal(this.form.controls.deadline.valueChanges, {
    initialValue: null,
  });
  /** Aviso gentil (não bloqueia): sem prazo a meta fica na Fantasia. */
  protected readonly showNoDeadline = computed(() => !this.deadline());

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    this.form.controls.metric.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((metric) => this.current.load(metric as GoalMetric | null));
    effect(() => {
      const problem = this.facade.problem();
      if (!problem) {
        this.fieldHandled.set(false);
        return;
      }
      untracked(() => this.fieldHandled.set(applyProblemToForm(this.form, problem, CODE_TO_FIELD)));
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((goal) => {
      this.toast.show(this.t().goals.toast.created);
      this.changes.notify('goals');
      void this.router.navigate(['/goals', goal.id]);
    });
  }

  protected metric(): GoalMetric | null {
    return this.form.controls.metric.value as GoalMetric | null;
  }

  protected retryCurrent(): void {
    this.current.load(this.metric());
  }

  protected close(): void {
    void this.router.navigate(['/goals']);
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || value.target === null || value.target === '') {
      if (value.target === null || value.target === '') {
        this.form.controls.target.setErrors({ required: true });
      }
      return;
    }
    const input: GoalInput = {
      kind: 'METRIC',
      metric: value.metric as GoalMetric,
      name: value.name.trim(),
      target: value.target,
      deadline: value.deadline,
      description: null,
    };
    this.facade.save({ kind: 'create', input });
  }
}
