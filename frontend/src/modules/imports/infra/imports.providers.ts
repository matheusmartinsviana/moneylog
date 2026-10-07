import { Provider } from '@angular/core';

import { ImportsGateway } from '~/modules/imports/core/interfaces/imports.gateway';
import { ImportsRequestsFacade } from '~/modules/imports/infra/facades/imports-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideImports(): Provider[] {
  return [{ provide: ImportsGateway, useExisting: ImportsRequestsFacade }];
}
