import { Provider } from '@angular/core';

import {
  DEMO_REPORTS_GATEWAY,
  ReportsGateway,
} from '~/modules/reports/core/interfaces/reports.gateway';
import { ReportsDemoFacade } from '~/modules/reports/infra/facades/reports-demo.facade';
import { ReportsRequestsFacade } from '~/modules/reports/infra/facades/reports-requests.facade';

/**
 * Versão de desenvolvimento de `reports.providers.ts` (substitui o arquivo nos builds `development` e `mock`
 * e é o que os testes usam): a porta real continua HTTP (o Início nunca mostra demonstração) e o UI Kit
 * recebe a porta de **demonstração** por `DEMO_REPORTS_GATEWAY`, com as fixtures. Nunca entra no build de
 * produção; o E2E de produção falha se `demo-housing` aparecer no `dist`.
 */
export function provideReports(): Provider[] {
  return [
    { provide: ReportsGateway, useClass: ReportsRequestsFacade },
    { provide: DEMO_REPORTS_GATEWAY, useClass: ReportsDemoFacade },
  ];
}
