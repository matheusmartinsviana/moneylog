import { Provider } from '@angular/core';

import { GoalPhotosGateway } from '~/modules/goals/core/interfaces/goal-photos.gateway';
import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import { GoalPhotosRequestsFacade } from '~/modules/goals/infra/facades/goal-photos-requests.facade';
import { GoalsRequestsFacade } from '~/modules/goals/infra/facades/goals-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideGoals(): Provider[] {
  return [
    { provide: GoalsGateway, useExisting: GoalsRequestsFacade },
    { provide: GoalPhotosGateway, useExisting: GoalPhotosRequestsFacade },
  ];
}
