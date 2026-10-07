import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { PeopleGateway, PeopleQuery } from '~/modules/people/core/interfaces/people.gateway';
import type {
  Person,
  PersonDetail,
  PersonInput,
  PersonUpdate,
} from '~/modules/people/core/types/person';
import { IDEMPOTENCY_HEADER, PEOPLE_ENDPOINTS } from '~/modules/people/infra/endpoints';
import {
  toCreateRequest,
  toPerson,
  toPersonDetail,
  toUpdateRequest,
} from '~/modules/people/infra/facades/people-response.mapper';
import type {
  PersonDetailResponse,
  PersonResponse,
  PersonSliceResponse,
} from '~/modules/people/infra/responses/person.response';
import { EMPTY_PEOPLE } from '~/modules/people/mock-data/empty-people';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';
import { cleanSearchTerm } from '~/util/search-term';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer pessoa pedida por id não existe. */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'PERSON_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de pessoas (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS`
 * ligado, responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1`.
 */
@Injectable({ providedIn: 'root' })
export class PeopleRequestsFacade extends PeopleGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: PeopleQuery): Observable<Slice<Person>> {
    if (this.useMocks) return of(this.toSlice(EMPTY_PEOPLE));
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    const q = cleanSearchTerm(query.q ?? '').trim();
    if (q !== '') params = params.set('q', q);
    return this.http.get<PersonSliceResponse>(PEOPLE_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<PersonDetail> {
    if (this.useMocks) return notFound();
    return this.http
      .get<PersonDetailResponse>(PEOPLE_ENDPOINTS.item(id))
      .pipe(map(toPersonDetail), catchError(fail));
  }

  create(input: PersonInput, idempotencyKey: string): Observable<Person> {
    const body = toCreateRequest(input);
    if (this.useMocks) {
      // Sem persistência no mock: devolve a pessoa como o backend a devolveria.
      return of(
        toPerson({
          id: '00000000-0000-4000-8000-0000000000a1',
          name: body.name,
          notes: body.notes ?? null,
          archived: false,
          net: { amount: '0.00', currency: 'BRL' },
          direction: 'NONE',
          openDebts: 0,
          nextDueDate: null,
          version: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      );
    }
    return this.http
      .post<PersonResponse>(PEOPLE_ENDPOINTS.collection, body, {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toPerson), catchError(fail));
  }

  update(id: string, input: PersonUpdate): Observable<Person> {
    if (this.useMocks) return notFound();
    return this.http
      .put<PersonResponse>(PEOPLE_ENDPOINTS.item(id), toUpdateRequest(input))
      .pipe(map(toPerson), catchError(fail));
  }

  archive(id: string): Observable<Person> {
    return this.action(PEOPLE_ENDPOINTS.archive(id));
  }

  unarchive(id: string): Observable<Person> {
    return this.action(PEOPLE_ENDPOINTS.unarchive(id));
  }

  private action(url: string): Observable<Person> {
    if (this.useMocks) return notFound();
    return this.http.post<PersonResponse>(url, null).pipe(map(toPerson), catchError(fail));
  }

  private toSlice(slice: PersonSliceResponse): Slice<Person> {
    return { items: slice.items.map(toPerson), hasNext: slice.hasNext };
  }
}
