import { Provider } from '@angular/core';

import { AccountsGateway } from '~/modules/accounts/core/interfaces/accounts.gateway';
import { AccountsRequestsFacade } from '~/modules/accounts/infra/facades/accounts-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideAccounts(): Provider[] {
  return [{ provide: AccountsGateway, useExisting: AccountsRequestsFacade }];
}
