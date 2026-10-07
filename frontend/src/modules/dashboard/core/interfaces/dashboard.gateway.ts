import { Observable } from 'rxjs';

import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';

/**
 * Porta do dashboard (FE 01): o core define, a infra implementa e o bootstrap liga (S-31).
 * As implementações devolvem `DashboardFailure` quando falham.
 */
export abstract class DashboardGateway {
  /** Resumo na data de hoje (`hasAccounts` decide entre o estado vazio e o resumo, S-61) do usuário (o backend decide o "hoje", não o relógio do aparelho). */
  abstract getSummary(): Observable<DashboardSummary>;

  /** Próximos compromissos na janela padrão do backend. */
  abstract getUpcoming(): Observable<Upcoming>;
}
