import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import type {
  AppNotification,
  DailyMessage,
  NotificationSettings,
  NotificationsQuery,
  PushConfig,
  PushSubscriptionInput,
  Reminder,
  ReminderInput,
} from '~/modules/notifications/core/types/notification';
import { NOTIFICATIONS_ENDPOINTS as E } from '~/modules/notifications/infra/endpoints';
import {
  toDailyMessage,
  toNotification,
  toPushConfig,
  toReminder,
  toReminderRequest,
  toSettings,
  toSettingsRequest,
} from '~/modules/notifications/infra/facades/notifications-response.mapper';
import type {
  DailyMessageResponse,
  NotificationSettingsResponse,
  NotificationSliceResponse,
  PushConfigResponse,
  PushSubscriptionRequest,
  PushSubscriptionResponse,
  ReminderResponse,
  ReminderSliceResponse,
  SnoozeRequest,
  UnreadCountResponse,
} from '~/modules/notifications/infra/responses/notification.response';
import {
  DEFAULT_SETTINGS,
  EMPTY_PAGE,
} from '~/modules/notifications/mock-data/empty-notifications';
import { Problem, ProblemError, toProblem } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';
import { API_MOCKS } from '~/util/api-mocks';

function fail(error: unknown): Observable<never> {
  return throwError(() => new ProblemError(toProblem(error)));
}

/** Ambiente mock: nada existe no "banco". */
function notFound(): Observable<never> {
  const problem: Problem = {
    status: 404,
    code: 'NOT_FOUND',
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  };
  return throwError(() => new ProblemError(problem));
}

/**
 * Facade de requisições de notificações: o único lugar com HTTP do módulo. Com `API_MOCKS` ligado, responde
 * vazio e não faz requisição.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsRequestsFacade extends NotificationsGateway {
  private readonly http = inject(HttpClient);
  private readonly useMocks = inject(API_MOCKS);

  list(query: NotificationsQuery): Observable<Slice<AppNotification>> {
    if (this.useMocks) return of(EMPTY_PAGE);
    let params = new HttpParams()
      .set('status', query.status)
      .set('page', query.page)
      .set('pageSize', query.pageSize);
    if (query.kind) params = params.set('kind', query.kind);
    return this.http.get<NotificationSliceResponse>(E.collection, { params }).pipe(
      map((slice) => ({ items: slice.items.map(toNotification), hasNext: slice.hasNext })),
      catchError(fail),
    );
  }

  unreadCount(): Observable<number> {
    if (this.useMocks) return of(0);
    return this.http.get<UnreadCountResponse>(E.unreadCount).pipe(
      map((r) => r.count),
      catchError(fail),
    );
  }

  markRead(id: string): Observable<void> {
    if (this.useMocks) return notFound();
    return this.http.post<void>(E.read(id), null).pipe(catchError(fail));
  }

  markAllRead(): Observable<void> {
    if (this.useMocks) return of(undefined);
    return this.http.post<void>(E.readAll, null).pipe(catchError(fail));
  }

  reminders(includeDone: boolean, page: number, pageSize: number): Observable<Slice<Reminder>> {
    if (this.useMocks) return of(EMPTY_PAGE);
    const params = new HttpParams()
      .set('includeDone', includeDone)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<ReminderSliceResponse>(E.reminders, { params }).pipe(
      map((slice) => ({ items: slice.items.map(toReminder), hasNext: slice.hasNext })),
      catchError(fail),
    );
  }

  createReminder(input: ReminderInput): Observable<Reminder> {
    if (this.useMocks) return notFound();
    return this.http
      .post<ReminderResponse>(E.reminders, toReminderRequest(input))
      .pipe(map(toReminder), catchError(fail));
  }

  updateReminder(id: string, input: ReminderInput): Observable<Reminder> {
    if (this.useMocks) return notFound();
    return this.http
      .put<ReminderResponse>(E.reminder(id), toReminderRequest(input))
      .pipe(map(toReminder), catchError(fail));
  }

  completeReminder(id: string): Observable<Reminder> {
    if (this.useMocks) return notFound();
    return this.http
      .post<ReminderResponse>(E.reminderDone(id), null)
      .pipe(map(toReminder), catchError(fail));
  }

  snoozeReminder(id: string, days: number): Observable<Reminder> {
    if (this.useMocks) return notFound();
    const body: SnoozeRequest = { days };
    return this.http
      .post<ReminderResponse>(E.reminderSnooze(id), body)
      .pipe(map(toReminder), catchError(fail));
  }

  settings(): Observable<NotificationSettings> {
    if (this.useMocks) return of(toSettings(DEFAULT_SETTINGS));
    return this.http
      .get<NotificationSettingsResponse>(E.settings)
      .pipe(map(toSettings), catchError(fail));
  }

  saveSettings(settings: NotificationSettings): Observable<NotificationSettings> {
    if (this.useMocks) return notFound();
    return this.http
      .put<NotificationSettingsResponse>(E.settings, toSettingsRequest(settings))
      .pipe(map(toSettings), catchError(fail));
  }

  pushConfig(): Observable<PushConfig> {
    if (this.useMocks) return of({ enabled: false, publicKey: null });
    return this.http
      .get<PushConfigResponse>(E.pushConfig)
      .pipe(map(toPushConfig), catchError(fail));
  }

  subscribePush(input: PushSubscriptionInput): Observable<string> {
    if (this.useMocks) return notFound();
    const body: PushSubscriptionRequest = {
      endpoint: input.endpoint,
      keys: { ...input.keys },
      userAgent: input.userAgent,
    };
    return this.http.post<PushSubscriptionResponse>(E.pushSubscriptions, body).pipe(
      map((r) => r.id),
      catchError(fail),
    );
  }

  unsubscribePush(id: string): Observable<void> {
    if (this.useMocks) return notFound();
    return this.http.delete<void>(E.pushSubscription(id)).pipe(catchError(fail));
  }

  dailyMessage(): Observable<DailyMessage> {
    if (this.useMocks) return notFound();
    return this.http
      .get<DailyMessageResponse>(E.dailyMessage)
      .pipe(map(toDailyMessage), catchError(fail));
  }
}
