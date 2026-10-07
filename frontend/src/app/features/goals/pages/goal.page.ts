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
import { ReservationRowComponent } from '~/app/features/goals/components/reservation-row/reservation-row.component';
import { ReserveSheetComponent } from '~/app/features/goals/components/reserve-sheet/reserve-sheet.component';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { GoalDetailFacade } from '~/modules/goals/core/facades/goal-detail.facade';
import type { Goal } from '~/modules/goals/core/types/goal';
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
          current: formatMoney(goal.current),
          target: formatMoney(goal.target),
        })
      : '';
  });
  protected readonly progressLabel = computed(() =>
    interpolate(this.t().goals.card.progressLabel, { name: this.goal()?.name ?? '' }),
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
    interpolate(this.t().goals.archiveConfirm.title, { name: this.goal()?.name ?? '' }),
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

  protected unarchive(): void {
    this.detail.clearProblem();
    this.detail.unarchive(this.id());
  }

  protected retry(): void {
    this.detail.load(this.id());
  }
}
