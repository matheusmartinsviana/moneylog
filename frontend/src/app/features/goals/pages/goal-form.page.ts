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

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
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
import { GoalFeaturedSwitchComponent } from '~/app/features/goals/components/goal-featured-switch/goal-featured-switch.component';
import { GoalPhotoManagerComponent } from '~/app/features/goals/components/goal-photo-manager/goal-photo-manager.component';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import { GoalFormFacade } from '~/modules/goals/core/facades/goal-form.facade';
import { GoalPhotosFacade } from '~/modules/goals/core/facades/goal-photos.facade';
import {
  GOAL_CURRENCY,
  GOAL_PRIORITIES,
  type Goal,
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
    DisclosureComponent,
    ConfirmDialogComponent,
    GoalPhotoManagerComponent,
    GoalFeaturedSwitchComponent,
  ],
  providers: [GoalFormFacade, GoalPhotosFacade],
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
  protected readonly photos = inject(GoalPhotosFacade);
  protected readonly currency = GOAL_CURRENCY;

  /** `:id` da rota; ausente em `/goals/new`. */
  readonly id = input<string>();

  protected readonly editing = computed(() => this.id() !== undefined);
  /** Prioridade fica recolhida em "Mais opções" (e omitida se não escolhida). */
  protected readonly moreOpen = signal(false);
  protected readonly goal = this.facade.goal;
  protected readonly archived = computed(() => this.goal()?.status === 'ARCHIVED');
  /** Meta de medida: nome opcional e alvo que aceita zero (ADR-016). */
  protected readonly isMetric = computed(() => this.goal()?.kind === 'METRIC');
  /** Fotos e destaque só em meta de reserva (`SAVINGS`); ao criar, a meta nasce como reserva. */
  protected readonly showPhotos = computed(() =>
    this.editing() ? this.goal()?.kind === 'SAVINGS' && !this.archived() : true,
  );
  /** Meta criada com fotos ou destaque ainda por enviar: a tela espera a fila e só então fecha. */
  protected readonly created = signal<Goal | null>(null);
  protected readonly confirmingRemove = signal<string | null>(null);
  protected readonly photoProblem = computed(() => {
    const problem = this.photos.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly modalBusy = computed(
    () => this.facade.saving() || (this.created() !== null && this.photos.busy()),
  );
  protected readonly uploadsFailed = computed(
    () => this.created() !== null && this.photos.failed().length > 0,
  );

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(100)],
    }),
    target: new FormControl<string | null>(null),
    deadline: new FormControl<string | null>(null),
    priority: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  /** Alterações digitadas e não salvas: fechar pede confirmação. */
  protected readonly dirty = dirtySignal(this.form);
  /** Fotos escolhidas e ainda não enviadas também contam como alteração não salva. */
  protected readonly modalDirty = computed(
    () => this.dirty() || (this.created() === null && this.photos.hasPending()),
  );

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
        this.moreOpen.set(true);
        const keep = this.keepTyped;
        this.keepTyped = false;
        const name = this.form.controls.name;
        name.setValidators(
          goal.kind === 'METRIC'
            ? [Validators.maxLength(100)]
            : [requiredTrimmed, Validators.maxLength(100)],
        );
        name.updateValueAndValidity({ emitEvent: false });
        if (!keep)
          this.form.patchValue({
            name: goal.name ?? '',
            target: goal.target.amount,
            deadline: goal.deadline,
            priority: goal.priority,
            description: goal.description ?? '',
          });
        if (goal.status === 'ARCHIVED') this.form.disable({ emitEvent: false });
        else this.form.enable({ emitEvent: false });
      });
    });
    // Meta de reserva carregada: o gerenciador de fotos passa a refletir a meta (uma vez por meta).
    effect(() => {
      const goal = this.goal();
      if (goal?.kind !== 'SAVINGS') return;
      untracked(() => {
        if (this.photos.goal()?.id !== goal.id) this.photos.setGoal(goal);
      });
    });
    // Fotos mudaram a meta no servidor (versão nova): o próximo "Salvar" usa a versão certa e o digitado fica.
    this.photos.goalChanged$.pipe(takeUntilDestroyed()).subscribe((goal) => {
      this.keepTyped = true;
      this.facade.adopt(goal);
    });
    // Criação com fotos: terminou a fila; se nada falhou, conclui (senão fica para "tentar de novo").
    this.photos.settled$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.created() !== null && this.photos.failed().length === 0) this.finish();
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
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((goal) => {
      if (!this.editing() && goal.kind === 'SAVINGS' && this.photos.hasPending()) {
        // A meta existe; as fotos (e o destaque) vão em seguida, uma por vez.
        this.created.set(goal);
        this.form.disable({ emitEvent: false });
        this.changes.notify('goals');
        this.photos.setGoal(goal);
        return;
      }
      this.finish();
    });
  }

  /** Fim do fluxo: aviso, lista atualizada e volta para onde o modal abriu. */
  protected finish(): void {
    this.toast.show(this.editing() ? this.t().goals.toast.updated : this.t().goals.toast.created);
    this.changes.notify('goals');
    void this.router.navigate(this.backUrl());
  }

  protected askRemovePhoto(photoId: string): void {
    this.photos.clearProblem();
    this.confirmingRemove.set(photoId);
  }

  protected confirmRemovePhoto(): void {
    const id = this.confirmingRemove();
    this.confirmingRemove.set(null);
    if (id !== null) this.photos.remove(id);
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
    if (this.created() !== null) {
      this.finish();
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || this.archived()) return;
    const value = this.form.getRawValue();
    const id = this.id();
    const goal = this.goal();
    const input: GoalInput = {
      ...(goal ? { kind: goal.kind } : {}),
      name: value.name.trim(),
      target: value.target ?? '',
      deadline: value.deadline,
      ...(value.priority ? { priority: value.priority as GoalPriority } : {}),
      description: value.description.trim() === '' ? null : value.description.trim(),
    };
    if (id !== undefined && goal) {
      // O `PUT` apaga o que não vai: o texto do plano segue como está (ele é editado no detalhe).
      this.facade.save({
        kind: 'update',
        id,
        input: { ...input, planNote: goal.planNote, version: goal.version },
      });
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
