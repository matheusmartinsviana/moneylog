import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { TransactionListItemComponent } from '~/app/features/transactions/components/transaction-list-item/transaction-list-item.component';
import type { RecentTransactionsState } from '~/modules/transactions/core/facades/recent-transactions.facade';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { relativeDay } from '~/util/date';

/**
 * "Recentes" do Início (DS 02, T206): as últimas movimentações **até `asOf`** numa lista limpa (reaproveita o
 * `transaction-list-item`, com glifo da categoria e destaque suave no hover/foco). "Hoje" e "Ontem" são rótulos de
 * apresentação comparados com o `asOf` do backend (nunca com o relógio do aparelho). A linha abre a
 * movimentação. Presentational (só o roteador).
 */
@Component({
  selector: 'app-recent-transactions',
  imports: [RouterLink, SectionContainerComponent, TransactionListItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container [heading]="t().dashboard.recent.title">
      @switch (state().status) {
        @case ('loading') {
          <div data-cy="home-recent-loading">
            <p class="visually-hidden" role="status">{{ t().dashboard.recent.loading }}</p>
            <div class="rt__skeleton" aria-hidden="true"></div>
          </div>
        }
        @case ('error') {
          <div class="rt__state" role="alert" data-cy="home-recent-error">
            <p>{{ t().dashboard.recent.error }}</p>
            <button type="button" class="button" data-cy="home-recent-retry" (click)="retry.emit()">
              {{ t().dashboard.recent.retry }}
            </button>
          </div>
        }
        @case ('empty') {
          <p class="rt__state" data-cy="home-recent-empty">{{ t().dashboard.recent.empty }}</p>
        }
        @default {
          <ul class="rt__list" data-cy="home-recent">
            @for (tx of items(); track tx.id) {
              <li
                app-transaction-list-item
                [transaction]="tx"
                [glyph]="true"
                [dateLabel]="dayLabel(tx)"
                (open)="open($event)"
              ></li>
            }
          </ul>
        }
      }
      <a class="rt__all" routerLink="/transactions" data-cy="home-recent-all">{{
        t().dashboard.recent.viewAll
      }}</a>
    </app-section-container>
  `,
  styleUrl: './recent-transactions.component.css',
})
export class RecentTransactionsComponent {
  private readonly router = inject(Router);
  protected readonly t = inject(I18nService).t;

  readonly state = input.required<RecentTransactionsState>();
  /** `asOf` do backend (`YYYY-MM-DD`), a referência de "Hoje" e "Ontem". */
  readonly asOf = input.required<string>();
  readonly retry = output<void>();

  protected readonly items = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : [];
  });

  protected readonly dayLabel = (tx: Transaction): string | null => {
    const day = relativeDay(tx.date, this.asOf());
    const copy = this.t().dashboard.recent;
    return day === 'today' ? copy.today : day === 'yesterday' ? copy.yesterday : null;
  };

  protected open(tx: Transaction): void {
    void this.router.navigate(['/transactions', tx.id]);
  }
}
