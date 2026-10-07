import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { DebtOverviewFacade } from '~/modules/debt-overview/core/facades/debt-overview.facade';

/**
 * "Você deve" no Início (smart): o total e as três partes **como o servidor calculou**, com link para a
 * página de dívidas totais. Nada cadastrado convida a cadastrar, sem número; erro degrada só este cartão
 * (o Início segue de pé) com "Tentar de novo". Escopo próprio: a facade nasce com o cartão.
 */
@Component({
  selector: 'app-debt-summary-card',
  imports: [RouterLink, MoneyComponent, SectionContainerComponent],
  providers: [DebtOverviewFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container [heading]="t().debtOverview.home.title">
      @switch (overview.state().status) {
        @case ('loading') {
          <p class="note" role="status" data-cy="home-debts-loading">
            {{ t().debtOverview.home.loading }}
          </p>
        }
        @case ('error') {
          <p class="note" role="alert" data-cy="home-debts-error">
            {{ t().debtOverview.home.error }}
          </p>
          <button type="button" class="button" data-cy="home-debts-retry" (click)="overview.load()">
            {{ t().debtOverview.home.retry }}
          </button>
        }
        @case ('empty') {
          <p class="note" data-cy="home-debts-empty">{{ t().debtOverview.home.empty }}</p>
          <a class="button" routerLink="/planning/debts" data-cy="home-debts-add">
            {{ t().debtOverview.home.emptyAction }}
          </a>
        }
        @case ('ready') {
          @if (overview.data(); as data) {
            <p class="total" data-cy="home-debts-total"><app-money [value]="data.total" /></p>
            <dl class="parts" data-cy="home-debts-parts">
              <div>
                <dt>{{ t().debtOverview.parts.cards }}</dt>
                <dd><app-money [value]="data.parts.cards" /></dd>
              </div>
              <div>
                <dt>{{ t().debtOverview.parts.people }}</dt>
                <dd><app-money [value]="data.parts.people" /></dd>
              </div>
              <div>
                <dt>{{ t().debtOverview.parts.other }}</dt>
                <dd><app-money [value]="data.parts.other" /></dd>
              </div>
            </dl>
            <a class="button" routerLink="/planning/debts" data-cy="home-debts-open">
              {{ t().debtOverview.home.open }}
            </a>
          }
        }
      }
    </app-section-container>
  `,
  styles: `
    :host {
      display: block;
    }

    .note {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .total {
      margin: 0 0 var(--space-3);
      font-size: var(--text-2xl);
      font-weight: var(--weight-semibold);
    }

    .parts {
      display: grid;
      gap: var(--space-2);
      margin: 0 0 var(--space-4);
    }

    .parts div {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .parts dt {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .parts dd {
      margin: 0;
      font-weight: var(--weight-semibold);
    }
  `,
})
export class DebtSummaryCardComponent implements OnInit {
  protected readonly t = inject(I18nService).t;
  protected readonly overview = inject(DebtOverviewFacade);

  ngOnInit(): void {
    this.overview.load();
  }
}
