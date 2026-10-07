import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import type { InvoiceStatus } from '~/modules/cards/core/types/invoice';

/**
 * Situação da fatura como chip **com texto** (Aberta, Fechada, Paga, Atrasada, Futura): a cor só
 * reforça, nunca é a única pista (DS 00 §3). O `status` é o que o backend derivou (S-37).
 */
@Component({
  selector: 'app-invoice-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [attr.data-status]="status()" data-cy="invoice-status">{{
      t().cards.statuses[status()]
    }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      padding: 0 var(--space-2);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-pill);
      background-color: var(--color-surface-muted);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      line-height: 1.5rem;
      white-space: nowrap;
    }

    .chip[data-status='OPEN'] {
      color: var(--color-text);
    }

    .chip[data-status='PAID'] {
      border-color: var(--color-positive);
      color: var(--color-positive);
    }

    .chip[data-status='OVERDUE'] {
      border-color: var(--color-risk);
      color: var(--color-risk);
    }
  `,
})
export class InvoiceStatusComponent {
  protected readonly t = inject(I18nService).t;

  readonly status = input.required<InvoiceStatus>();
}
