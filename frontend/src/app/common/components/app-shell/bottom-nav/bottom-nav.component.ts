import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { BOTTOM_NAV_ITEMS, QUICK_ADD_ITEM } from '~/app/common/components/app-shell/navigation';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/** Barra inferior fixa do mobile, com o "+" central de captura rápida. */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.css',
})
export class BottomNavComponent {
  protected readonly t = inject(I18nService).t;
  protected readonly items = BOTTOM_NAV_ITEMS;
  protected readonly quickAddKey = QUICK_ADD_ITEM.key;
}
