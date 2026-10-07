import { Provider } from '@angular/core';

import { ReportsGateway } from '~/modules/reports/core/interfaces/reports.gateway';
import { ReportsRequestsFacade } from '~/modules/reports/infra/facades/reports-requests.facade';

/**
 * Liga a porta dos relatórios à implementação HTTP. Só o bootstrap (`app.config.ts`) chama isto (S-31).
 * Os builds `development` e `mock` trocam este arquivo por `reports.providers.dev.ts` (`fileReplacements`),
 * que mantém a mesma porta HTTP e acrescenta a porta de demonstração do UI Kit; a produção não a conhece.
 */
export function provideReports(): Provider[] {
  return [{ provide: ReportsGateway, useClass: ReportsRequestsFacade }];
}
