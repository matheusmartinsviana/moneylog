import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Largura até a qual listas e calendários abrem como folha inferior (FE-S-116). */
export const COMPACT_QUERY = '(max-width: 640px)';

/**
 * Informa se a tela é "compacta" (celular): nela os painéis dos controles próprios viram folha
 * inferior em vez de popover ancorado. Acompanha a rotação e o redimensionamento.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly query = this.view?.matchMedia?.(COMPACT_QUERY) ?? null;
  private readonly state = signal(this.query?.matches ?? false);

  /** `true` em tela compacta (<= 640 px). */
  readonly compact = this.state.asReadonly();

  constructor() {
    const query = this.query;
    if (!query) return;
    const listener = () => this.state.set(query.matches);
    query.addEventListener('change', listener);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', listener));
  }
}
