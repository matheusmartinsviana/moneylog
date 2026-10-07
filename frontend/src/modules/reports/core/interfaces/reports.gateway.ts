import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  IncomeExpenseSeries,
  ReportPeriod,
  SpendingByCategory,
} from '~/modules/reports/core/types/reports';

/**
 * Porta dos relatórios do Início (contrato 2.6.0): `GET /v1/reports/income-expenses` e
 * `GET /v1/reports/spending-by-category`. Em produção a implementação é HTTP (`ReportsRequestsFacade`); a de
 * demonstração (`isDemo`) só existe nos builds de desenvolvimento e mock, atrás de `DEMO_REPORTS_GATEWAY`.
 */
export abstract class ReportsGateway {
  /** `true` só na implementação de demonstração (fixtures); toda tela que a use precisa rotulá-la. */
  abstract readonly isDemo: boolean;
  abstract incomeExpenses(period: ReportPeriod): Observable<IncomeExpenseSeries>;
  /** `month` = competência `YYYY-MM`; `limit` de 1 a 10 (padrão 5). */
  abstract spendingByCategory(month: string, limit?: number): Observable<SpendingByCategory>;
}

/**
 * Porta de **demonstração** dos relatórios, só para o UI Kit (`features/dev`). `null` fora dos builds de
 * desenvolvimento e mock: o `reports.providers.dev.ts` a liga e a de produção não a conhece, então nenhuma
 * fixture entra no bundle de produção (revisão A1, FE-S-230).
 */
export const DEMO_REPORTS_GATEWAY = new InjectionToken<ReportsGateway | null>(
  'DEMO_REPORTS_GATEWAY',
  { providedIn: 'root', factory: () => null },
);
