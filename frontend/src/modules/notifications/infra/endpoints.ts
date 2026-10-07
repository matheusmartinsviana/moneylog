/** Endpoints de notificações (Etapa 7). Contrato: tag Notifications. */
export const NOTIFICATIONS_ENDPOINTS = {
  collection: '/v1/notifications',
  unreadCount: '/v1/notifications/unread-count',
  read: (id: string) => `/v1/notifications/${encodeURIComponent(id)}/read`,
  readAll: '/v1/notifications/read-all',
  reminders: '/v1/reminders',
  reminder: (id: string) => `/v1/reminders/${encodeURIComponent(id)}`,
  reminderDone: (id: string) => `/v1/reminders/${encodeURIComponent(id)}/done`,
  reminderSnooze: (id: string) => `/v1/reminders/${encodeURIComponent(id)}/snooze`,
  settings: '/v1/settings/notifications',
  pushConfig: '/v1/push/config',
  pushSubscriptions: '/v1/push/subscriptions',
  pushSubscription: (id: string) => `/v1/push/subscriptions/${encodeURIComponent(id)}`,
  dailyMessage: '/v1/daily-message',
} as const;
