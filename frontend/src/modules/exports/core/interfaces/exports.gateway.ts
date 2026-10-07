import { Observable } from 'rxjs';

import type { DownloadedFile, TransactionsExportQuery } from '~/modules/exports/core/types/export';

/**
 * Porta de exportação. O download é uma requisição autenticada (Bearer pelo interceptor) que devolve o
 * arquivo em memória: nunca um link com token na URL. Falha com `ProblemError`.
 */
export abstract class ExportsGateway {
  abstract transactionsCsv(query: TransactionsExportQuery): Observable<DownloadedFile>;
  abstract backup(): Observable<DownloadedFile>;
}
