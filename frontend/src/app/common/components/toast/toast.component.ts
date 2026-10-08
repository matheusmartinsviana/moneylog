import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { Toast, ToastAction } from '~/app/common/services/toast.service';

/** Um aviso (presentational): texto, tom e o botão de fechar. */
@Component({
  selector: 'app-toast',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="toast"
      [class.toast--error]="toast().tone === 'error'"
      [attr.role]="toast().tone === 'error' ? 'alert' : 'status'"
      [attr.data-cy]="'toast-' + toast().tone"
    >
      <p class="toast__message">{{ toast().message }}</p>
      @for (action of toast().actions; track action.id) {
        <button
          type="button"
          class="toast__action"
          [attr.data-cy]="'toast-action-' + action.id"
          (click)="run(action)"
        >
          {{ action.label }}
        </button>
      }
      <button
        type="button"
        class="toast__dismiss"
        data-cy="toast-dismiss"
        [attr.aria-label]="t().form.toast.dismiss"
        (click)="dismissed.emit(toast().id)"
      >
        <app-icon name="close" [size]="16" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .toast {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
      color: var(--color-text);
      box-shadow: var(--shadow-2);
      font-size: var(--text-sm);
    }

    .toast--error {
      border-color: var(--color-risk);
    }

    .toast__message {
      flex: 1;
      min-width: 0;
    }

    .toast__action {
      flex: none;
      min-height: 2rem;
      padding: 0 var(--space-2);
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: var(--color-accent);
      font-weight: var(--weight-medium);
      text-decoration: underline;
    }

    .toast__action:hover {
      background-color: var(--color-hover-soft);
    }

    .toast__dismiss {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      flex: none;
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: var(--color-text-muted);
    }

    .toast__dismiss:hover {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }
  `,
})
export class ToastComponent {
  protected readonly t = inject(I18nService).t;

  readonly toast = input.required<Toast>();
  readonly dismissed = output<number>();

  protected run(action: ToastAction): void {
    action.run();
    this.dismissed.emit(this.toast().id);
  }
}
