import { Provider } from '@angular/core';

import { ThirdPartiesGateway } from '~/modules/third-parties/core/interfaces/third-parties.gateway';
import { ThirdPartiesRequestsFacade } from '~/modules/third-parties/infra/facades/third-parties-requests.facade';

/** Liga a porta do core à implementação da infra (rotas lazy, `lazy-providers.ts`, S-31). */
export function provideThirdParties(): Provider[] {
  return [{ provide: ThirdPartiesGateway, useExisting: ThirdPartiesRequestsFacade }];
}
