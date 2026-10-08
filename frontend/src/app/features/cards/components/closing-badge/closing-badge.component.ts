import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Selo "Fechamento não confirmado" (presentational): ícone + texto, nunca só cor. Aparece quando o
 * `closingDay` do cartão ainda é um parâmetro provisório (`closingConfirmed === false`).
 */
@Component({
  selector: 'app-closing-badge',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status badge" [attr.data-cy]="'closing-badge-' + cardId()">
      <app-icon name="calendar" [size]="14" />
      {{ t().cards.closing.badge }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .badge {
      gap: var(--space-1);
    }
  `,
})
export class ClosingBadgeComponent {
  protected readonly t = inject(I18nService).t;

  readonly cardId = input.required<string>();
}
