import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { PwaService } from '~/app/common/services/pwa.service';

/**
 * Avisos do PWA no topo do shell: sem conexão (honesto: escritas exigem rede), nova versão
 * (atualizar pede confirmação, pois recarrega a tela) e convite de instalação (dispensável).
 */
@Component({
  selector: 'app-pwa-notices',
  imports: [ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notices" data-cy="pwa-notices">
      @if (!pwa.online()) {
        <p
          class="notice"
          role="status"
          data-cy="pwa-offline"
          animate.enter="m-banner-in"
          animate.leave="m-banner-out"
        >
          <strong>{{ t().pwa.offlineTitle }}</strong> {{ t().pwa.offlineText }}
        </p>
      }
      @if (pwa.updateAvailable()) {
        <div
          class="notice"
          role="status"
          data-cy="pwa-update"
          animate.enter="m-banner-in"
          animate.leave="m-banner-out"
        >
          <p class="notice__text">
            <strong>{{ t().pwa.updateTitle }}</strong> {{ t().pwa.updateText }}
          </p>
          <button
            type="button"
            class="button button--soft"
            data-cy="pwa-update-apply"
            (click)="confirmingUpdate.set(true)"
          >
            {{ t().pwa.updateAction }}
          </button>
        </div>
      }
      @if (pwa.installMode(); as mode) {
        <div
          class="notice"
          data-cy="pwa-install"
          animate.enter="m-banner-in"
          animate.leave="m-banner-out"
        >
          <p class="notice__text">
            <strong>{{ t().pwa.installTitle }}</strong>
            {{ mode === 'ios' ? t().pwa.installIos : t().pwa.installText }}
          </p>
          @if (mode === 'prompt') {
            <button
              type="button"
              class="button button--soft"
              data-cy="pwa-install-accept"
              (click)="pwa.install()"
            >
              {{ t().pwa.installAction }}
            </button>
          }
          <button
            type="button"
            class="button"
            data-cy="pwa-install-dismiss"
            (click)="pwa.dismissInstall()"
          >
            {{ t().pwa.installDismiss }}
          </button>
        </div>
      }
    </div>

    <app-confirm-dialog
      [open]="confirmingUpdate()"
      [heading]="t().pwa.confirmTitle"
      [description]="t().pwa.confirmText"
      [confirmLabel]="t().pwa.updateAction"
      [cancelLabel]="t().pwa.confirmCancel"
      (confirmed)="apply()"
      (cancelled)="confirmingUpdate.set(false)"
    />
  `,
  styles: `
    :host {
      display: block;
    }

    .notices {
      display: grid;
      gap: var(--space-2);
      max-width: var(--content-max-width);
      margin: 0 auto;
      padding: var(--space-3) var(--space-4) 0;
    }

    .notices:empty {
      display: none;
    }

    .notice {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
      color: var(--color-text);
      font-size: var(--text-sm);
    }

    .notice__text {
      flex: 1;
      min-width: 12rem;
    }
  `,
})
export class PwaNoticesComponent {
  protected readonly t = inject(I18nService).t;
  protected readonly pwa = inject(PwaService);
  protected readonly confirmingUpdate = signal(false);

  protected apply(): void {
    this.confirmingUpdate.set(false);
    void this.pwa.applyUpdate();
  }
}
