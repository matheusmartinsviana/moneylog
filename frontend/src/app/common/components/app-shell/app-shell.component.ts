import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { BottomNavComponent } from '~/app/common/components/app-shell/bottom-nav/bottom-nav.component';
import { SidebarComponent } from '~/app/common/components/app-shell/sidebar/sidebar.component';
import { ToastRegionComponent } from '~/app/common/components/toast/toast-region.component';
import { WorkspaceHeaderComponent } from '~/app/common/components/workspace-header/workspace-header.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { captureInstallPrompt } from '~/app/common/services/install-prompt-capture';

/**
 * App shell responsivo (arquitetura §5.3, ADR-011):
 * - < 768px: barra inferior fixa, sem sidebar e sem janela;
 * - 768–1023px: tela cheia, sidebar recolhida;
 * - 1024–1199px: janela flutuante com a sidebar recolhida (a página rola; a sidebar fica `sticky`);
 * - ≥ 1200px: janela flutuante com a sidebar expandida (a coluna do inspector entra numa etapa futura).
 * O cabeçalho do workspace (ações rápidas, chip de IA; saudação só no Início) fica acima do conteúdo.
 * Cada página renderiza o próprio `<main>` via `app-page-layout`. Os avisos (`ToastService`) ficam
 * numa região única do shell.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    SidebarComponent,
    BottomNavComponent,
    ToastRegionComponent,
    WorkspaceHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent {
  constructor() {
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => (destroyed = true));
    // Guarda o `beforeinstallprompt` cedo; os avisos do PWA (e o serviço) carregam sob demanda.
    captureInstallPrompt(this.document.defaultView);
    afterNextRender(() => {
      // Fora do bundle inicial: os avisos do PWA entram quando o navegador está ocioso.
      void import('~/app/common/components/pwa-notices/pwa-notices.component').then((m) => {
        if (!destroyed) this.pwaNotices()?.createComponent(m.PwaNoticesComponent);
      });
    });
  }

  private readonly document = inject(DOCUMENT);
  protected readonly t = inject(I18nService).t;
  private readonly pwaNotices = viewChild('pwaNotices', { read: ViewContainerRef });

  /** Leva o foco ao conteúdo da página sem mexer na URL (um `href="#..."` trocaria a rota). */
  protected skipToContent(): void {
    this.document.getElementById('main-content')?.focus();
  }
}
