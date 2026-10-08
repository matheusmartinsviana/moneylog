import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';

/**
 * Selo "de terceiro" (presentational): ícone + texto, nunca só cor. Com o nome da pessoa responsável
 * quando se sabe ("De terceiro: Ana").
 */
@Component({
  selector: 'app-third-party-badge',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status badge" data-cy="third-party-badge">
      <app-icon name="user" [size]="14" />
      {{ text() }}
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
export class ThirdPartyBadgeComponent {
  private readonly t = inject(I18nService).t;

  readonly name = input<string | null>(null);

  protected readonly text = computed(() => {
    const name = this.name();
    const copy = this.t().transactions.thirdParty;
    return name ? interpolate(copy.badgeFor, { name }) : copy.badge;
  });
}
