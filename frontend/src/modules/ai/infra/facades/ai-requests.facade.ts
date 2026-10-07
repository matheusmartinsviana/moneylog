import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type {
  AiAnalysis,
  AiAnalysisSummary,
  AiPreview,
  AiPreviewRequest,
  AiSettings,
  AiStatus,
  Insight,
} from '~/modules/ai/core/types/ai';
import { AI_ENDPOINTS as E, IDEMPOTENCY_HEADER } from '~/modules/ai/infra/endpoints';
import {
  toAnalysis,
  toHistory,
  toInsights,
  toPreview,
  toStatus,
} from '~/modules/ai/infra/facades/ai-response.mapper';
import type {
  AiAnalysisRequestBody,
  AiAnalysisResponse,
  AiAnalysisSliceResponse,
  AiPreviewRequestBody,
  AiPreviewResponse,
  AiSettingsResponse,
  AiStatusResponse,
  InsightSliceResponse,
} from '~/modules/ai/infra/responses/ai.response';
import { DEFAULT_AI_SETTINGS, OFF_STATUS } from '~/modules/ai/mock-data/empty-ai';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

function unavailable(): Observable<never> {
  const problem: Problem = {
    status: 422,
    code: 'AI_DISABLED',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/** Facade de requisições de IA: o único lugar com HTTP do módulo. Com `API_MOCKS`, a IA está desligada. */
@Injectable({ providedIn: 'root' })
export class AiRequestsFacade extends AiGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  status(): Observable<AiStatus> {
    if (this.useMocks) return of(OFF_STATUS);
    return this.http.get<AiStatusResponse>(E.status).pipe(map(toStatus), catchError(fail));
  }

  createPreview(request: AiPreviewRequest): Observable<AiPreview> {
    if (this.useMocks) return unavailable();
    const body: AiPreviewRequestBody = {
      purpose: request.purpose,
      scope: {
        language: request.language,
        ...(request.month === null ? {} : { month: request.month }),
      },
    };
    return this.http
      .post<AiPreviewResponse>(E.previews, body)
      .pipe(map(toPreview), catchError(fail));
  }

  runAnalysis(previewId: string, approve: boolean, idempotencyKey: string): Observable<AiAnalysis> {
    if (this.useMocks) return unavailable();
    const body: AiAnalysisRequestBody = { previewId, approve };
    return this.http
      .post<AiAnalysisResponse>(E.analyses, body, {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
      })
      .pipe(map(toAnalysis), catchError(fail));
  }

  history(page: number, pageSize: number): Observable<Slice<AiAnalysisSummary>> {
    if (this.useMocks) return of({ items: [], hasNext: false });
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http
      .get<AiAnalysisSliceResponse>(E.analyses, { params })
      .pipe(map(toHistory), catchError(fail));
  }

  analysis(id: string): Observable<AiAnalysis> {
    if (this.useMocks) return unavailable();
    return this.http
      .get<AiAnalysisResponse>(E.analysis(id))
      .pipe(map(toAnalysis), catchError(fail));
  }

  insights(month: string | null): Observable<Slice<Insight>> {
    if (this.useMocks) return of({ items: [], hasNext: false });
    let params = new HttpParams().set('pageSize', 20);
    if (month !== null) params = params.set('month', month);
    return this.http
      .get<InsightSliceResponse>(E.insights, { params })
      .pipe(map(toInsights), catchError(fail));
  }

  settings(): Observable<AiSettings> {
    if (this.useMocks) return of(DEFAULT_AI_SETTINGS);
    return this.http.get<AiSettingsResponse>(E.settings).pipe(
      map((r) => ({ dailyMessageEnabled: r.dailyMessageEnabled })),
      catchError(fail),
    );
  }

  saveSettings(settings: AiSettings): Observable<AiSettings> {
    if (this.useMocks) return unavailable();
    return this.http
      .put<AiSettingsResponse>(E.settings, { dailyMessageEnabled: settings.dailyMessageEnabled })
      .pipe(
        map((r) => ({ dailyMessageEnabled: r.dailyMessageEnabled })),
        catchError(fail),
      );
  }
}
