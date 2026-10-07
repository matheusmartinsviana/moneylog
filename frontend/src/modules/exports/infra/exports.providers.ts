import { Provider } from '@angular/core';

import { ExportsGateway } from '~/modules/exports/core/interfaces/exports.gateway';
import { ExportsRequestsFacade } from '~/modules/exports/infra/facades/exports-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideExports(): Provider[] {
  return [{ provide: ExportsGateway, useExisting: ExportsRequestsFacade }];
}
