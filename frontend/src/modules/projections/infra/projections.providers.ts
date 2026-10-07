import { Provider } from '@angular/core';

import { ProjectionsGateway } from '~/modules/projections/core/interfaces/projections.gateway';
import { ProjectionsRequestsFacade } from '~/modules/projections/infra/facades/projections-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideProjections(): Provider[] {
  return [{ provide: ProjectionsGateway, useExisting: ProjectionsRequestsFacade }];
}
