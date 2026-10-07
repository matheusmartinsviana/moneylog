import { Injectable, signal } from '@angular/core';

import { readStorage, writeStorage } from '~/util/safe-storage';

export const SIDEBAR_STORAGE_KEY = 'moneylog.sidebar';

/**
 * Estado da sidebar (DS 03): trilho de ícones (recolhida, padrão) ou ícones com rótulos (expandida). A escolha
 * fica no dispositivo (`localStorage`, com falha silenciosa: aba privada só deixa de lembrar).
 */
@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  private readonly state = signal(readStorage(SIDEBAR_STORAGE_KEY) === 'expanded');

  readonly expanded = this.state.asReadonly();

  toggle(): void {
    const next = !this.state();
    this.state.set(next);
    writeStorage(SIDEBAR_STORAGE_KEY, next ? 'expanded' : 'collapsed');
  }
}
