import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import type { AccountType } from '~/modules/accounts/core/types/account';

/** Nome do tipo de conta no idioma da UI. Presentational. */
@Component({
  selector: 'app-account-type-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ t().accounts.types[type()] }}`,
})
export class AccountTypeLabelComponent {
  protected readonly t = inject(I18nService).t;
  readonly type = input.required<AccountType>();
}
