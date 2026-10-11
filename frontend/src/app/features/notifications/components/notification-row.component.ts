import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { notificationLink, notificationText } from '~/app/features/notifications/notification-text';
import type { AppNotification } from '~/modules/notifications/core/types/notification';

/**
 * Uma notificação da central (presentational). O texto é montado pela chave de i18n e pelos `params`;
 * "não lida" é dito em texto, nunca só pela cor. Leva à entidade citada e marca como lida.
 */
@Component({
  selector: 'li[app-notification-row]',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'row', '[class.row--unread]': 'unread()', '[attr.data-cy]': '"notification-row"' },
  template: `
    <div class="row__main">
      <p class="row__kind">
        {{ kindLabel() }}
        @if (unread()) {
          <span class="row__badge" data-cy="notification-unread">{{
            t().notifications.center.unreadMark
          }}</span>
        }
      </p>
      <p class="row__title" data-cy="notification-title">{{ text().title }}</p>
      <p class="row__body" data-cy="notification-body">{{ text().body }}</p>
    </div>
    <div class="row__actions">
      <a class="button" [routerLink]="link()" data-cy="notification-open">
        {{ t().notifications.center.open }}
      </a>
      @if (unread()) {
        <button
          type="button"
          class="button"
          data-cy="notification-mark-read"
          (click)="markRead.emit()"
        >
          {{ t().notifications.center.markRead }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
      list-style: none;
    }

    /* Não lida: só um fundo suave (a palavra "Não lida" também está no selo); sem contorno forte. */
    :host(.row--unread) {
      background-color: var(--color-surface-inset);
    }

    .row__main {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .row__kind {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .row__badge {
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background-color: var(--color-accent-soft);
      color: var(--color-accent);
      font-weight: var(--weight-medium);
    }

    .row__title {
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
    }

    .row__body {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }

    .row__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class NotificationRowComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly notification = input.required<AppNotification>();
  readonly markRead = output<void>();

  protected readonly unread = computed(() => this.notification().readAt === null);
  protected readonly text = computed(() =>
    notificationText(this.notification(), this.t().notifications, HTML_LANG[this.i18n.language()]),
  );
  protected readonly kindLabel = computed(
    () => this.t().notifications.kinds[this.notification().kind],
  );
  protected readonly link = computed(() => notificationLink(this.notification()));
}
