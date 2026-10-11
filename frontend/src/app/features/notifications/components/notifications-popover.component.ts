import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { LiquidGlassDirective } from '~/app/common/components/liquid-glass/liquid-glass.directive';
import { OverlayPanelComponent } from '~/app/common/components/overlay/overlay-panel.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { notificationLink, notificationText } from '~/app/features/notifications/notification-text';
import { NotificationsCenterFacade } from '~/modules/notifications/core/facades/notifications-center.facade';
import { UnreadCountFacade } from '~/modules/notifications/core/facades/unread-count.facade';
import type { AppNotification } from '~/modules/notifications/core/types/notification';

/** Quantas notificações o pop-up mostra (as mais recentes, lidas e não lidas). */
export const POPOVER_LIMIT = 8;

/**
 * Sino do cabeçalho: um clique abre um pop-up com as últimas notificações (em vez de navegar). A lista só é
 * carregada ao abrir (lazy). `Esc` e clique fora fecham (o `OverlayPanel` cuida) e o foco volta ao botão.
 * "Marcar todas como lidas" e "Ver todas" (`/notifications`) ficam no rodapé. Em tela compacta vira folha.
 * Smart: usa a facade da central (escopo do componente) e o contador compartilhado.
 */
@Component({
  selector: 'app-notifications-popover',
  imports: [IconComponent, LiquidGlassDirective, OverlayPanelComponent, RouterLink],
  providers: [NotificationsCenterFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #wrapper class="np">
      <button
        #trigger
        type="button"
        class="icon-button np__bell"
        appLiquidGlass
        aria-haspopup="dialog"
        data-cy="header-bell"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="bellLabel()"
        (click)="toggle()"
      >
        <app-icon name="bell" [size]="20" />
        @if ((unreadCount() ?? 0) > 0) {
          <span class="np__count num" aria-hidden="true" data-cy="header-bell-count">{{
            unreadCount()
          }}</span>
        }
      </button>

      <app-overlay-panel
        [open]="open()"
        [anchor]="anchor()"
        [label]="t().notifications.popover.title"
        [align]="'end'"
        [minWidth]="320"
        [panelWidth]="384"
        [scrollBody]="true"
        cy="header-notifications"
        (closed)="close()"
      >
        @if (open()) {
          <div class="np__body" data-cy="notifications-popover">
            <header class="np__header">
              <h2 class="np__title">{{ t().notifications.popover.title }}</h2>
              <button
                type="button"
                class="np__link"
                data-cy="notifications-popover-mark-all"
                [disabled]="!hasUnread()"
                (click)="center.markAllRead()"
              >
                {{ t().notifications.center.markAllRead }}
              </button>
            </header>

            @switch (center.state().status) {
              @case ('loading') {
                <div data-cy="notifications-popover-loading">
                  <p class="visually-hidden" role="status">
                    {{ t().notifications.center.loading }}
                  </p>
                  <div class="np__skeleton" aria-hidden="true">
                    <div class="sk np__sk"></div>
                    <div class="sk np__sk"></div>
                    <div class="sk np__sk"></div>
                  </div>
                </div>
              }
              @case ('empty') {
                <p class="np__note" data-cy="notifications-popover-empty">
                  {{ t().notifications.popover.empty }}
                </p>
              }
              @case ('error') {
                <div class="np__error" role="alert" data-cy="notifications-popover-error">
                  <p>{{ t().notifications.popover.error }}</p>
                  <button
                    type="button"
                    class="button"
                    data-cy="notifications-popover-retry"
                    (click)="center.load()"
                  >
                    {{ t().notifications.popover.retry }}
                  </button>
                </div>
              }
              @case ('ready') {
                <ul class="np__list" data-cy="notifications-popover-list">
                  @for (item of items(); track item.id) {
                    <li>
                      <a
                        class="np__item row-hover"
                        [class.is-unread]="item.unread"
                        [routerLink]="item.link"
                        data-cy="notifications-popover-item"
                        (click)="close(false)"
                      >
                        <span class="np__main">
                          <span class="np__kind">
                            {{ item.kind }}
                            @if (item.unread) {
                              <span class="np__badge" data-cy="notifications-popover-unread">{{
                                t().notifications.center.unreadMark
                              }}</span>
                            }
                          </span>
                          <span class="np__item-title">{{ item.title }}</span>
                          <span class="np__item-body">{{ item.body }}</span>
                        </span>
                      </a>
                    </li>
                  }
                </ul>
              }
            }

            <footer class="np__footer">
              <a
                class="button np__all"
                routerLink="/notifications"
                data-autofocus
                data-cy="notifications-popover-all"
                (click)="close(false)"
              >
                {{ t().notifications.popover.viewAll }}
              </a>
            </footer>
          </div>
        }
      </app-overlay-panel>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .np {
      position: relative;
      display: inline-flex;
    }

    .np__bell:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .np__count {
      position: absolute;
      top: -0.375rem;
      right: -0.375rem;
      min-width: 1.125rem;
      padding: 0 var(--space-1);
      border: 2px solid var(--color-canvas);
      border-radius: var(--radius-pill);
      background-color: var(--color-accent);
      color: var(--color-on-accent);
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      line-height: 1rem;
      text-align: center;
    }

    .np__body {
      display: grid;
      gap: var(--space-2);
      min-width: 0;
      padding: var(--space-3);
    }

    .np__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 0 var(--space-1);
    }

    .np__title {
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
    }

    /* Em tela compacta o pop-up vira folha e ela já tem o título. */
    @media (width <= 640px) {
      .np__title {
        display: none;
      }

      .np__header {
        justify-content: flex-end;
      }
    }

    .np__link {
      min-height: var(--touch-min);
      padding: 0 var(--space-2);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-accent);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .np__link:disabled {
      color: var(--color-text-muted);
      cursor: not-allowed;
    }

    .np__list {
      display: grid;
      gap: 2px;
      max-height: min(16rem, 36dvh);
      overflow-y: auto;
    }

    /* Paisagem (pouca altura): a lista não tem rolagem própria; o corpo do painel rola por inteiro. */
    @media (max-height: 500px) {
      .np__list {
        max-height: none;
        overflow-y: visible;
      }
    }

    .np__item {
      display: block;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      color: inherit;
      text-decoration: none;
    }

    .np__item.is-unread {
      background-color: var(--color-accent-soft);
    }

    .np__main {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .np__kind {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .np__badge {
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background-color: var(--color-accent-soft);
      color: var(--color-accent);
      font-weight: var(--weight-medium);
    }

    .np__item.is-unread .np__badge {
      background-color: var(--color-surface);
    }

    .np__item-title {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
    }

    .np__item-body {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      overflow-wrap: anywhere;
    }

    .np__note,
    .np__error {
      padding: var(--space-3);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .np__error {
      display: grid;
      justify-items: start;
      gap: var(--space-3);
    }

    .np__skeleton {
      display: grid;
      gap: var(--space-2);
    }

    .np__sk {
      height: 3.5rem;
    }

    .np__footer {
      display: grid;
    }

    .np__all {
      width: 100%;
    }
  `,
})
export class NotificationsPopoverComponent {
  private readonly i18n = inject(I18nService);
  private readonly unread = inject(UnreadCountFacade);
  private readonly injector = inject(Injector);
  protected readonly center = inject(NotificationsCenterFacade);
  protected readonly t = this.i18n.t;

  private readonly wrapper = viewChild<ElementRef<HTMLElement>>('wrapper');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly anchor = computed(() => this.wrapper()?.nativeElement ?? null);
  protected readonly open = signal(false);

  protected readonly unreadCount = this.unread.count;
  protected readonly bellLabel = computed(() => {
    const copy = this.t().notifications.bell;
    const count = this.unread.count() ?? 0;
    if (count <= 0) return copy.label;
    return count === 1 ? copy.one : interpolate(copy.many, { count: String(count) });
  });

  private readonly all = computed<readonly AppNotification[]>(() => {
    const state = this.center.state();
    return state.status === 'ready' ? state.data : [];
  });
  protected readonly hasUnread = computed(() => this.all().some((n) => n.readAt === null));
  protected readonly items = computed(() => {
    const copy = this.t().notifications;
    const locale = HTML_LANG[this.i18n.language()];
    return this.all()
      .slice(0, POPOVER_LIMIT)
      .map((n) => {
        const text = notificationText(n, copy, locale);
        return {
          id: n.id,
          kind: copy.kinds[n.kind],
          title: text.title,
          body: text.body,
          unread: n.readAt === null,
          link: notificationLink(n),
        };
      });
  });

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    // Lazy: a lista só é pedida ao abrir.
    this.center.load({ status: 'ALL', kind: null });
    this.open.set(true);
  }

  /** `restoreFocus` falso quando o clique já leva a outra tela (o foco vai para ela). */
  protected close(restoreFocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (!restoreFocus) return;
    afterNextRender(() => this.trigger()?.nativeElement.focus(), { injector: this.injector });
  }
}
