import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MORE_GROUPS } from '~/app/common/components/app-shell/navigation';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/** "Mais" (mobile): as seções que não cabem na barra inferior, sob os três grupos da sidebar, em listas no estilo Ajustes do macOS. */
@Component({
  selector: 'app-more-page',
  imports: [PageLayoutComponent, IconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './more.page.html',
  styleUrl: './more.page.css',
})
export class MorePage {
  protected readonly t = inject(I18nService).t;
  protected readonly groups = MORE_GROUPS;
}
