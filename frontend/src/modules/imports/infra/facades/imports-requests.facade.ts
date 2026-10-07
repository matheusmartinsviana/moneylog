import {
  HttpClient,
  HttpEvent,
  HttpEventType,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, filter, map, Observable, of, throwError } from 'rxjs';

import { ImportsGateway } from '~/modules/imports/core/interfaces/imports.gateway';
import type {
  ImportAction,
  ImportApplied,
  ImportBatch,
  ImportBatchStatus,
  ImportBulkResult,
  ImportLine,
  ImportLinePatch,
  ImportLinesQuery,
  ImportMapping,
  ImportUndone,
  ImportUploadEvent,
  ImportUploadInput,
} from '~/modules/imports/core/types/import';
import { IDEMPOTENCY_HEADER, IMPORTS_ENDPOINTS } from '~/modules/imports/infra/endpoints';
import {
  toApplied,
  toBatch,
  toBulkResult,
  toLine,
  toMapping,
  toMappingRequest,
  toPatchRequest,
  toUndone,
} from '~/modules/imports/infra/facades/imports-response.mapper';
import type {
  ImportAppliedResponse,
  ImportBatchResponse,
  ImportBatchSliceResponse,
  ImportBulkInputRequest,
  ImportBulkResultResponse,
  ImportLineResponse,
  ImportLineSliceResponse,
  ImportMappingResponse,
  ImportUndoneResponse,
  ImportUndoRequest,
} from '~/modules/imports/infra/responses/import.response';
import { EMPTY_IMPORTS } from '~/modules/imports/mock-data/empty-imports';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então nenhum lote existe. */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'IMPORT_BATCH_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de importação: o único lugar com HTTP do módulo. O upload é `multipart/form-data`
 * (o navegador define o `Content-Type` com o boundary) e emite o progresso; `Idempotency-Key` no envio e
 * no aplicar. Com `API_MOCKS` ligado não faz requisição.
 */
@Injectable({ providedIn: 'root' })
export class ImportsRequestsFacade extends ImportsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  upload(input: ImportUploadInput, idempotencyKey: string): Observable<ImportUploadEvent> {
    if (this.useMocks) return notFound();
    const body = new FormData();
    body.append('file', input.file, input.file.name);
    body.append(input.source.kind === 'account' ? 'accountId' : 'cardId', input.source.id);
    if (input.format) body.append('format', input.format);
    if (input.mapping) body.append('mapping', JSON.stringify(toMappingRequest(input.mapping)));
    return this.http
      .post<ImportBatchResponse>(IMPORTS_ENDPOINTS.collection, body, {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((event: HttpEvent<ImportBatchResponse>): ImportUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            return {
              kind: 'progress',
              percent: event.total ? Math.round((event.loaded / event.total) * 100) : null,
            };
          }
          if (event.type === HttpEventType.Response && event.body) {
            return { kind: 'done', batch: toBatch(event.body) };
          }
          return null;
        }),
        filter((event): event is ImportUploadEvent => event !== null),
        catchError(fail),
      );
  }

  list(query: {
    readonly status?: ImportBatchStatus;
    readonly page: number;
    readonly pageSize: number;
  }): Observable<Slice<ImportBatch>> {
    if (this.useMocks) return of(this.toBatchSlice(EMPTY_IMPORTS));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<ImportBatchSliceResponse>(IMPORTS_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toBatchSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<ImportBatch> {
    if (this.useMocks) return notFound();
    return this.http
      .get<ImportBatchResponse>(IMPORTS_ENDPOINTS.item(id))
      .pipe(map(toBatch), catchError(fail));
  }

  lines(id: string, query: ImportLinesQuery): Observable<Slice<ImportLine>> {
    if (this.useMocks) return notFound();
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    if (query.flag) params = params.set('flag', query.flag);
    return this.http.get<ImportLineSliceResponse>(IMPORTS_ENDPOINTS.lines(id), { params }).pipe(
      map((slice) => ({ items: slice.items.map(toLine), hasNext: slice.hasNext })),
      catchError(fail),
    );
  }

  reviewLine(id: string, lineId: string, patch: ImportLinePatch): Observable<ImportLine> {
    if (this.useMocks) return notFound();
    return this.http
      .patch<ImportLineResponse>(IMPORTS_ENDPOINTS.line(id, lineId), toPatchRequest(patch))
      .pipe(map(toLine), catchError(fail));
  }

  bulk(
    id: string,
    lineIds: readonly string[],
    action: Exclude<ImportAction, 'FORCE' | 'REOPEN'>,
  ): Observable<ImportBulkResult> {
    if (this.useMocks) return notFound();
    const body: ImportBulkInputRequest = { lineIds: [...lineIds], action };
    return this.http
      .post<ImportBulkResultResponse>(IMPORTS_ENDPOINTS.bulk(id), body)
      .pipe(map(toBulkResult), catchError(fail));
  }

  apply(id: string, idempotencyKey: string): Observable<ImportApplied> {
    if (this.useMocks) return notFound();
    return this.http
      .post<ImportAppliedResponse>(IMPORTS_ENDPOINTS.apply(id), null, {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toApplied), catchError(fail));
  }

  discard(id: string): Observable<void> {
    if (this.useMocks) return notFound();
    return this.http.delete<void>(IMPORTS_ENDPOINTS.item(id)).pipe(
      map(() => undefined),
      catchError(fail),
    );
  }

  undo(id: string, reason: string | null): Observable<ImportUndone> {
    if (this.useMocks) return notFound();
    const body: ImportUndoRequest = reason ? { reason: reason.trim() } : {};
    return this.http
      .post<ImportUndoneResponse>(IMPORTS_ENDPOINTS.undo(id), body)
      .pipe(map(toUndone), catchError(fail));
  }

  savedMapping(sourceId: string): Observable<ImportMapping | null> {
    if (this.useMocks) return of(null);
    return this.http.get<ImportMappingResponse>(IMPORTS_ENDPOINTS.mapping(sourceId)).pipe(
      map(toMapping),
      catchError((error: unknown) => {
        const problem = toProblem(error);
        // Sem mapeamento salvo (404) não é erro: a tela começa com o padrão.
        return problem.status === 404 ? of(null) : fail(error);
      }),
    );
  }

  private toBatchSlice(slice: ImportBatchSliceResponse): Slice<ImportBatch> {
    return { items: slice.items.map(toBatch), hasNext: slice.hasNext };
  }
}
