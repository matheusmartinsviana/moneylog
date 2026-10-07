import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { NotesGateway } from '~/modules/notes/core/interfaces/notes.gateway';
import type {
  Backlink,
  LinkedNotesQuery,
  Note,
  NoteInput,
  NoteLinkRef,
  NoteMoved,
  NotesQuery,
  NoteSummary,
  TagCount,
} from '~/modules/notes/core/types/note';
import { IDEMPOTENCY_HEADER, NOTES_ENDPOINTS } from '~/modules/notes/infra/endpoints';
import {
  toBacklink,
  toCreateRequest,
  toLinkRequest,
  toMoved,
  toNote,
  toSummary,
  toTagCount,
} from '~/modules/notes/infra/facades/notes-response.mapper';
import type {
  BacklinkSliceResponse,
  NoteLinksRequest,
  NoteMovedResponse,
  NoteMoveRequest,
  NoteResponse,
  NoteSummarySliceResponse,
  NoteTagCountResponse,
  NoteUpdateRequest,
} from '~/modules/notes/infra/responses/note.response';
import { EMPTY_NOTES, newMockNote, seededMockNote } from '~/modules/notes/mock-data/empty-notes';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer nota pedida por id não existe (salvo uma semeada pelo E2E). */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'NOTE_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

function summarySlice(slice: NoteSummarySliceResponse): Slice<NoteSummary> {
  return { items: slice.items.map(toSummary), hasNext: slice.hasNext };
}

/**
 * Facade de requisições de notas (FE 05): o único lugar com HTTP do módulo (junto da do vault). Com
 * `API_MOCKS` ligado, responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1/notes`.
 */
@Injectable({ providedIn: 'root' })
export class NotesRequestsFacade extends NotesGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: NotesQuery): Observable<Slice<NoteSummary>> {
    if (this.useMocks) return of(summarySlice(EMPTY_NOTES));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.q) params = params.set('q', query.q);
    if (query.tag) params = params.set('tag', query.tag);
    if (query.folder) params = params.set('folder', query.folder);
    if (query.status) params = params.set('status', query.status);
    if (query.sort) params = params.set('sort', query.sort);
    return this.http
      .get<NoteSummarySliceResponse>(NOTES_ENDPOINTS.collection, { params })
      .pipe(map(summarySlice), catchError(fail));
  }

  get(id: string): Observable<Note> {
    if (this.useMocks) {
      const seeded = seededMockNote(id);
      return seeded ? of(toNote(seeded)) : notFound();
    }
    return this.http
      .get<NoteResponse>(NOTES_ENDPOINTS.item(id))
      .pipe(map(toNote), catchError(fail));
  }

  create(input: NoteInput, idempotencyKey: string): Observable<Note> {
    if (this.useMocks) return of(toNote(newMockNote(idempotencyKey, toCreateRequest(input))));
    return this.http
      .post<NoteResponse>(NOTES_ENDPOINTS.collection, toCreateRequest(input), {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toNote), catchError(fail));
  }

  update(id: string, body: string, version: number): Observable<Note> {
    if (this.useMocks) return notFound();
    const request: NoteUpdateRequest = { body, version };
    return this.http
      .put<NoteResponse>(NOTES_ENDPOINTS.item(id), request)
      .pipe(map(toNote), catchError(fail));
  }

  move(id: string, newPath: string, version: number): Observable<NoteMoved> {
    if (this.useMocks) return notFound();
    const request: NoteMoveRequest = { newPath, version };
    return this.http
      .post<NoteMovedResponse>(NOTES_ENDPOINTS.move(id), request)
      .pipe(map(toMoved), catchError(fail));
  }

  trash(id: string): Observable<Note> {
    if (this.useMocks) return notFound();
    return this.http
      .post<NoteResponse>(NOTES_ENDPOINTS.trashNote(id), null)
      .pipe(map(toNote), catchError(fail));
  }

  restore(id: string): Observable<Note> {
    if (this.useMocks) return notFound();
    return this.http
      .post<NoteResponse>(NOTES_ENDPOINTS.restore(id), null)
      .pipe(map(toNote), catchError(fail));
  }

  emptyTrash(): Observable<void> {
    if (this.useMocks) return of(undefined);
    return this.http.delete<void>(NOTES_ENDPOINTS.trash).pipe(
      map(() => undefined),
      catchError(fail),
    );
  }

  backlinks(id: string, page: number, pageSize: number): Observable<Slice<Backlink>> {
    if (this.useMocks) return of({ items: [], hasNext: false });
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<BacklinkSliceResponse>(NOTES_ENDPOINTS.backlinks(id), { params }).pipe(
      map((slice) => ({ items: slice.items.map(toBacklink), hasNext: slice.hasNext })),
      catchError(fail),
    );
  }

  setLinks(id: string, links: readonly NoteLinkRef[], version: number): Observable<Note> {
    if (this.useMocks) return notFound();
    const request: NoteLinksRequest = { links: links.map(toLinkRequest), version };
    return this.http
      .put<NoteResponse>(NOTES_ENDPOINTS.links(id), request)
      .pipe(map(toNote), catchError(fail));
  }

  linkedTo(query: LinkedNotesQuery): Observable<Slice<NoteSummary>> {
    if (this.useMocks) return of(summarySlice(EMPTY_NOTES));
    let params = new HttpParams()
      .set('targetType', query.type)
      .set('page', query.page)
      .set('pageSize', query.pageSize);
    if (query.id) params = params.set('targetId', query.id);
    if (query.key) params = params.set('targetKey', query.key);
    return this.http
      .get<NoteSummarySliceResponse>(NOTES_ENDPOINTS.linked, { params })
      .pipe(map(summarySlice), catchError(fail));
  }

  tags(): Observable<readonly TagCount[]> {
    if (this.useMocks) return of([]);
    return this.http.get<NoteTagCountResponse[]>(NOTES_ENDPOINTS.tags).pipe(
      map((tags) => tags.map(toTagCount)),
      catchError(fail),
    );
  }
}
