import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { AccountTypeLabelComponent } from '~/app/features/accounts/components/account-type-label/account-type-label.component';
import type { Account } from '~/modules/accounts/core/types/account';
import { isNegative } from '~/util/money';

/**
 * Uma conta na lista (card no celular, linha de tabela no desktop). Presentational: mostra o saldo
 * que a API calculou (`currentBalance`, nunca somado aqui) e só habilita "Arquivar" quando
 * `archivable` é `true`. Saldo negativo aparece na cor de risco e sem bloquear nada (S-5).
 */
@Component({
  selector: 'li[app-account-row]',
  imports: [RouterLink, MoneyComponent, AccountTypeLabelComponent],
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

  protected negative(account: Account): boolean {
    return isNegative(account.currentBalance);
  }
}
