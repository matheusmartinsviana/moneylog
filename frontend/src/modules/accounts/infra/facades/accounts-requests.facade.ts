import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import {
  AccountsGateway,
  AccountsQuery,
} from '~/modules/accounts/core/interfaces/accounts.gateway';
import type { Account } from '~/modules/accounts/core/types/account';
import type { AccountInput, AccountUpdate } from '~/modules/accounts/core/types/account-input';
import { ACCOUNTS_ENDPOINTS } from '~/modules/accounts/infra/endpoints';
import {
  toAccount,
  toCreateRequest,
  toUpdateRequest,
} from '~/modules/accounts/infra/facades/account-response.mapper';
import type {
  AccountResponse,
  AccountSliceResponse,
} from '~/modules/accounts/infra/responses/account.response';
import { EMPTY_ACCOUNTS } from '~/modules/accounts/mock-data/empty-accounts';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS, mockResponse } from '~/util/api-mocks';
import { todayIso } from '~/util/date';

/** Falha de rede/HTTP → `ProblemError` tipado (o core nunca vê `HttpErrorResponse`). */
function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então qualquer conta pedida por id não existe. */
const NOT_FOUND: Problem = {
  status: 404,
  code: 'ACCOUNT_NOT_FOUND',
  fieldErrors: [],
  traceId: null,
  retryAfterSeconds: null,
};

/**
 * Facade de requisições de contas (FE 05): o único lugar com HTTP do módulo. Com `API_MOCKS`
 * ligado, responde com `mock-data` vazio e não faz requisição; desligado, chama `/v1/accounts`.
 */
@Injectable({ providedIn: 'root' })
export class AccountsRequestsFacade extends AccountsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: AccountsQuery): Observable<Slice<Account>> {
    if (this.useMocks) {
      return of(this.toSlice(mockResponse(ACCOUNTS_ENDPOINTS.collection, EMPTY_ACCOUNTS)));
    }
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<AccountSliceResponse>(ACCOUNTS_ENDPOINTS.collection, { params }).pipe(
      map((slice) => this.toSlice(slice)),
      catchError(fail),
    );
  }

  get(id: string): Observable<Account> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    return this.http
      .get<AccountResponse>(ACCOUNTS_ENDPOINTS.item(id))
      .pipe(map(toAccount), catchError(fail));
  }

  create(input: AccountInput): Observable<Account> {
    if (this.useMocks) {
      // Sem persistência no mock: devolve a conta como o backend a devolveria.
      const openingBalance = input.openingBalance ?? '0.00';
      const openingDate = input.openingDate ?? todayIso();
      return of(
        toAccount({
          id: '00000000-0000-4000-8000-000000000001',
          name: input.name,
          type: input.type,
          liquidity: input.type === 'INVESTMENT' ? 'INVESTMENT' : 'CASH',
          institution: input.institution,
          openingBalance: { amount: openingBalance, currency: 'BRL' },
          openingDate: openingDate,
          currentBalance: { amount: openingBalance, currency: 'BRL' },
          status: 'ACTIVE',
          openingEditable: true,
          archivable: false,
          version: 0,
          createdAt: openingDate,
          updatedAt: openingDate,
        }),
      );
    }
    return this.http
      .post<AccountResponse>(ACCOUNTS_ENDPOINTS.collection, toCreateRequest(input))
      .pipe(map(toAccount), catchError(fail));
  }

  update(id: string, input: AccountUpdate): Observable<Account> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    return this.http
      .put<AccountResponse>(ACCOUNTS_ENDPOINTS.item(id), toUpdateRequest(input))
      .pipe(map(toAccount), catchError(fail));
  }

  archive(id: string): Observable<Account> {
    return this.action(ACCOUNTS_ENDPOINTS.archive(id));
  }

  unarchive(id: string): Observable<Account> {
    return this.action(ACCOUNTS_ENDPOINTS.unarchive(id));
  }

  private action(url: string): Observable<Account> {
    if (this.useMocks) return throwError(() => new ProblemError(NOT_FOUND));
    return this.http.post<AccountResponse>(url, null).pipe(map(toAccount), catchError(fail));
  }

  private toSlice(slice: AccountSliceResponse): Slice<Account> {
    return { items: slice.items.map(toAccount), hasNext: slice.hasNext };
  }
}
