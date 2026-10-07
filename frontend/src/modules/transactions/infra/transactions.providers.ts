import { Provider } from '@angular/core';

import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import { TransactionsRequestsFacade } from '~/modules/transactions/infra/facades/transactions-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideTransactions(): Provider[] {
  return [{ provide: TransactionsGateway, useExisting: TransactionsRequestsFacade }];
}
