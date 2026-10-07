import { Provider } from '@angular/core';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import { AiRequestsFacade } from '~/modules/ai/infra/facades/ai-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideAi(): Provider[] {
  return [{ provide: AiGateway, useExisting: AiRequestsFacade }];
}
