import { Provider } from '@angular/core';

import { DebtOverviewGateway } from '~/modules/debt-overview/core/interfaces/debt-overview.gateway';
import { DebtOverviewRequestsFacade } from '~/modules/debt-overview/infra/facades/debt-overview-requests.facade';

/** Liga a porta do core à implementação da infra (rotas lazy, `lazy-providers.ts`, S-31). */
export function provideDebtOverview(): Provider[] {
  return [{ provide: DebtOverviewGateway, useExisting: DebtOverviewRequestsFacade }];
}
