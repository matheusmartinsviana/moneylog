import { Provider } from '@angular/core';

import { MonthlySummaryGateway } from '~/modules/monthly-summary/core/interfaces/monthly-summary.gateway';
import { MonthlySummaryRequestsFacade } from '~/modules/monthly-summary/infra/facades/monthly-summary-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideMonthlySummary(): Provider[] {
  return [{ provide: MonthlySummaryGateway, useExisting: MonthlySummaryRequestsFacade }];
}
