import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { EndRecurrenceSheetComponent } from '~/app/features/planning/components/end-recurrence-sheet/end-recurrence-sheet.component';
import { FixedCostsSummaryComponent } from '~/app/features/planning/components/fixed-costs-summary/fixed-costs-summary.component';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import { RecurrenceRowComponent } from '~/app/features/planning/components/recurrence-row/recurrence-row.component';
import { RecurrencesListFacade } from '~/modules/recurrences/core/facades/recurrences-list.facade';
import type { Recurrence } from '~/modules/recurrences/core/types/recurrence';

/**
 * Recorrências (smart, T87): o custo fixo e a receita recorrente mensais (**estimativa**, do backend) e a
 * lista com frequência, próxima ocorrência e valor. Encerrar pede uma data e desativar pede confirmação;
 * ambos usam a recorrência da resposta e recarregam a estimativa. Estados: carregando, vazio (com ação),
 * erro (com "tentar de novo") e a estimativa com estado próprio.
 */
@Component({
  selector: 'app-recurrences-page',
  imports: [
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    PlanningNavComponent,
    FixedCostsSummaryComponent,
    RecurrenceRowComponent,
    EndRecurrenceSheetComponent,
  ],
  providers: [RecurrencesListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurrences.page.html',
  styleUrl: './recurrences.page.css',
})
export class RecurrencesPage implements OnInit {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly recurrences = inject(RecurrencesListFacade);

  protected readonly ending = signal<Recurrence | null>(null);
  protected readonly deactivating = signal<Recurrence | null>(null);

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add-recurrence',
      label: this.t().emptyState.planning.addRecurrence,
      available: true,
      primary: true,
      link: '/planning/recurrences/new',
    },
  ]);
  protected readonly deactivateTitle = computed(() =>
    interpolate(this.t().recurrences.deactivateConfirm.title, {
      name: this.deactivating()?.description ?? '',
    }),
  );
  protected readonly actionError = computed(() => {
    const problem = this.recurrences.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  constructor() {
    // Encerrar ou desativar deu certo: fecha e avisa (a lista já tem a recorrência da resposta).
    this.recurrences.done$.pipe(takeUntilDestroyed()).subscribe(({ action }) => {
      const copy = this.t().recurrences.toast;
      if (action === 'end') {
        this.ending.set(null);
        this.toast.show(copy.ended);
      } else {
        this.deactivating.set(null);
        this.toast.show(copy.deactivated);
      }
    });
  }

  ngOnInit(): void {
    this.recurrences.load();
  }

  protected askEnd(recurrence: Recurrence): void {
    this.recurrences.clearProblem();
    this.ending.set(recurrence);
  }

  protected confirmEnd(date: string): void {
    const recurrence = this.ending();
    if (recurrence) this.recurrences.end(recurrence.id, date);
  }

  protected askDeactivate(recurrence: Recurrence): void {
    this.recurrences.clearProblem();
    this.deactivating.set(recurrence);
  }

  protected confirmDeactivate(): void {
    const recurrence = this.deactivating();
    if (recurrence) this.recurrences.deactivate(recurrence.id);
  }

  protected cancelDeactivate(): void {
    if (!this.recurrences.busy()) this.deactivating.set(null);
  }

  protected retry(): void {
    this.recurrences.load();
  }
}
