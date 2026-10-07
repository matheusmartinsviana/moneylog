import { Provider } from '@angular/core';

import { PeopleGateway } from '~/modules/people/core/interfaces/people.gateway';
import { PeopleRequestsFacade } from '~/modules/people/infra/facades/people-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function providePeople(): Provider[] {
  return [{ provide: PeopleGateway, useExisting: PeopleRequestsFacade }];
}
