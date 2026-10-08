import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { CommitmentRowComponent } from '~/app/features/planning/components/commitment-row/commitment-row.component';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import { CommitmentsListFacade } from '~/modules/commitments/core/facades/commitments-list.facade';

/**
 * Compromissos acompanhados (smart): empréstimos de terceiros e projetos de longo prazo, num bloco **à
 * parte** (fora do total de dívidas, sem mexer em contas). Cadastrar abre em modal sobre a lista; ao
 * fechar, a lista é relida do backend.
 */
@Component({
  selector: 'app-commitments-page',
  imports: [
    RouterLink,
    RouterOutlet,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PlanningNavComponent,
    CommitmentRowComponent,
  ],
  providers: [CommitmentsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commitments.page.html',
  styleUrl: './commitments.page.css',
})
export class CommitmentsPage implements OnInit {
  protected readonly t = inject(I18nService).t;
  protected readonly commitments = inject(CommitmentsListFacade);

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add',
      label: this.t().commitments.empty.action,
      available: true,
      primary: true,
      link: '/planning/commitments/new',
    },
  ]);

  ngOnInit(): void {
    this.commitments.load();
  }

  protected retry(): void {
    this.commitments.load();
  }
}
