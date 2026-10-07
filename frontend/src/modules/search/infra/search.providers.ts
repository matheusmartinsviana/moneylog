import { Provider } from '@angular/core';

import { SearchGateway } from '~/modules/search/core/interfaces/search.gateway';
import { SearchRequestsFacade } from '~/modules/search/infra/facades/search-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideSearch(): Provider[] {
  return [{ provide: SearchGateway, useExisting: SearchRequestsFacade }];
}
