import { Provider } from '@angular/core';

import { DashboardGateway } from '~/modules/dashboard/core/interfaces/dashboard.gateway';
import { DashboardRequestsFacade } from '~/modules/dashboard/infra/facades/dashboard-requests.facade';

/**
 * Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto
 * (S-31, exceção no `.dependency-cruiser.cjs`).
 */
export function provideDashboard(): Provider[] {
  return [{ provide: DashboardGateway, useExisting: DashboardRequestsFacade }];
}
