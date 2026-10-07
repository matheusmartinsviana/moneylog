import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { QUICK_ADD_ITEM, SIDEBAR_GROUPS } from '~/app/common/components/app-shell/navigation';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { ProfileMenuComponent } from '~/app/common/components/profile-menu/profile-menu.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Sidebar no estilo macOS em três grupos (OVERVIEW, WORKSPACE, SYSTEM): recolhida (só ícones, rótulo como
 * tooltip acessível, grupos separados por divisor) no tablet e expandida no desktop. O rótulo continua no
 * DOM, então o nome acessível nunca some. O rodapé tem o avatar genérico com o menu do perfil.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent, ProfileMenuComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  protected readonly t = inject(I18nService).t;
  protected readonly groups = SIDEBAR_GROUPS;
  protected readonly quickAdd = QUICK_ADD_ITEM;

  /**
   * Abaixo de 1200 px a sidebar é recolhida (só ícones): o rótulo vira o balão do `appTooltip` (no `body`,
   * fora da coluna rolável). No desktop o rótulo já está visível e o balão seria repetição.
   */
  protected readonly collapsed = signal(true);

  constructor() {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(width < 1200px)');
    const sync = () => this.collapsed.set(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', sync));
  }
}
