import { Provider } from '@angular/core';

import { DebtsGateway } from '~/modules/debts/core/interfaces/debts.gateway';
import { DebtsRequestsFacade } from '~/modules/debts/infra/facades/debts-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideDebts(): Provider[] {
  return [{ provide: DebtsGateway, useExisting: DebtsRequestsFacade }];
}
