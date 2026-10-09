import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { NotificationRowComponent } from '~/app/features/notifications/components/notification-row.component';
import { ReminderFormComponent } from '~/app/features/notifications/components/reminder-form.component';
import { dailyText } from '~/app/features/notifications/notification-text';
import { DailyMessageFacade } from '~/modules/notifications/core/facades/daily-message.facade';
import { NotificationsCenterFacade } from '~/modules/notifications/core/facades/notifications-center.facade';
import { RemindersFacade } from '~/modules/notifications/core/facades/reminders.facade';
import { UnreadCountFacade } from '~/modules/notifications/core/facades/unread-count.facade';
import type {
  AppNotification,
  NotificationKind,
  Reminder,
  ReminderInput,
} from '~/modules/notifications/core/types/notification';
import { formatIsoDate } from '~/util/date';

const KINDS: readonly NotificationKind[] = [
  'INVOICE_DUE',
  'DEBT_COLLECT',
  'DEBT_PAYABLE_DUE',
  'RECURRENCE_PENDING',
  'COMMITTED_NEXT_MONTH',
  'DAILY_SUMMARY',
  'REMINDER',
  'GOAL_DEADLINE',
  'GROUPED',
];

interface DayGroup {
  readonly date: string;
  readonly items: readonly AppNotification[];
}

/**
 * Central de notificações e lembretes (smart). A lista é agrupada por dia, traduzida pela chave de i18n e
 * pelos `params`; "marcar como lida" relê a lista e o contador do backend. Sem rede mostra a última lista com
 * aviso. Quando o contador do sino sobe, a lista é relida e uma região viva anuncia uma vez (sem anunciar a
 * cada polling). Lembretes: criar, editar, concluir e adiar.
 */
@Component({
  selector: 'app-notifications-page',
  imports: [
    DisclosureComponent,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SegmentedControlComponent,
    SelectComponent,
    NotificationRowComponent,
    ReminderFormComponent,
  ],
  providers: [NotificationsCenterFacade, RemindersFacade, DailyMessageFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.css',
})
export class NotificationsPage implements OnInit {
  private readonly i18n = inject(I18nService);
  private readonly unread = inject(UnreadCountFacade);
  protected readonly t = this.i18n.t;
  protected readonly center = inject(NotificationsCenterFacade);
  protected readonly reminders = inject(RemindersFacade);
  private readonly dailyMessage = inject(DailyMessageFacade);

  /** Mensagem do dia (saiu do Início sucinto): chave + números do backend; sem resposta, nada é mostrado. */
  protected readonly daily = computed(() => {
    const message = this.dailyMessage.message();
    return message
      ? dailyText(message, this.t().notifications, HTML_LANG[this.i18n.language()])
      : null;
  });

  protected readonly statusControl = new FormControl<string | null>('ALL');
  protected readonly kindControl = new FormControl<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Reminder | null>(null);
  protected readonly showDone = signal(false);
  protected readonly announcement = signal('');

  protected readonly statusOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'ALL', label: this.t().notifications.center.all },
    { value: 'UNREAD', label: this.t().notifications.center.unread },
  ]);
  protected readonly kindOptions = computed<readonly ChoiceOption[]>(() =>
    KINDS.map((kind) => ({ value: kind, label: this.t().notifications.kinds[kind] })),
  );

  protected readonly groups = computed<readonly DayGroup[]>(() => {
    const state = this.center.state();
    if (state.status !== 'ready') return [];
    const groups: { date: string; items: AppNotification[] }[] = [];
    for (const item of state.data) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.onDate) last.items.push(item);
      else groups.push({ date: item.onDate, items: [item] });
    }
    return groups;
  });

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'settings',
      label: this.t().notifications.center.settingsLink,
      available: true,
      primary: true,
      link: '/settings/notifications',
    },
  ]);
  protected readonly reminderEmptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add-reminder',
      label: this.t().notifications.reminders.add,
      available: true,
      primary: true,
    },
  ]);

  protected readonly actionError = computed(() => {
    const problem = this.center.actionProblem() ?? this.reminders.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly hasUnread = computed(() => (this.unread.count() ?? 0) > 0);

  protected readonly dayLabel = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    return (date: string) => formatIsoDate(date, locale, 'long');
  });
  protected readonly reminderWhen = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    const copy = this.t().notifications.reminders;
    return (reminder: Reminder) =>
      reminder.remindAt
        ? interpolate(copy.onAt, {
            date: formatIsoDate(reminder.remindOn, locale, 'long'),
            time: reminder.remindAt,
          })
        : interpolate(copy.on, { date: formatIsoDate(reminder.remindOn, locale, 'long') });
  });

  private lastCount: number | null = null;

  constructor() {
    this.statusControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilter());
    this.kindControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilter());

    // O contador subiu (polling do sino): relê a lista e anuncia uma vez.
    effect(() => {
      const count = this.unread.count();
      untracked(() => {
        if (count !== null && this.lastCount !== null && count > this.lastCount) {
          this.announcement.set(this.t().notifications.center.newAnnounce);
          this.center.load();
        }
        this.lastCount = count;
      });
    });
  }

  ngOnInit(): void {
    this.center.load({ status: 'ALL', kind: null });
    this.reminders.load(false);
    this.dailyMessage.load();
  }

  protected applyFilter(): void {
    const status = this.statusControl.value === 'UNREAD' ? 'UNREAD' : 'ALL';
    const kind = KINDS.find((k) => k === this.kindControl.value) ?? null;
    this.center.load({ status, kind });
  }

  protected toggleDone(): void {
    this.showDone.update((value) => !value);
    this.reminders.load(this.showDone());
  }

  protected newReminder(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected editReminder(reminder: Reminder): void {
    this.editing.set(reminder);
    this.formOpen.set(true);
  }

  protected saveReminder(input: ReminderInput): void {
    const current = this.editing();
    if (current) this.reminders.update(current.id, input);
    else this.reminders.create(input);
    this.formOpen.set(false);
  }

  protected onEmptyAction(id: string): void {
    if (id === 'add-reminder') this.newReminder();
  }
}
