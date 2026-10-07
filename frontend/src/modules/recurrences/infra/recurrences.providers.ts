import { Provider } from '@angular/core';

import { RecurrencesGateway } from '~/modules/recurrences/core/interfaces/recurrences.gateway';
import { RecurrencesRequestsFacade } from '~/modules/recurrences/infra/facades/recurrences-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideRecurrences(): Provider[] {
  return [{ provide: RecurrencesGateway, useExisting: RecurrencesRequestsFacade }];
}
