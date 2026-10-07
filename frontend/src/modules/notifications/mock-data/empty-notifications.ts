import type { NotificationSettingsResponse } from '~/modules/notifications/infra/responses/notification.response';

/** Ambiente mock (S-67): nada de notificações nem lembretes; configuração padrão; push desligado. */
export const EMPTY_PAGE = { items: [], hasNext: false } as const;
export const DEFAULT_SETTINGS: NotificationSettingsResponse = {
  dailySummary: { enabled: true, time: '08:00', frequency: 'DAILY' },
  kinds: {},
  quietHours: { from: '22:00', to: '07:00' },
  push: { enabled: false },
  displayName: null,
  version: 0,
};
