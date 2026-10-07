import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import {
  PushCapability,
  PushDevice,
  PushPermission,
} from '~/modules/notifications/core/interfaces/push-device';
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
import { Problem, ProblemError } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';

export function aNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n-1',
    kind: 'INVOICE_DUE',
    titleKey: 'notification.invoice.due3',
    bodyKey: 'notification.invoice.due3.body',
    params: { name: 'Cartão Roxo', amount: '1423.00', dueDate: '2026-10-10', daysLate: '0' },
    ref: { type: 'CARD', id: 'card-1' },
    onDate: '2026-10-07',
    dueOn: '2026-10-10',
    readAt: null,
    createdAt: '2026-10-07T12:00:00Z',
    ...overrides,
  };
}

export function aReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r-1',
    title: 'Revisar o orçamento',
    remindOn: '2026-10-09',
    remindAt: null,
    note: null,
    link: null,
    done: false,
    doneAt: null,
    createdAt: '2026-10-05T12:00:00Z',
    ...overrides,
  };
}

export function someSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    dailySummary: { enabled: true, time: '08:00', frequency: 'DAILY' },
    kinds: {},
    quietHours: { from: '22:00', to: '07:00' },
    push: { enabled: false },
    displayName: null,
    version: 3,
    ...overrides,
  };
}

export function aProblem(status: number, code: string): Problem {
  return { status, code, fieldErrors: [], traceId: null, retryAfterSeconds: null };
}

/** Porta falsa de notificações: guarda as chamadas e devolve o que o teste configurar. */
export class NotificationsGatewayStub extends NotificationsGateway {
  notifications: AppNotification[] = [];
  reminderList: Reminder[] = [];
  settingsValue: NotificationSettings = someSettings();
  pushConfigValue: PushConfig = { enabled: false, publicKey: null };
  unread = 0;
  daily: DailyMessage | null = null;
  readonly calls: string[] = [];
  readonly queries: NotificationsQuery[] = [];
  readonly savedSettings: NotificationSettings[] = [];
  readonly createdReminders: ReminderInput[] = [];
  readonly subscriptions: PushSubscriptionInput[] = [];
  listError: Problem | null = null;
  saveError: Problem | null = null;
  pushConfigError: Problem | null = null;

  list(query: NotificationsQuery): Observable<Slice<AppNotification>> {
    this.queries.push(query);
    if (this.listError) return throwError(() => new ProblemError(this.listError as Problem));
    const items = this.notifications.filter(
      (n) =>
        (query.status === 'ALL' || n.readAt === null) && (!query.kind || n.kind === query.kind),
    );
    return of({ items, hasNext: false });
  }

  unreadCount(): Observable<number> {
    this.calls.push('unreadCount');
    return of(this.unread);
  }

  markRead(id: string): Observable<void> {
    this.calls.push(`markRead:${id}`);
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, readAt: '2026-10-07T13:00:00Z' } : n,
    );
    this.unread = this.notifications.filter((n) => n.readAt === null).length;
    return of(undefined);
  }

  markAllRead(): Observable<void> {
    this.calls.push('markAllRead');
    this.notifications = this.notifications.map((n) => ({ ...n, readAt: '2026-10-07T13:00:00Z' }));
    this.unread = 0;
    return of(undefined);
  }

  reminders(includeDone: boolean): Observable<Slice<Reminder>> {
    this.calls.push(`reminders:${includeDone}`);
    return of({ items: this.reminderList.filter((r) => includeDone || !r.done), hasNext: false });
  }

  createReminder(input: ReminderInput): Observable<Reminder> {
    this.createdReminders.push(input);
    const created = aReminder({ id: 'r-new', ...input });
    this.reminderList = [...this.reminderList, created];
    return of(created);
  }

  updateReminder(id: string, input: ReminderInput): Observable<Reminder> {
    this.calls.push(`updateReminder:${id}`);
    const updated = aReminder({ id, ...input });
    this.reminderList = this.reminderList.map((r) => (r.id === id ? updated : r));
    return of(updated);
  }

  completeReminder(id: string): Observable<Reminder> {
    this.calls.push(`complete:${id}`);
    const done = aReminder({ id, done: true });
    this.reminderList = this.reminderList.map((r) => (r.id === id ? done : r));
    return of(done);
  }

  snoozeReminder(id: string, days: number): Observable<Reminder> {
    this.calls.push(`snooze:${id}:${days}`);
    return of(aReminder({ id, remindOn: '2026-10-10' }));
  }

  settings(): Observable<NotificationSettings> {
    return of(this.settingsValue);
  }

  saveSettings(settings: NotificationSettings): Observable<NotificationSettings> {
    this.savedSettings.push(settings);
    if (this.saveError) return throwError(() => new ProblemError(this.saveError as Problem));
    this.settingsValue = { ...settings, version: settings.version + 1 };
    return of(this.settingsValue);
  }

  pushConfig(): Observable<PushConfig> {
    if (this.pushConfigError) {
      return throwError(() => new ProblemError(this.pushConfigError as Problem));
    }
    return of(this.pushConfigValue);
  }

  subscribePush(input: PushSubscriptionInput): Observable<string> {
    this.subscriptions.push(input);
    return of('sub-1');
  }

  unsubscribePush(id: string): Observable<void> {
    this.calls.push(`unsubscribe:${id}`);
    return of(undefined);
  }

  dailyMessage(): Observable<DailyMessage> {
    if (!this.daily) {
      return throwError(() => new ProblemError(aProblem(404, 'NOT_FOUND')));
    }
    return of(this.daily);
  }
}

/** Dispositivo falso (`PushManager`/`Notification`): o teste escolhe a capacidade e a permissão. */
export class PushDeviceFake extends PushDevice {
  capabilityValue: PushCapability = 'supported';
  permissionValue: PushPermission = 'default';
  endpoint: string | null = null;
  readonly subscribeKeys: string[] = [];
  unsubscribed = 0;
  denyOnSubscribe = false;

  capability(): PushCapability {
    return this.capabilityValue;
  }

  permission(): PushPermission {
    return this.permissionValue;
  }

  currentEndpoint(): Promise<string | null> {
    return Promise.resolve(this.endpoint);
  }

  subscribe(publicKey: string): Promise<PushSubscriptionInput> {
    this.subscribeKeys.push(publicKey);
    if (this.denyOnSubscribe) {
      this.permissionValue = 'denied';
      return Promise.reject(new Error('push-denied'));
    }
    this.endpoint = 'https://push.example/abc';
    return Promise.resolve({
      endpoint: this.endpoint,
      keys: { p256dh: 'p', auth: 'a' },
      userAgent: null,
    });
  }

  unsubscribe(): Promise<void> {
    this.unsubscribed += 1;
    this.endpoint = null;
    return Promise.resolve();
  }
}

export function provideNotificationsStub(
  gateway: NotificationsGatewayStub = new NotificationsGatewayStub(),
  device: PushDeviceFake = new PushDeviceFake(),
): Provider[] {
  return [
    { provide: NotificationsGateway, useValue: gateway },
    { provide: PushDevice, useValue: device },
  ];
}
