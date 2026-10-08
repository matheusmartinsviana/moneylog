import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { TextAreaComponent } from '~/app/common/components/forms/text-area/text-area.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { MotionStaggerDirective } from '~/app/common/motion/motion-stagger.directive';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import {
  GOAL_ACTION_FREQUENCIES,
  GOAL_ACTION_MAX,
  GOAL_PLAN_NOTE_MAX,
  type Goal,
  type GoalAction,
  type GoalActionFrequency,
  type GoalActionInput,
} from '~/modules/goals/core/types/goal';
import { formatIsoDate, formatCompetenceShort, todayIso } from '~/util/date';
import { formatMoney, isNegative, withoutSign } from '~/util/money';
import { currentPeriod, parsePeriod } from '~/util/period';

export interface ActionCheckIn {
  readonly actionId: string;
  readonly period: string;
  readonly done: boolean;
}

/**
 * Plano da meta (presentational). Mostra o plano AUTOMÁTICO como sugestão (ritmo por mês, meses restantes,
 * marco do mês e "no ritmo"/"atrasado em": tudo do servidor, nada calculado aqui) e o plano DECLARADO: o
 * texto (`planNote`, até 500) e até 10 ações com check-in por período. As escritas saem por eventos; quem
 * usa (a página, via facade) manda ao servidor e devolve a meta atualizada. Nada move dinheiro.
 */
