import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import { GoalFormFacade } from '~/modules/goals/core/facades/goal-form.facade';
import {
  GOAL_CURRENCY,
  GOAL_PRIORITIES,
  type GoalInput,
  type GoalPriority,
} from '~/modules/goals/core/types/goal';

/** Códigos de regra que o backend atribui a um campo do formulário. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  GOAL_NAME_REQUIRED: 'name',
  GOAL_NAME_TOO_LONG: 'name',
  GOAL_TARGET_NOT_POSITIVE: 'target',
  AMOUNT_ABOVE_LIMIT: 'target',
  GOAL_TEXT_TOO_LONG: 'description',
};

/**
 * Criar (`/goals/new`) e editar (`/goals/:id/edit`) uma meta (T100): nome, valor alvo, prazo opcional,
 * prioridade e descrição. Sem imagem (S-149). Nada é calculado aqui: `current`, `progress` e a estimativa
 * mensal voltam do backend. `409 VERSION_CONFLICT` mostra o conflito, mantém o digitado e oferece "Manter o que digitei" (só atualiza a versão) ou "Recarregar a versão atual"; meta arquivada
 * não é editável.
 */
@Component({
  selector: 'app-goal-form-page',
  imports: [
    ReactiveFormsModule,
    FormModalComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TextFieldComponent,
    MoneyInputComponent,
    DatePickerComponent,
    SegmentedControlComponent,
  ],
  providers: [GoalFormFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-form.page.html',
  styleUrl: './goal-form.page.css',
})
export class GoalFormPage {
  private readonly router = inject(Router);
  private readonly changes = inject(EntityChanges);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(GoalFormFacade);
  protected readonly currency = GOAL_CURRENCY;

  /** `:id` da rota; ausente em `/goals/new`. */
  readonly id = input<string>();

  protected readonly editing = computed(() => this.id() !== undefined);
  protected readonly goal = this.facade.goal;
  protected readonly archived = computed(() => this.goal()?.status === 'ARCHIVED');

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(100)],
    }),
    target: new FormControl<string | null>(null),
    deadline: new FormControl<string | null>(null),
    priority: new FormControl<string | null>('MEDIUM'),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  /** Alterações digitadas e não salvas: fechar pede confirmação. */
  protected readonly dirty = dirtySignal(this.form);

  protected readonly priorityOptions = computed<readonly ChoiceOption[]>(() =>
    GOAL_PRIORITIES.map((priority) => ({
      value: priority,
      label: this.t().goals.priority[priority],
    })),
  );

  private readonly fieldHandled = signal(false);
  /** Próxima meta carregada só troca a versão: o formulário mantém o digitado. */
  private keepTyped = false;
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || problem.code === 'VERSION_CONFLICT' || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });
  protected readonly conflict = computed(() => this.facade.problem()?.code === 'VERSION_CONFLICT');
  protected readonly loadProblem = computed(() => {
    const state = this.facade.loadStatus();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly notFound = computed(() => this.loadProblem()?.status === 404);

  constructor() {
    effect(() => {
      const id = this.id();
      if (id !== undefined) untracked(() => this.facade.load(id));
    });
    // A cada versão carregada repõe o formulário, exceto quando o usuário pediu para manter o que digitou
    // (conflito de versão): aí só a versão (`goal().version`, usada no próximo "Salvar") é atualizada.
    effect(() => {
      const goal = this.goal();
      if (!goal) {
        this.keepTyped = false;
        return;
      }
      untracked(() => {
        const keep = this.keepTyped;
        this.keepTyped = false;
        if (!keep)
          this.form.patchValue({
            name: goal.name,
            target: goal.target.amount,
            deadline: goal.deadline,
            priority: goal.priority,
            description: goal.description ?? '',
          });
        if (goal.status === 'ARCHIVED') this.form.disable({ emitEvent: false });
        else this.form.enable({ emitEvent: false });
      });
    });
    effect(() => {
      const problem = this.facade.problem();
      if (!problem) {
        this.fieldHandled.set(false);
        return;
      }
      // Conflito de versão: nada é recarregado sozinho (o digitado fica); o usuário escolhe recarregar.
      untracked(() => this.fieldHandled.set(applyProblemToForm(this.form, problem, CODE_TO_FIELD)));
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.toast.show(this.editing() ? this.t().goals.toast.updated : this.t().goals.toast.created);
      this.changes.notify('goals');
      void this.router.navigate(this.backUrl());
    });
  }

  /** Para onde o modal volta: a lista (criar) ou a página de origem (editar). */
  private backUrl(): string[] {
    return this.editing() ? ['/goals', this.id() as string] : ['/goals'];
  }

  /** Fechar sem salvar (já confirmado, se havia alterações). */
  protected close(): void {
    void this.router.navigate(this.backUrl());
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.archived()) return;
    const value = this.form.getRawValue();
    const input: GoalInput = {
      name: value.name.trim(),
      target: value.target ?? '',
      deadline: value.deadline,
      priority: (value.priority ?? 'MEDIUM') as GoalPriority,
      description: value.description.trim() === '' ? null : value.description.trim(),
    };
    const id = this.id();
    const goal = this.goal();
    if (id !== undefined && goal) {
      this.facade.save({ kind: 'update', id, input: { ...input, version: goal.version } });
    } else {
      this.facade.save({ kind: 'create', input });
    }
  }

  /** Conflito de versão: atualiza só a versão e mantém o digitado (o usuário salva de novo com os seus valores). */
  protected keepMine(): void {
    const id = this.id();
    if (id === undefined) return;
    this.keepTyped = true;
    this.facade.dismissProblem();
    this.facade.load(id);
  }

  /** Conflito de versão: o usuário escolheu a versão mais recente (o digitado é substituído). */
  protected reloadLatest(): void {
    const id = this.id();
    if (id === undefined) return;
    this.facade.dismissProblem();
    this.facade.load(id);
  }

  protected retryLoad(): void {
    const id = this.id();
    if (id !== undefined) this.facade.load(id);
  }
}
