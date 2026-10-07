import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Card } from '~/modules/cards/core/types/card';

/**
 * Cartões no Início (T71, presentational): por cartão, o disponível, o **total comprometido** (fatura
 * corrente + fechadas) e, **em linha separada**, o que já foi comprometido em compras futuras. Os dois
 * valores vêm do backend (`totalCommitted` e `committedFuture`) e nunca se somam aqui (PR 01, regra 1);
 * a nota explica a diferença. Acima do limite aparece com texto, não só cor.
 */
@Component({
  selector: 'app-cards-summary',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="cards" data-cy="home-cards">
      @for (card of cards(); track card.id) {
        <li class="card" [attr.data-cy]="'home-card-' + card.id">
          <a
            class="card__name"
            [routerLink]="['/cards', card.id]"
            [attr.aria-label]="openLabel()(card)"
            [attr.data-cy]="'home-card-open-' + card.id"
            >{{ card.name }}</a
          >
          <dl class="ledger">
            <div class="ledger__row">
              <dt class="ledger__label">{{ t().home.cards.available }}</dt>
              <dd
                class="ledger__value"
                [class.is-negative]="card.overLimit"
                [attr.data-cy]="'home-card-available-' + card.id"
              >
                <app-money [value]="card.availableLimit" />
                @if (card.overLimit) {
                  <span class="card__over">{{ t().home.cards.overLimit }}</span>
                }
              </dd>
            </div>
            <div class="ledger__row">
              <dt class="ledger__label">{{ t().home.cards.totalCommitted }}</dt>
              <dd class="ledger__value" [attr.data-cy]="'home-card-total-committed-' + card.id">
                <app-money [value]="card.totalCommitted" />
              </dd>
            </div>
            <div class="ledger__row">
              <dt class="ledger__label">{{ t().home.cards.committedFuture }}</dt>
              <dd class="ledger__value" [attr.data-cy]="'home-card-committed-future-' + card.id">
                <app-money [value]="card.committedFuture" />
              </dd>
            </div>
          </dl>
        </li>
      }
    </ul>
    <p class="note">{{ t().home.cards.note }}</p>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }

    .cards {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .card {
      display: grid;
      gap: var(--space-1);
    }

    .card__name {
      color: var(--color-text);
      font-weight: var(--weight-semibold);
      text-decoration: none;
    }

    .card__over {
      margin-left: var(--space-2);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .note {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      text-wrap: pretty;
    }
  `,
})
export class CardsSummaryComponent {
  protected readonly t = inject(I18nService).t;

  readonly cards = input.required<readonly Card[]>();

  protected readonly openLabel = computed(
    () =>
      (card: Card): string =>
        interpolate(this.t().home.cards.open, { name: card.name }),
  );
}
