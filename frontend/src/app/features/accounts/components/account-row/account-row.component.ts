import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import type { IconName } from '~/app/common/components/icon/icons';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { AccountTypeLabelComponent } from '~/app/features/accounts/components/account-type-label/account-type-label.component';
import type { Account, AccountType } from '~/modules/accounts/core/types/account';
import { isNegative } from '~/util/money';

const TONE: Readonly<Record<AccountType, string>> = {
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
 * Uma conta na lista, no estilo Wallet do workspace (DS 02, T213): cartão com glifo em tom do tipo (o mesmo do
 * Início), sem parecer cartão físico. Presentational: mostra o saldo
 * que a API calculou (`currentBalance`, nunca somado aqui) e só habilita "Arquivar" quando
 * `archivable` é `true`. Saldo negativo aparece na cor de risco e sem bloquear nada (S-5).
 */
@Component({
  selector: 'li[app-account-row]',
  imports: [RouterLink, IconComponent, MoneyComponent, AccountTypeLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-row.component.html',
  styleUrl: './account-row.component.css',
  host: { class: 'row', '[attr.data-cy]': "'account-row-' + account().id" },
})
export class AccountRowComponent {
  protected readonly t = inject(I18nService).t;

  readonly account = input.required<Account>();
  readonly archive = output<Account>();
  readonly unarchive = output<Account>();

  protected readonly tone = computed(() => TONE[this.account().type]);
  protected readonly icon = computed(() => ICON[this.account().type]);

  protected negative(account: Account): boolean {
    return isNegative(account.currentBalance);
  }
}
