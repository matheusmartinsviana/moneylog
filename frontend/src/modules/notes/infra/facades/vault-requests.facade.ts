import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, from, map, Observable, of, switchMap, throwError } from 'rxjs';

import { VaultGateway } from '~/modules/notes/core/interfaces/vault.gateway';
import type {
  DownloadedFile,
  ImportConflictMode,
  ImportReport,
} from '~/modules/notes/core/types/note';
import { NOTES_ENDPOINTS } from '~/modules/notes/infra/endpoints';
import { toImportReport } from '~/modules/notes/infra/facades/notes-response.mapper';
import type { ImportReportResponse } from '~/modules/notes/infra/responses/note.response';
import {
  MOCK_IMPORT_REPORT,
  MOCK_VAULT_FILENAME,
  MOCK_VAULT_ZIP,
} from '~/modules/notes/mock-data/empty-notes';
import { problemFromBlobError } from '~/util/api/blob-problem';
import { safeFilenameFromContentDisposition } from '~/util/api/content-disposition';
import { ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

/**
 * Facade de requisições do vault (FE 05). O zip sai como `Blob` por uma requisição autenticada (nunca por
 * link com token); o nome vem do `Content-Disposition` endurecido. A importação manda o `multipart/form-data`
 * (`file`) com `mode` na **query** (contrato). Nada do conteúdo do zip é lido no front.
 */
@Injectable({ providedIn: 'root' })
export class VaultRequestsFacade extends VaultGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  export(): Observable<DownloadedFile> {
    if (this.useMocks) {
      return of({
        blob: new Blob([MOCK_VAULT_ZIP], { type: 'application/zip' }),
        filename: MOCK_VAULT_FILENAME,
      });
    }
    return this.http
      .get(NOTES_ENDPOINTS.vaultExport, { observe: 'response', responseType: 'blob' })
      .pipe(
        map((response: HttpResponse<Blob>) => ({
          blob: response.body ?? new Blob([]),
          filename: safeFilenameFromContentDisposition(
            response.headers.get('Content-Disposition'),
            MOCK_VAULT_FILENAME,
          ),
        })),
        catchError((error: unknown) =>
          from(problemFromBlobError(error)).pipe(
            switchMap((problem) => throwError(() => new ProblemError(problem))),
          ),
        ),
      );
  }

  import(file: File, mode: ImportConflictMode): Observable<ImportReport> {
    if (this.useMocks) return of(toImportReport(MOCK_IMPORT_REPORT));
    const form = new FormData();
    form.append('file', file, file.name);
    const params = new HttpParams().set('mode', mode);
    return this.http.post<ImportReportResponse>(NOTES_ENDPOINTS.vaultImport, form, { params }).pipe(
      map(toImportReport),
      catchError((error: unknown) => {
        const problem = toProblem(error);
        // O proxy/servidor recusa o corpo grande com 413 sem o corpo do contrato: é o caso de `VAULT_IMPORT_TOO_LARGE`.
        return throwError(
          () =>
            new ProblemError(
              problem.status === 413 ? { ...problem, code: 'VAULT_IMPORT_TOO_LARGE' } : problem,
            ),
        );
      }),
    );
  }
}
