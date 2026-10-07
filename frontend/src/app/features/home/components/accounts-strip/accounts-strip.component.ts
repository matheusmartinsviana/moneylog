import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import type { IconName } from '~/app/common/components/icon/icons';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Account, AccountType } from '~/modules/accounts/core/types/account';
import type { Card } from '~/modules/cards/core/types/card';

/** Tom da identidade da conta (D6): derivado do tipo, sem campo `appearance` (o backend não o tem). */
type Tone = 'accent' | 'positive' | 'warning' | 'neutral';

const TONE: Readonly<Record<AccountType, Tone>> = {
  CHECKING: 'accent',
  SAVINGS: 'positive',
  WALLET: 'warning',
  INVESTMENT: 'neutral',
};

const ICON: Readonly<Record<AccountType, IconName>> = {
  CHECKING: 'accounts',
  SAVINGS: 'goals',
  WALLET: 'more',
  INVESTMENT: 'insights',
};

/**
 * Strip de contas do Início (DS 02, T203), no estilo Wallet **sem parecer cartão físico** (nada de chip, relevo
 * nem gradiente): cada conta é um cartão com um glifo em tom derivado do tipo, o nome, a instituição e o saldo
 * atual do backend (negativo em tom de risco **com o sinal**). Contas ativas só (arquivadas não entram). O
 * cartão de crédito aparece como **"Fatura atual"** (nunca como saldo negativo de conta, ADR-006) com os valores do
 * backend. Rola na horizontal com `scroll-snap`; cada cartão é um link focável (`.lift`). Presentational.
 */
@Component({
  selector: 'app-accounts-strip',
  imports: [RouterLink, MoneyComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="strip" [attr.aria-label]="t().dashboard.accounts.listLabel" data-cy="home-accounts">
      @for (account of accounts(); track account.id) {
        <li class="strip__item">
          <a
            class="tile lift"
            [attr.data-tone]="tone(account)"
            [routerLink]="['/accounts', account.id]"
            [attr.aria-label]="openLabel()(account.name)"
            [attr.data-cy]="'home-account-' + account.id"
          >
            <span class="tile__glyph" aria-hidden="true">
              <app-icon [name]="icon(account)" [size]="18" />
            </span>
            <span class="tile__name">{{ account.name }}</span>
            <span class="tile__meta">{{
              account.institution ?? t().accounts.types[account.type]
            }}</span>
            <span
              class="tile__value"
              [class.is-negative]="account.currentBalance.amount.startsWith('-')"
              [attr.data-cy]="'home-account-balance-' + account.id"
              ><app-money [value]="account.currentBalance"
            /></span>
            @if (account.uncovered) {
              <span class="tile__note" [attr.data-cy]="'home-account-uncovered-' + account.id">{{
                t().accounts.uncovered
              }}</span>
            }
          </a>
        </li>
      }
      @for (card of cards(); track card.id) {
        <li class="strip__item">
          <a
            class="tile tile--invoice lift"
            data-tone="neutral"
            [routerLink]="['/cards', card.id]"
            [attr.aria-label]="openLabel()(card.name)"
            [attr.data-cy]="'home-card-tile-' + card.id"
          >
            <span class="tile__glyph" aria-hidden="true"
              ><app-icon name="cards" [size]="18"
            /></span>
            <span class="tile__name">{{ card.name }}</span>
            <span class="tile__meta">{{
              card.currentInvoice
                ? t().dashboard.accounts.invoiceTitle
                : t().dashboard.accounts.noInvoice
            }}</span>
            @if (card.currentInvoice; as invoice) {
              <span class="tile__value" [attr.data-cy]="'home-card-invoice-' + card.id"
                ><app-money [value]="invoice.total"
              /></span>
            }
            <span class="tile__note" [class.is-negative]="card.overLimit">
              {{ t().dashboard.accounts.limitAvailable }}:
              <app-money [value]="card.availableLimit" />
              @if (card.overLimit) {
                · {{ t().dashboard.accounts.overLimit }}
              }
            </span>
          </a>
        </li>
      }
    </ul>
  `,
  styleUrl: './accounts-strip.component.css',
})
export class AccountsStripComponent {
  protected readonly t = inject(I18nService).t;

  readonly accounts = input.required<readonly Account[]>();
  readonly cards = input<readonly Card[]>([]);

  protected readonly tone = (account: Account): Tone => TONE[account.type];
  protected readonly icon = (account: Account): IconName => ICON[account.type];

  protected readonly openLabel = computed(
    () =>
      (name: string): string =>
        interpolate(this.t().dashboard.accounts.open, { name }),
  );
}
