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
import { RouterLink, RouterOutlet } from '@angular/router';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { ProgressBarComponent } from '~/app/common/components/progress-bar/progress-bar.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { GoalConsistencyComponent } from '~/app/features/goals/components/goal-consistency/goal-consistency.component';
import { GoalFeaturedSwitchComponent } from '~/app/features/goals/components/goal-featured-switch/goal-featured-switch.component';
import { GoalGalleryComponent } from '~/app/features/goals/components/goal-gallery/goal-gallery.component';
import {
  ActionCheckIn,
  GoalPlanComponent,
} from '~/app/features/goals/components/goal-plan/goal-plan.component';
import { GoalStageBadgeComponent } from '~/app/features/goals/components/goal-stage-badge/goal-stage-badge.component';
import { GoalStageLadderComponent } from '~/app/features/goals/components/goal-stage-ladder/goal-stage-ladder.component';
import { ReservationRowComponent } from '~/app/features/goals/components/reservation-row/reservation-row.component';
import { ReserveSheetComponent } from '~/app/features/goals/components/reserve-sheet/reserve-sheet.component';
import { goalName } from '~/app/features/goals/services/goal-name';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { GoalDetailFacade } from '~/modules/goals/core/facades/goal-detail.facade';
import type { Goal, GoalActionInput } from '~/modules/goals/core/types/goal';
import { formatIsoDate } from '~/util/date';
import { formatMoney } from '~/util/money';
import { formatRatio, ratioForBar } from '~/util/ratio';

/**
 * Detalhe da meta (smart, T100): progresso, valores, estimativa mensal, aviso de reserva descoberta, as
 * reservas e as ações (reservar, liberar, editar, arquivar). **Tudo vem do backend**: depois de reservar ou
 * liberar, a meta da resposta vira o estado (sem chute). Meta atingida explica as duas ações de "usar o
 * dinheiro" (despesa + liberação) sem automatizar nada.
 */
