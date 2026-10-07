import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { DebtOverviewGateway } from '~/modules/debt-overview/core/interfaces/debt-overview.gateway';
import type {
  DebtOverview,
  OngoingInstallmentsInput,
  OngoingPreview,
} from '~/modules/debt-overview/core/types/debt-overview';
import { DEBT_OVERVIEW_ENDPOINTS } from '~/modules/debt-overview/infra/endpoints';
import {
  toDebtOverview,
  toOngoingPreview,
  toOngoingRequest,
} from '~/modules/debt-overview/infra/facades/debt-overview-response.mapper';
import type {
  DebtOverviewResponse,
  OngoingPreviewResponse,
  OngoingTransactionResponse,
} from '~/modules/debt-overview/infra/responses/debt-overview.response';
import { emptyOverview } from '~/modules/debt-overview/mock-data/empty-overview';
import { ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: não há cartões, então qualquer cartão pedido não existe. */
function cardNotFound(): Observable<never> {
  return throwError(
    () =>
      new ProblemError({
        status: 404,
        code: 'CARD_NOT_FOUND',
        fieldErrors: [],
        traceId: null,
        retryAfterSeconds: null,
      }),
  );
}

/** Facade de requisições da visão de dívidas: o único lugar com HTTP do módulo. */
@Injectable({ providedIn: 'root' })
export class DebtOverviewRequestsFacade extends DebtOverviewGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  get(months: number): Observable<DebtOverview> {
    if (this.useMocks) return of(toDebtOverview(emptyOverview(months)));
    return this.http
      .get<DebtOverviewResponse>(DEBT_OVERVIEW_ENDPOINTS.overview, {
        params: new HttpParams().set('months', months),
      })
      .pipe(map(toDebtOverview), catchError(fail));
  }

  previewOngoing(cardId: string, input: OngoingInstallmentsInput): Observable<OngoingPreview> {
    if (this.useMocks) return cardNotFound();
    return this.http
      .post<OngoingPreviewResponse>(
        DEBT_OVERVIEW_ENDPOINTS.ongoingPreview(cardId),
        toOngoingRequest(input),
      )
      .pipe(map(toOngoingPreview), catchError(fail));
  }

  createOngoing(cardId: string, input: OngoingInstallmentsInput): Observable<string> {
    if (this.useMocks) return cardNotFound();
    return this.http
      .post<OngoingTransactionResponse>(
        DEBT_OVERVIEW_ENDPOINTS.ongoing(cardId),
        toOngoingRequest(input),
      )
      .pipe(
        map((transaction) => transaction.id),
        catchError(fail),
      );
  }
}
