import { Provider } from '@angular/core';

import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import { CardsRequestsFacade } from '~/modules/cards/infra/facades/cards-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideCards(): Provider[] {
  return [{ provide: CardsGateway, useExisting: CardsRequestsFacade }];
}