@Component({
  selector: 'app-goal-plan',
  imports: [
    ReactiveFormsModule,
    ConfirmDialogComponent,
    FormModalComponent,
    SegmentedControlComponent,
    TextAreaComponent,
    TextFieldComponent,
    IconComponent,
    MoneyComponent,
    MotionStaggerDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-plan.component.html',
  styleUrl: './goal-plan.component.css',
})
export class GoalPlanComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly goal = input.required<Goal>();
  /** Escrita do plano em andamento: bloqueia os botões (sem envio duplicado). */
  readonly busy = input(false);
  /** Meta arquivada não aceita edição do plano. */
  readonly locked = input(false);
  /** Falha da última escrita, já traduzida. */
  readonly problem = input<string | null>(null);

  readonly noteSaved = output<string>();
  readonly actionAdded = output<GoalActionInput>();
  readonly actionUpdated = output<{ readonly id: string; readonly input: GoalActionInput }>();
  readonly actionRemoved = output<string>();
  readonly checkedIn = output<ActionCheckIn>();

  protected readonly noteMax = GOAL_PLAN_NOTE_MAX;
  protected readonly max = GOAL_ACTION_MAX;
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly note = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(GOAL_PLAN_NOTE_MAX)],
  });
  protected readonly noteChanged = signal(false);

  /** Formulário da ação (modal). `editing`: `null` fechado; `''` nova; id = edição. */
  protected readonly editing = signal<string | null>(null);
  protected readonly removing = signal<GoalAction | null>(null);
  protected readonly actionForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(100)],
    }),
    frequency: new FormControl<string | null>('MONTHLY'),
  });
  protected readonly actionDirty = dirtySignal(this.actionForm);

  protected readonly frequencyOptions = computed<readonly ChoiceOption[]>(() =>
    GOAL_ACTION_FREQUENCIES.map((value) => ({
      value,
      label: this.t().goals.plan.frequency[value],
    })),
  );
  protected readonly atLimit = computed(() => this.goal().actions.length >= GOAL_ACTION_MAX);
  protected readonly limitText = computed(() =>
    interpolate(this.t().goals.plan.limit, { max: String(GOAL_ACTION_MAX) }),
  );
  protected readonly removeTitle = computed(() =>
    interpolate(this.t().goals.plan.removeConfirm.title, { title: this.removing()?.title ?? '' }),
  );
  protected readonly modalTitle = computed(() =>
    this.editing() === '' ? this.t().goals.plan.addTitle : this.t().goals.plan.editTitle,
  );

  /** Texto do plano automático. `null` quando o servidor não devolveu ritmo. */
  protected readonly suggestion = computed(() => {
    const goal = this.goal();
    if (goal.requiredPace === null || goal.deadline === null) return null;
    return interpolate(this.t().goals.plan.suggestion, {
      date: formatIsoDate(goal.deadline, this.locale(), 'long'),
      pace: formatMoney(goal.requiredPace),
    });
  });
  protected readonly overdue = computed(
    () => this.goal().deadline !== null && this.goal().monthsLeft === 0,
  );
  protected readonly behind = computed(() => {
    const goal = this.goal();
    if (goal.onTrack !== false || goal.gap === null) return null;
    const gap = isNegative(goal.gap) ? withoutSign(goal.gap) : goal.gap;
    return interpolate(this.t().goals.plan.behind, { gap: formatMoney(gap) });
  });

  protected readonly today = todayIso();

  constructor() {
    // Mostra sempre o texto que o servidor guarda; digitação em andamento não é sobrescrita por releituras
    // iguais (o `effect` só roda quando `planNote` muda).
    effect(() => {
      const value = this.goal().planNote ?? '';
      untracked(() => {
        this.note.setValue(value, { emitEvent: false });
        this.noteChanged.set(false);
      });
    });
    effect(() => {
      if (this.locked()) this.note.disable({ emitEvent: false });
      else this.note.enable({ emitEvent: false });
    });
    this.note.valueChanges.subscribe((value) =>
      this.noteChanged.set(value.trim() !== (this.goal().planNote ?? '').trim()),
    );
  }

  protected saveNote(): void {
    if (this.note.invalid || this.busy() || !this.noteChanged()) return;
    this.noteSaved.emit(this.note.value.trim());
  }

  protected openAdd(): void {
    this.actionForm.reset({ title: '', frequency: 'MONTHLY' });
    this.editing.set('');
  }

  protected openEdit(action: GoalAction): void {
    this.actionForm.reset({ title: action.title, frequency: action.frequency });
    this.editing.set(action.id);
  }

  protected closeAction(): void {
    this.editing.set(null);
  }

  protected submitAction(): void {
    this.actionForm.markAllAsTouched();
    if (this.actionForm.invalid || this.busy()) return;
    const value = this.actionForm.getRawValue();
    const input: GoalActionInput = {
      title: value.title.trim(),
      frequency: (value.frequency ?? 'MONTHLY') as GoalActionFrequency,
    };
    const id = this.editing();
    this.editing.set(null);
    if (id === null || id === '') this.actionAdded.emit(input);
    else this.actionUpdated.emit({ id, input });
  }

  protected confirmRemove(): void {
    const action = this.removing();
    this.removing.set(null);
    if (action) this.actionRemoved.emit(action.id);
  }

  protected period(action: GoalAction): string {
    return currentPeriod(action.frequency, this.today);
  }

  protected isDone(action: GoalAction): boolean {
    return action.doneIn.includes(this.period(action));
  }

  protected toggle(action: GoalAction): void {
    if (this.busy() || this.locked()) return;
    this.checkedIn.emit({
      actionId: action.id,
      period: this.period(action),
      done: !this.isDone(action),
    });
  }

  protected checkLabel(action: GoalAction): string {
    return this.t().goals.plan.checkIn[action.frequency];
  }

  protected checkAria(action: GoalAction): string {
    return interpolate(this.t().goals.plan.checkInAria, {
      title: action.title,
      label: this.checkLabel(action),
    });
  }

  protected editLabel(action: GoalAction): string {
    return interpolate(this.t().goals.plan.editAction, { title: action.title });
  }

  protected removeLabel(action: GoalAction): string {
    return interpolate(this.t().goals.plan.removeAction, { title: action.title });
  }

  /** Rótulo de um período já marcado: mês, semana ou "Feito". */
  protected periodLabel(period: string): string {
    const parts = parsePeriod(period);
    switch (parts.kind) {
      case 'month':
        return formatCompetenceShort(period, this.locale());
      case 'week':
        return interpolate(this.t().goals.plan.period.week, {
          week: String(parts.number),
          year: String(parts.year),
        });
      case 'once':
        return this.t().goals.plan.period.once;
      default:
        return period;
    }
  }
}
