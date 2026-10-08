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
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { SlideIndicatorDirective } from '~/app/common/motion/slide-indicator.directive';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { GoalCardComponent } from '~/app/features/goals/components/goal-card/goal-card.component';
import { ReserveSheetComponent } from '~/app/features/goals/components/reserve-sheet/reserve-sheet.component';
import { GoalFormFacade } from '~/modules/goals/core/facades/goal-form.facade';
import { GoalsListFacade } from '~/modules/goals/core/facades/goals-list.facade';
import type { Goal, GoalStatus } from '~/modules/goals/core/types/goal';

/**
 * Metas (smart, T100): lista as ativas, as atingidas ou as arquivadas (`?status=` na URL; o F5 volta ao
 * mesmo filtro). Cada card mostra o progresso **que o backend calculou**. "Reservar" abre a folha de
 * reserva da meta escolhida; a meta da resposta substitui a do card (sem chute). Estados: carregando, vazio
 * (com "Criar meta"), erro (com "tentar de novo") e dados.
 */
@Component({
  selector: 'app-goals-page',
  imports: [
    SlideIndicatorDirective,
    RouterOutlet,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GoalCardComponent,
    ReserveSheetComponent,
  ],
  providers: [GoalsListFacade, GoalFormFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goals.page.html',
  styleUrl: './goals.page.css',
})
export class GoalsPage {
  private readonly changes = inject(EntityChanges);
  protected readonly t = inject(I18nService).t;
  protected readonly goals = inject(GoalsListFacade);
  protected readonly creating = inject(GoalFormFacade);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Já existe uma meta de quitar dívidas na lista: não oferece criar outra (o servidor também recusa). */
  protected readonly hasPayoff = computed(
    () => this.goals.data()?.some((goal) => goal.kind === 'DEBT_PAYOFF') ?? false,
  );
  protected readonly createError = computed(() => {
    const problem = this.creating.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  /** Filtro da URL (`?status=ACHIEVED|ARCHIVED`); qualquer outro valor mostra as ativas. */
  readonly status = input<string>();

  protected readonly filter = computed<GoalStatus>(() => {
    const status = this.status();
    return status === 'ACHIEVED' || status === 'ARCHIVED' ? status : 'ACTIVE';
  });

  protected readonly reserving = signal<Goal | null>(null);
  protected readonly reserveOpen = signal(false);

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'create-goal',
      label: this.t().emptyState.goals.createGoal,
      available: true,
      primary: true,
      link: '/goals/new',
    },
  ]);

  constructor() {
    // Um cadastro foi salvo no modal por cima desta página: relê do backend.
    this.changes
      .of('goals')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.goals.load(this.filter()));
    this.creating.saved$.pipe(takeUntilDestroyed()).subscribe((goal) => {
      this.toast.show(this.t().goals.payoff.created);
      void this.router.navigate(['/goals', goal.id]);
    });
    effect(() => {
      const status = this.filter();
      untracked(() => this.goals.load(status));
    });
  }

  /** "Quitar todas as dívidas": sem nome nem alvo, o servidor usa o nome padrão e a meta nasce "montando". */
  protected createPayoff(): void {
    this.creating.dismissProblem();
    this.creating.save({
      kind: 'create',
      input: { kind: 'DEBT_PAYOFF', name: '', target: '', deadline: null, description: null },
    });
  }

  protected retry(): void {
    this.goals.load(this.filter());
  }

  protected openReserve(goal: Goal): void {
    this.reserving.set(goal);
    this.reserveOpen.set(true);
  }

  /** Reservou ou liberou: o backend pode ter mudado o status (atingida), então recarrega a lista. */
  protected afterReserve(): void {
    this.reserveOpen.set(false);
    this.goals.load(this.filter());
  }
}
