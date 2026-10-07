import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Rodapé dos formulários de movimentação (presentational): aviso de falha, "tentar de novo" (mesma
 * `Idempotency-Key`, quem usa decide), cancelar e salvar.
 */
@Component({
  selector: 'app-form-actions',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (banner(); as message) {
      <p class="banner" role="alert" data-cy="form-error">{{ message }}</p>
    }
    <div class="actions">
      @if (canRetry()) {
        <button type="button" class="button" data-cy="form-retry" (click)="retry.emit()">
          {{ t().entryForm.retry }}
        </button>
      }
      @if (cancelLink(); as link) {
        <a class="button" [routerLink]="link" queryParamsHandling="preserve" data-cy="form-cancel">
          {{ t().entryForm.cancel }}
        </a>
      }
      <button
        type="submit"
        class="button button--primary"
        data-cy="form-save"
        [disabled]="saving()"
        [attr.aria-busy]="saving()"
      >
        {{ saving() ? t().entryForm.saving : (submitLabel() ?? t().entryForm.save) }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class FormActionsComponent {
  protected readonly t = inject(I18nService).t;

  readonly banner = input<string | null>(null);
  readonly canRetry = input(false);
  readonly saving = input(false);
  readonly submitLabel = input<string>();
  readonly cancelLink = input<string | null>(null);
  readonly retry = output<void>();
}
