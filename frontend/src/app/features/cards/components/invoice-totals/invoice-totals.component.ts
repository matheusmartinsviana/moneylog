import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { InvoiceStatusComponent } from '~/app/features/cards/components/invoice-status/invoice-status.component';
import type { Invoice } from '~/modules/cards/core/types/invoice';
import { formatIsoDate } from '~/util/date';
import { isPositive } from '~/util/money';

/**
 * Totais da fatura (T66, presentational): total, crédito da fatura anterior (`carryIn`), pago,
 * `outstanding`, fechamento, vencimento e situação, **como o backend os calculou** (nada é somado nem
 * subtraído aqui). "Crédito para a próxima fatura" só aparece com `creditCarry > 0`.
 */
@Component({
  selector: 'app-invoice-totals',
  imports: [MoneyComponent, InvoiceStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let i = invoice();
    @let s = t().cards.invoice.summary;
    <dl class="ledger surface totals" data-cy="invoice-totals">
      <div class="ledger__row">
        <dt class="ledger__label">{{ s.status }}</dt>
        <dd class="ledger__value"><app-invoice-status [status]="i.status" /></dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ s.closing }}</dt>
        <dd class="ledger__value" data-cy="invoice-closing">{{ closing() }}</dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ s.due }}</dt>
        <dd class="ledger__value" data-cy="invoice-due">{{ due() }}</dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ s.total }}</dt>
        <dd class="ledger__value" data-cy="invoice-total"><app-money [value]="i.total" /></dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ s.carryIn }}</dt>
        <dd class="ledger__value" data-cy="invoice-carry-in"><app-money [value]="i.carryIn" /></dd>
      </div>
      <div class="ledger__row">
        <dt class="ledger__label">{{ s.paid }}</dt>
        <dd class="ledger__value" data-cy="invoice-paid"><app-money [value]="i.paid" /></dd>
      </div>
      <div class="ledger__row ledger__row--total">
        <dt class="ledger__label">{{ s.outstanding }}</dt>
        <dd class="ledger__value" data-cy="invoice-outstanding">
          <app-money [value]="i.outstanding" />
        </dd>
      </div>
      @if (hasCreditCarry()) {
        <div class="ledger__row">
          <dt class="ledger__label">{{ s.creditCarry }}</dt>
          <dd class="ledger__value" data-cy="invoice-credit-carry">
            <app-money [value]="i.creditCarry" />
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }

    .totals {
      padding: var(--space-2) var(--space-5);
    }
  `,
})
export class InvoiceTotalsComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly invoice = input.required<Invoice>();

  protected readonly hasCreditCarry = computed(() => isPositive(this.invoice().creditCarry));
  protected readonly closing = computed(() =>
    formatIsoDate(this.invoice().closingDate, HTML_LANG[this.i18n.language()], 'long'),
  );
  protected readonly due = computed(() =>
    formatIsoDate(this.invoice().dueDate, HTML_LANG[this.i18n.language()], 'long'),
  );
}
