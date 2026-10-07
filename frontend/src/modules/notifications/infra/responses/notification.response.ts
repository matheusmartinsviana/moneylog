import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

export type NotificationResponse = Schemas['Notification'];
export type NotificationSliceResponse = Schemas['NotificationSlice'];
export type UnreadCountResponse = Schemas['UnreadCount'];
export type ReminderResponse = Schemas['Reminder'];
export type ReminderSliceResponse = Schemas['ReminderSlice'];
export type ReminderRequest = Schemas['ReminderInput'];
export type SnoozeRequest = Schemas['SnoozeInput'];
export type NotificationSettingsResponse = Schemas['NotificationSettings'];
export type PushConfigResponse = Schemas['PushConfig'];
export type PushSubscriptionRequest = Schemas['PushSubscriptionInput'];
export type PushSubscriptionResponse = Schemas['PushSubscription'];
export type DailyMessageResponse = Schemas['DailyMessage'];
