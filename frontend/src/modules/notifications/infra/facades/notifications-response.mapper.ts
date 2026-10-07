import type {
  AppNotification,
  DailyMessage,
  NotificationSettings,
  PushConfig,
  Reminder,
  ReminderInput,
} from '~/modules/notifications/core/types/notification';
import type {
  DailyMessageResponse,
  NotificationResponse,
  NotificationSettingsResponse,
  PushConfigResponse,
  ReminderRequest,
  ReminderResponse,
} from '~/modules/notifications/infra/responses/notification.response';

export function toNotification(r: NotificationResponse): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    titleKey: r.titleKey,
    bodyKey: r.bodyKey,
    params: r.params,
    ref: { type: r.ref.type, id: r.ref.id },
    onDate: r.onDate,
    dueOn: r.dueOn ?? null,
    readAt: r.readAt ?? null,
    createdAt: r.createdAt,
  };
}

export function toReminder(r: ReminderResponse): Reminder {
  return {
    id: r.id,
    title: r.title,
    remindOn: r.remindOn,
    remindAt: r.remindAt ?? null,
    note: r.note ?? null,
    link: r.link ? { type: r.link.type, id: r.link.id } : null,
    done: r.done,
    doneAt: r.doneAt ?? null,
    createdAt: r.createdAt,
  };
}

export function toReminderRequest(input: ReminderInput): ReminderRequest {
  return {
    title: input.title.trim(),
    remindOn: input.remindOn,
    remindAt: input.remindAt,
    note: input.note?.trim() ? input.note.trim() : null,
    link: input.link,
  };
}

export function toSettings(r: NotificationSettingsResponse): NotificationSettings {
  return {
    dailySummary: { ...r.dailySummary },
    kinds: { ...(r.kinds ?? {}) },
    quietHours: { ...r.quietHours },
    push: { enabled: r.push.enabled },
    displayName: r.displayName ?? null,
    version: r.version,
  };
}

export function toSettingsRequest(s: NotificationSettings): NotificationSettingsResponse {
  return {
    dailySummary: { ...s.dailySummary },
    kinds: { ...s.kinds },
    quietHours: { ...s.quietHours },
    push: { enabled: s.push.enabled },
    displayName: s.displayName?.trim() ? s.displayName.trim() : null,
    version: s.version,
  };
}

export function toPushConfig(r: PushConfigResponse): PushConfig {
  return { enabled: r.enabled, publicKey: r.publicKey ?? null };
}

export function toDailyMessage(r: DailyMessageResponse): DailyMessage {
  return { key: r.key, params: r.params, generatedAt: r.generatedAt };
}
