import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { ThirdPartyReceivablesFacade } from '~/modules/third-parties/core/facades/third-party-receivables.facade';
import { isPositive } from '~/util/money';

/**
 * "A receber de terceiros" no Início (smart, opcional): o que o servidor devolve (a receber, já recebido
 * e falta receber), fora de patrimônio e renda. Só aparece com algum valor; carregando, erro ou tudo zero
 * somem sem ruído (o Início segue de pé). Escopo próprio: a facade nasce com o cartão.
 */
@Component({
  selector: 'app-third-party-summary-card',
  imports: [RouterLink, MoneyComponent, SectionContainerComponent],
  providers: [ThirdPartyReceivablesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @if (receivables.data(); as data) {
        <app-section-container [heading]="t().thirdParties.home.title">
          <p class="total" data-cy="home-third-parties-pending">
            <span class="total__label">{{ t().thirdParties.total.pending }}</span>
            <app-money [value]="data.pending" />
          </p>
          <dl class="parts">
            <div>
              <dt>{{ t().thirdParties.total.owed }}</dt>
              <dd><app-money [value]="data.owed" /></dd>
            </div>
            <div>
              <dt>{{ t().thirdParties.total.received }}</dt>
              <dd><app-money [value]="data.received" /></dd>
            </div>
          </dl>
          <p class="note">{{ t().thirdParties.total.note }}</p>
          <a class="button" routerLink="/planning/third-parties" data-cy="home-third-parties-open">
            {{ t().thirdParties.home.open }}
          </a>
        </app-section-container>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .total {
      margin: 0 0 var(--space-3);
      font-size: var(--text-2xl);
      font-weight: var(--weight-semibold);
    }

    .total__label {
      display: block;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-regular);
    }

    .parts {
      display: grid;
      gap: var(--space-2);
      margin: 0 0 var(--space-3);
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

    .note {
      margin: 0 0 var(--space-4);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class ThirdPartySummaryCardComponent implements OnInit {
  protected readonly t = inject(I18nService).t;
  protected readonly receivables = inject(ThirdPartyReceivablesFacade);

  /** Só mostra o que o servidor devolveu: some quando a posição inteira é zero. */
  protected readonly visible = computed(() => {
    const data = this.receivables.data();
    return (
      data !== null &&
      (isPositive(data.owed) || isPositive(data.received) || isPositive(data.pending))
    );
  });

  ngOnInit(): void {
    this.receivables.load(null);
  }
}
