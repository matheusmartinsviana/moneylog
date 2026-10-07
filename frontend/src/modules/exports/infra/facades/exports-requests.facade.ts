import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, from, map, Observable, of, switchMap, throwError } from 'rxjs';

import { ExportsGateway } from '~/modules/exports/core/interfaces/exports.gateway';
import {
  csvHeaderLanguage,
  type DownloadedFile,
  type TransactionsExportQuery,
} from '~/modules/exports/core/types/export';
import { EXPORTS_ENDPOINTS } from '~/modules/exports/infra/endpoints';
import {
  MOCK_BACKUP,
  MOCK_BACKUP_FILENAME,
  MOCK_CSV,
  MOCK_CSV_FILENAME,
} from '~/modules/exports/mock-data/mock-files';
import { problemFromBlobError } from '~/util/api/blob-problem';
import { safeFilenameFromContentDisposition } from '~/util/api/content-disposition';
import { ProblemError } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

/**
 * Facade de requisições de exportação (FE 05): o único lugar com HTTP do módulo. O arquivo vem como `Blob`
 * por uma requisição com `Authorization` (o interceptor), **nunca** por um link com token na URL; o nome
 * sugerido vem do `Content-Disposition` (com um nome padrão se o header não vier ou não for legível).
 */
@Injectable({ providedIn: 'root' })
export class ExportsRequestsFacade extends ExportsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  transactionsCsv(query: TransactionsExportQuery): Observable<DownloadedFile> {
    if (this.useMocks) {
      return of({
        blob: new Blob([MOCK_CSV], { type: 'text/csv;charset=utf-8' }),
        filename: MOCK_CSV_FILENAME,
      });
    }
    let params = new HttpParams();
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    const headers = query.language
      ? new HttpHeaders().set('Accept-Language', csvHeaderLanguage(query.language))
      : new HttpHeaders();
    return this.download(
      EXPORTS_ENDPOINTS.transactionsCsv,
      params,
      'moneylog-transactions.csv',
      headers,
    );
  }

  backup(): Observable<DownloadedFile> {
    if (this.useMocks) {
      return of({
        blob: new Blob([MOCK_BACKUP], { type: 'application/json' }),
        filename: MOCK_BACKUP_FILENAME,
      });
    }
    return this.download(
      EXPORTS_ENDPOINTS.backup,
      new HttpParams(),
      'moneylog-backup.json',
      new HttpHeaders(),
    );
  }

  private download(
    url: string,
    params: HttpParams,
    fallbackName: string,
    headers: HttpHeaders,
  ): Observable<DownloadedFile> {
    return this.http.get(url, { params, headers, observe: 'response', responseType: 'blob' }).pipe(
      map((response: HttpResponse<Blob>) => ({
        blob: response.body ?? new Blob([]),
        filename: safeFilenameFromContentDisposition(
          response.headers.get('Content-Disposition'),
          fallbackName,
        ),
      })),
      catchError((error: unknown) =>
        from(problemFromBlobError(error)).pipe(
          switchMap((problem) => throwError(() => new ProblemError(problem))),
        ),
      ),
    );
  }
}
