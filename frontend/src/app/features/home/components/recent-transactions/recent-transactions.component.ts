import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { TransactionListItemComponent } from '~/app/features/transactions/components/transaction-list-item/transaction-list-item.component';
import type { RecentTransactionsState } from '~/modules/transactions/core/facades/recent-transactions.facade';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { formatIsoDate, relativeDay } from '~/util/date';

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
            <div class="rt__skeleton sk" aria-hidden="true"></div>
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
          <!-- Agrupadas por dia (a data vem do backend; "Hoje" e "Ontem" comparam com o asOf). -->
          <ul class="rt__list" data-cy="home-recent">
            @for (group of groups(); track group.date) {
              <li class="rt__day" [attr.data-cy]="'home-recent-day-' + group.date">
                <h3 class="rt__day-title">{{ group.label }}</h3>
                <ul class="rt__rows">
                  @for (tx of group.items; track tx.id) {
                    <li
                      app-transaction-list-item
                      [transaction]="tx"
                      [glyph]="true"
                      [hideDate]="true"
                      (open)="open($event)"
                    ></li>
                  }
                </ul>
              </li>
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
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly state = input.required<RecentTransactionsState>();
  /** `asOf` do backend (`YYYY-MM-DD`), a referência de "Hoje" e "Ontem". */
  readonly asOf = input.required<string>();
  readonly retry = output<void>();

  protected readonly items = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : [];
  });

  /** Um grupo por dia, na ordem em que o backend entregou (as mais recentes primeiro). */
  protected readonly groups = computed(() => {
    const copy = this.t().dashboard.recent;
    const locale = HTML_LANG[this.i18n.language()];
    const byDate = new Map<string, Transaction[]>();
    for (const tx of this.items()) byDate.set(tx.date, [...(byDate.get(tx.date) ?? []), tx]);
    return [...byDate].map(([date, items]) => {
      const day = relativeDay(date, this.asOf());
      const label =
        day === 'today'
          ? copy.today
          : day === 'yesterday'
            ? copy.yesterday
            : formatIsoDate(date, locale, 'long');
      return { date, label, items };
    });
  });

  protected open(tx: Transaction): void {
    void this.router.navigate(['/transactions', tx.id]);
  }
}
