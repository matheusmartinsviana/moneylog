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
import { RouterLink } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { GoalCardComponent } from '~/app/features/goals/components/goal-card/goal-card.component';
import { ReserveSheetComponent } from '~/app/features/goals/components/reserve-sheet/reserve-sheet.component';
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
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GoalCardComponent,
    ReserveSheetComponent,
  ],
  providers: [GoalsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goals.page.html',
  styleUrl: './goals.page.css',
})
export class GoalsPage {
  protected readonly t = inject(I18nService).t;
  protected readonly goals = inject(GoalsListFacade);

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
    effect(() => {
      const status = this.filter();
      untracked(() => this.goals.load(status));
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
