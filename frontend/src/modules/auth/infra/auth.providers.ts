import { Provider } from '@angular/core';

import { AuthGateway } from '~/modules/auth/core/interfaces/auth.gateway';
import { AuthRequestsFacade } from '~/modules/auth/infra/facades/auth-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideAuth(): Provider[] {
  return [{ provide: AuthGateway, useExisting: AuthRequestsFacade }];
}
