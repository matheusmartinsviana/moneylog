import { Provider } from '@angular/core';

import { CommitmentsGateway } from '~/modules/commitments/core/interfaces/commitments.gateway';
import { CommitmentsRequestsFacade } from '~/modules/commitments/infra/facades/commitments-requests.facade';

/** Liga a porta do core à implementação da infra (rotas lazy, `lazy-providers.ts`, S-31). */
export function provideCommitments(): Provider[] {
  return [{ provide: CommitmentsGateway, useExisting: CommitmentsRequestsFacade }];
}