@Component({
  selector: 'app-goal-page',
  imports: [
    DisclosureComponent,
    RouterOutlet,
    LinkedNotesComponent,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    MoneyComponent,
    ProgressBarComponent,
    ReservationRowComponent,
    ReserveSheetComponent,
    GoalStageBadgeComponent,
    GoalStageLadderComponent,
    GoalPlanComponent,
    GoalConsistencyComponent,
    GoalGalleryComponent,
    GoalFeaturedSwitchComponent,
  ],
  providers: [GoalDetailFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal.page.html',
  styleUrl: './goal.page.css',
})
export class GoalPage {
  private readonly changes = inject(EntityChanges);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly detail = inject(GoalDetailFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();

  protected readonly goal = this.detail.goal;
  protected readonly name = computed(() => {
    const goal = this.goal();
    return goal ? goalName(goal, this.t().goals) : '';
  });
  /** Meta de medida arquivada não calcula: `current` e `remaining` vêm nulos. */
  protected readonly notCalculated = computed(() => this.goal()?.current === null);
  protected readonly planError = computed(() => {
    const problem = this.detail.planProblem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly featuredError = computed(() => {
    const problem = this.detail.featuredProblem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly notFound = computed(() => this.detail.error()?.status === 404);

  protected readonly reserveOpen = signal(false);
  protected readonly releasing = signal(false);
  protected readonly confirmingArchive = signal(false);
  protected readonly confirmingReanchor = signal(false);

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly bar = computed(() => {
    const goal = this.goal();
    return goal ? ratioForBar(goal.progress) : null;
  });
  protected readonly percent = computed(() => {
    const goal = this.goal();
    return goal ? formatRatio(goal.progress, this.locale()) : '';
  });
  protected readonly progressText = computed(() => {
    const goal = this.goal();
    return goal
      ? interpolate(this.t().goals.card.progressText, {
          current: goal.current ? formatMoney(goal.current) : '',
          target: formatMoney(goal.target),
        })
      : '';
  });
  protected readonly progressLabel = computed(() =>
    interpolate(this.t().goals.card.progressLabel, { name: this.name() }),
  );
  protected readonly deadline = computed(() => {
    const deadline = this.goal()?.deadline ?? null;
    return deadline === null
      ? this.t().goals.card.noDeadline
      : interpolate(this.t().goals.card.deadline, {
          date: formatIsoDate(deadline, this.locale(), 'long'),
        });
  });
  protected readonly priority = computed(() => {
    const goal = this.goal();
    return goal
      ? interpolate(this.t().goals.priorityTag, {
          priority: this.t().goals.priority[goal.priority],
        })
      : '';
  });
  protected readonly archiveTitle = computed(() =>
    interpolate(this.t().goals.archiveConfirm.title, { name: this.name() }),
  );
  protected readonly actionError = computed(() => {
    const problem = this.detail.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly canRelease = computed(() => (this.goal()?.reservations.length ?? 0) > 0);

  constructor() {
    // Um cadastro foi salvo no modal por cima desta página: relê do backend.
    this.changes
      .of('goals')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.detail.load(this.id()));
    effect(() => {
      const id = this.id();
      untracked(() => this.detail.load(id));
    });
    this.detail.planDone$.pipe(takeUntilDestroyed()).subscribe((kind) => {
      const copy = this.t().goals.plan.toast;
      const text =
        kind === 'note'
          ? copy.noteSaved
          : kind === 'add'
            ? copy.added
            : kind === 'update'
              ? copy.updated
              : kind === 'remove'
                ? copy.removed
                : null;
      if (text !== null) this.toast.show(text);
    });
    this.detail.featuredDone$.pipe(takeUntilDestroyed()).subscribe((goal) => {
      const copy = this.t().goals.photos.featured;
      this.toast.show(goal.featured ? copy.on : copy.off);
    });
    this.detail.done$.pipe(takeUntilDestroyed()).subscribe(({ kind }) => {
      this.confirmingArchive.set(false);
      this.confirmingReanchor.set(false);
      const copy = this.t().goals.toast;
      this.toast.show(
        kind === 'baseline'
          ? this.t().goals.payoff.baselineToast
          : kind === 'archive'
            ? copy.archived
            : copy.unarchived,
      );
    });
  }

  protected openReserve(release: boolean): void {
    this.releasing.set(release);
    this.reserveOpen.set(true);
  }

  /** A meta que o backend devolveu (com `current`, `progress` e as reservas) vira o estado. */
  protected afterReserve(goal: Goal): void {
    this.reserveOpen.set(false);
    this.detail.apply(goal);
  }

  protected askArchive(): void {
    this.detail.clearProblem();
    this.confirmingArchive.set(true);
  }

  protected confirmArchive(): void {
    this.detail.archive(this.id());
  }

  protected cancelArchive(): void {
    if (!this.detail.busy()) this.confirmingArchive.set(false);
  }

  /** "Cadastrei tudo": o servidor fixa o total de hoje; a meta devolvida vira o estado. */
  protected confirmBaseline(): void {
    this.detail.clearProblem();
    this.detail.baseline(this.id());
  }

  protected askReanchor(): void {
    this.detail.clearProblem();
    this.confirmingReanchor.set(true);
  }

  protected confirmReanchor(): void {
    this.detail.baseline(this.id());
  }

  protected cancelReanchor(): void {
    if (!this.detail.busy()) this.confirmingReanchor.set(false);
  }

  protected savePlanNote(note: string): void {
    this.detail.clearPlanProblem();
    this.detail.savePlanNote(note);
  }

  protected addAction(input: GoalActionInput): void {
    this.detail.clearPlanProblem();
    this.detail.addAction(input);
  }

  protected updateAction(event: { id: string; input: GoalActionInput }): void {
    this.detail.clearPlanProblem();
    this.detail.updateAction(event.id, event.input);
  }

  protected removeAction(actionId: string): void {
    this.detail.clearPlanProblem();
    this.detail.removeAction(actionId);
  }

  protected checkIn(event: ActionCheckIn): void {
    this.detail.clearPlanProblem();
    this.detail.checkIn(event.actionId, event.period, event.done);
  }

  protected unarchive(): void {
    this.detail.clearProblem();
    this.detail.unarchive(this.id());
  }

  protected retry(): void {
    this.detail.load(this.id());
  }
}
