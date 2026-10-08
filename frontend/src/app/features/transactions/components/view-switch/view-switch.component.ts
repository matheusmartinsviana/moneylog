import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { SlideIndicatorDirective } from '~/app/common/motion/slide-indicator.directive';
import type { ListView } from '~/modules/transactions/core/types/list-filters';

/** Alterna entre as duas visões da lista: Registros e Por competência. Presentational. */
@Component({
  selector: 'app-view-switch',
  imports: [SlideIndicatorDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="tabs"
      appSlideIndicator
      role="group"
      [attr.aria-label]="t().transactions.views.label"
      data-cy="view-switch"
    >
      <button
        type="button"
        class="tab"
        data-cy="view-records"
        [attr.aria-pressed]="view() === 'records'"
        (click)="viewChange.emit('records')"
      >
        {{ t().transactions.views.records }}
      </button>
      <button
        type="button"
        class="tab"
        data-cy="view-entries"
        [attr.aria-pressed]="view() === 'entries'"
        (click)="viewChange.emit('entries')"
      >
        {{ t().transactions.views.entries }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ViewSwitchComponent {
  protected readonly t = inject(I18nService).t;
  readonly view = input.required<ListView>();
  readonly viewChange = output<ListView>();
}
