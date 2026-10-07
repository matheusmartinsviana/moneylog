import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

import { takeCapturedInstallPrompt } from '~/app/common/services/install-prompt-capture';
import { readStorage, writeStorage } from '~/util/safe-storage';

export const INSTALL_DISMISSED_KEY = 'moneylog.pwa.install-dismissed';

/** Evento do Chrome/Edge/Android que não está nos tipos do DOM. */
interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | null;

/**
 * Estado do PWA para a UI: conexão, nova versão do app e convite de instalação. Só reflete o navegador:
 * nada é enfileirado offline (escritas exigem rede) e nenhum dado financeiro passa por aqui.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly document = inject(DOCUMENT);
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly win = this.document.defaultView;

  private readonly onlineState = signal(this.win?.navigator.onLine ?? true);
  private readonly versionReady = signal(false);
  private readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(
    takeCapturedInstallPrompt() as BeforeInstallPromptEvent | null,
  );
  private readonly installDismissed = signal(readStorage(INSTALL_DISMISSED_KEY) === '1');
  private readonly installed = signal(false);

  readonly online = this.onlineState.asReadonly();
  readonly updateAvailable = this.versionReady.asReadonly();

  /** `prompt`: Android/desktop com o evento nativo; `ios`: instrução manual; `null`: não convidar. */
  readonly installMode = computed<InstallMode>(() => {
    if (this.installDismissed() || this.installed() || this.isStandalone()) return null;
    if (this.deferredPrompt()) return 'prompt';
    return this.isIosSafari() ? 'ios' : null;
  });

  constructor() {
    const win = this.win;
    if (win) {
      win.addEventListener('online', () => this.onlineState.set(true));
      win.addEventListener('offline', () => this.onlineState.set(false));
      win.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        this.deferredPrompt.set(event as BeforeInstallPromptEvent);
      });
      win.addEventListener('appinstalled', () => {
        this.installed.set(true);
        this.deferredPrompt.set(null);
      });
    }
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') this.versionReady.set(true);
      });
    }
  }

  /** Ativa a versão nova e recarrega. Quem chama deve ter confirmado: o que não foi salvo se perde. */
  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate?.activateUpdate();
    } catch {
      // Sem ativar, o recarregamento ainda pega a versão baixada na próxima abertura.
    }
    this.win?.location.reload();
  }

  async install(): Promise<void> {
    const prompt = this.deferredPrompt();
    if (!prompt) return;
    this.deferredPrompt.set(null);
    // Evento nativo de instalação (não é o `prompt()` do navegador); chamado pela referência do método.
    const showInstall = prompt.prompt;
    await showInstall.call(prompt);
    const { outcome } = await prompt.userChoice;
    if (outcome === 'dismissed') this.dismissInstall();
  }

  /** Dispensa o convite; a memória é local e, se o armazenamento falhar, vale só nesta sessão. */
  dismissInstall(): void {
    this.installDismissed.set(true);
    writeStorage(INSTALL_DISMISSED_KEY, '1');
  }

  private isStandalone(): boolean {
    const win = this.win;
    if (!win) return false;
    const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone;
    return (
      iosStandalone === true || win.matchMedia?.('(display-mode: standalone)').matches === true
    );
  }

  private isIosSafari(): boolean {
    const nav = this.win?.navigator;
    if (!nav) return false;
    const ua = nav.userAgent;
    const ios =
      /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    // Navegadores de terceiros no iOS (Chrome, Firefox, Edge) não oferecem "Adicionar à Tela de Início" igual.
    return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }
}
