import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { DebtOverviewFacade } from '~/modules/debt-overview/core/facades/debt-overview.facade';

/**
 * "Você deve" no Início (smart, sucinto): o total **como o servidor calculou**, com link para a página de dívidas
 * totais (as três partes ficam lá). Nada cadastrado convida a cadastrar, sem número; erro degrada só este cartão
 * (o Início segue de pé) com "Tentar de novo". Escopo próprio: a facade nasce com o cartão.
 */
@Component({
  selector: 'app-debt-summary-card',
  imports: [RouterLink, MoneyComponent],
  providers: [DebtOverviewFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Só o total e o link; as três partes ficam na página de dívidas totais. -->
    <section class="brief glass" aria-labelledby="home-debts-title" data-cy="home-debts-brief">
      <h2 class="brief__title" id="home-debts-title">{{ t().debtOverview.home.title }}</h2>
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
          <a class="brief__link hit" routerLink="/planning/debts" data-cy="home-debts-add">
            {{ t().debtOverview.home.emptyAction }}
          </a>
        }
        @case ('ready') {
          @if (overview.data(); as data) {
            <p class="brief__total num" data-cy="home-debts-total">
              <app-money [value]="data.total" />
            </p>
            <a class="brief__link hit" routerLink="/planning/debts" data-cy="home-debts-open">
              {{ t().debtOverview.home.open }}
            </a>
          }
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .note {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .brief {
      display: grid;
      align-content: center;
      gap: var(--space-1);
      height: 100%;
      min-height: 0;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-panel);
    }

    .brief__title {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .brief__total {
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
    }

    .brief__link {
      width: fit-content;
      color: var(--color-accent);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      text-decoration: none;
    }

    .brief__link:hover {
      text-decoration: underline;
    }

    .brief__link:focus-visible {
      border-radius: 4px;
      outline: none;
      box-shadow: var(--focus-ring);
    }

    /* Celular: título, total e link numa linha só (o gráfico fica com a altura). */
    @container (width < 40rem) {
      .brief {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
        padding: var(--space-2) var(--space-3);
      }

      .brief__total {
        font-size: var(--text-lg);
      }

      .brief__link {
        margin-left: auto;
      }
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
