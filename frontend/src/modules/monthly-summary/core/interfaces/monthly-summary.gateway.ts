import { Observable } from 'rxjs';

import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';

/** Porta do resumo mensal. Falha com `ProblemError` (`SUMMARY_MONTH_INVALID`...). */
export abstract class MonthlySummaryGateway {
  /** `month` = competência `YYYY-MM`. */
  abstract get(month: string): Observable<MonthlySummary>;
}
