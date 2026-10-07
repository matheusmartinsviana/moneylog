import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { exhaustMap, Subject } from 'rxjs';

import {
  QUICK_ADD_ITEM,
  SIDEBAR_MAIN_ITEMS,
  SIDEBAR_MORE_ITEM,
  SIDEBAR_SETTINGS_ITEM,
} from '~/app/common/components/app-shell/navigation';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { SidebarStateService } from '~/app/common/services/sidebar-state.service';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';

/**
 * Sidebar em trilho de ícones (DS 03): botões quadrados arredondados, o ativo preenchido em lilás. Recolhida
 * (padrão) mostra só ícones, com o rótulo como tooltip e nome acessível; expandida mostra ícones com rótulos.
 * O botão de alternar lembra a escolha no dispositivo. Só o essencial fica à vista: o resto das seções está em
 * "Mais" (`/more`). Configurações e Sair ficam fixos no rodapé. "Sair" usa `SessionFacade.logout`
 * (`exhaustMap`: toque duplo = uma chamada).
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionFacade);
  private readonly signOuts = new Subject<void>();
  private readonly state = inject(SidebarStateService);

  protected readonly t = inject(I18nService).t;
  protected readonly items = SIDEBAR_MAIN_ITEMS;
  protected readonly more = SIDEBAR_MORE_ITEM;
  protected readonly settings = SIDEBAR_SETTINGS_ITEM;
  protected readonly quickAdd = QUICK_ADD_ITEM;
  protected readonly expanded = this.state.expanded;

  constructor() {
    this.signOuts
      .pipe(
        exhaustMap(() => this.session.logout()),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.router.navigate(['/login']));
  }

  protected toggle(): void {
    this.state.toggle();
  }

  protected signOut(): void {
    this.signOuts.next();
  }
}
