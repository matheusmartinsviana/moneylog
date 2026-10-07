import { Provider } from '@angular/core';

import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import { GoalsRequestsFacade } from '~/modules/goals/infra/facades/goals-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideGoals(): Provider[] {
  return [{ provide: GoalsGateway, useExisting: GoalsRequestsFacade }];
}
