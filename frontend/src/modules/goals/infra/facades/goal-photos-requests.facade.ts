import {
  HttpClient,
  HttpEventType,
  HttpHeaders,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, filter, from, map, Observable, switchMap, throwError } from 'rxjs';

import {
  GoalPhotosGateway,
  type PhotoUploadEvent,
} from '~/modules/goals/core/interfaces/goal-photos.gateway';
import type { Goal, GoalPhotoVariant } from '~/modules/goals/core/types/goal';
import { GOALS_ENDPOINTS, IDEMPOTENCY_HEADER } from '~/modules/goals/infra/endpoints';
import { toGoal, toPhoto } from '~/modules/goals/infra/facades/goals-response.mapper';
import type {
  GoalPhotoResponse,
  GoalResponse,
} from '~/modules/goals/infra/responses/goal.response';
import { problemFromBlobError } from '~/util/api/blob-problem';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import { API_MOCKS } from '~/util/api-mocks';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: o "banco" está vazio, então nenhuma meta (nem foto) existe. */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'GOAL_NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições das fotos das metas (FE 05): o único lugar com HTTP das fotos. O envio é
 * `multipart/form-data` (campo `file`) com `Idempotency-Key`; o conteúdo vem como `Blob` pelo `HttpClient`
 * (o interceptor põe o Bearer; nunca vai token na URL). O nome do arquivo só segue no multipart (o servidor
 * o ignora).
 */
@Injectable({ providedIn: 'root' })
export class GoalPhotosRequestsFacade extends GoalPhotosGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  upload(
    goalId: string,
    file: Blob,
    fileName: string,
    idempotencyKey: string,
  ): Observable<PhotoUploadEvent> {
    if (this.useMocks) return notFound();
    const body = new FormData();
    body.append('file', file, fileName);
    return this.http
      .post<GoalPhotoResponse>(GOALS_ENDPOINTS.photos(goalId), body, {
        headers: new HttpHeaders().set(IDEMPOTENCY_HEADER, idempotencyKey),
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event): PhotoUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent =
              event.total && event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0;
            return { kind: 'progress', percent: Math.min(100, percent) };
          }
          if (event instanceof HttpResponse && event.body) {
            return { kind: 'done', photo: toPhoto(event.body) };
          }
          return null;
        }),
        filter((event): event is PhotoUploadEvent => event !== null),
        catchError(fail),
      );
  }

  content(goalId: string, photoId: string, variant: GoalPhotoVariant): Observable<Blob> {
    if (this.useMocks) return notFound();
    return this.http
      .get(GOALS_ENDPOINTS.photoContent(goalId, photoId), {
        params: new HttpParams().set('variant', variant),
        responseType: 'blob',
      })
      .pipe(
        catchError((error: unknown) =>
          from(problemFromBlobError(error)).pipe(
            switchMap((problem) => throwError(() => new ProblemError(problem))),
          ),
        ),
      );
  }

  reorder(goalId: string, photoIds: readonly string[]): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .put<GoalResponse>(GOALS_ENDPOINTS.photosOrder(goalId), { photoIds })
      .pipe(map(toGoal), catchError(fail));
  }

  setCover(goalId: string, photoId: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .put<GoalResponse>(GOALS_ENDPOINTS.photoCover(goalId, photoId), null)
      .pipe(map(toGoal), catchError(fail));
  }

  remove(goalId: string, photoId: string): Observable<Goal> {
    if (this.useMocks) return notFound();
    return this.http
      .delete<GoalResponse>(GOALS_ENDPOINTS.photo(goalId, photoId))
      .pipe(map(toGoal), catchError(fail));
  }
}
