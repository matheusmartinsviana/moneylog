import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { activeModal } from '~/app/common/components/overlay/modal-lock';

/**
 * Região `aria-live="polite"` única para anúncios de leitor de tela (mês trocado, "3 opções").
 * Mensagens iguais em sequência são alternadas com um espaço para serem lidas de novo.
 * Com um modal aberto, a região passa para dentro dele (leitores que ocultam o que está fora do
 * `aria-modal` descartariam o anúncio); sem modal, volta ao fim do `body`.
 */
@Injectable({ providedIn: 'root' })
export class LiveAnnouncer {
  private readonly document = inject(DOCUMENT);
  private region: HTMLElement | null = null;
  private flip = false;
  private pending: ReturnType<typeof setTimeout> | null = null;

  announce(message: string): void {
    // Um anúncio novo cancela o texto que ainda esperava a região se mover: o antigo nunca vence o novo.
    this.cancelPending();
    const region = this.ensureRegion();
    const container = activeModal() ?? this.document.body;
    const moved = region.parentElement !== container;
    if (moved) container.appendChild(region);
    this.flip = !this.flip;
    const text = message + (this.flip ? '' : ' ');
    // Uma região recém-movida precisa existir na árvore antes de o texto mudar para ser lida.
    if (moved) {
      this.pending = setTimeout(() => {
        this.pending = null;
        region.textContent = text;
      }, 50);
    } else region.textContent = text;
  }

  private cancelPending(): void {
    if (this.pending !== null) clearTimeout(this.pending);
    this.pending = null;
  }

  private ensureRegion(): HTMLElement {
    if (this.region?.isConnected) return this.region;
    const region = this.document.createElement('div');
    region.className = 'visually-hidden';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('data-cy', 'live-announcer');
    region.setAttribute('data-modal-safe', '');
    this.document.body.appendChild(region);
    this.region = region;
    return region;
  }
}
