import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastComponent } from '~/app/common/components/toast/toast.component';
import { ToastService } from '~/app/common/services/toast.service';

/**
 * Área dos avisos, montada uma vez no shell. A região viva existe sempre (mesmo vazia), para que
 * o leitor de tela anuncie cada aviso novo. No celular fica acima da barra inferior.
 */
@Component({
  selector: 'app-toast-region',
  imports: [ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="toasts"
      data-modal-safe
      aria-live="polite"
      aria-relevant="additions"
      data-cy="toast-region"
    >
      @for (toast of toasts(); track toast.id) {
        <app-toast [toast]="toast" (dismissed)="service.dismiss($event)" />
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .toasts {
      position: fixed;
      right: var(--space-4);
      bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + var(--space-3));
      left: var(--space-4);
      z-index: var(--z-toast);
      display: grid;
      gap: var(--space-2);
      pointer-events: none;
    }

    .toasts > * {
      pointer-events: auto;
    }

    @media (width >= 768px) {
      .toasts {
        bottom: var(--space-6);
        left: auto;
        width: 22rem;
      }
    }
  `,
})
export class ToastRegionComponent {
  protected readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;
}
