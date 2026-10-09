import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { GoalPhotoImageFacade } from '~/modules/goals/core/facades/goal-photo-image.facade';
import type { GoalPhotoVariant } from '~/modules/goals/core/types/goal';

/**
 * Uma foto de meta (ADR-018). O `<img>` não envia o Bearer, então os bytes vêm pelo `HttpClient` como `Blob`
 * (facade) e viram um `blob:` URL em cache de memória, revogado pelo cache quando ninguém mais usa. Tamanho
 * fixo pelo contêiner (sem salto de layout): o pai define largura/altura; a imagem cobre (`object-fit`).
 * Carregando: esqueleto; falha: aviso com "tentar de novo". Presentational (a facade é de escopo de componente).
 */
@Component({
  selector: 'app-goal-photo',
  providers: [GoalPhotoImageFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (image.state().status) {
      @case ('ready') {
        <img
          class="photo__img"
          draggable="false"
          decoding="async"
          [attr.loading]="eager() ? 'eager' : 'lazy'"
          [attr.width]="width()"
          [attr.height]="height()"
          [src]="url()"
          [alt]="alt()"
          [attr.data-cy]="cy()"
        />
      }
      @case ('error') {
        <span class="photo__fallback" [attr.data-cy]="cy() + '-error'">
          <span>{{ t().goals.photos.unavailable }}</span>
          <button
            type="button"
            class="button photo__retry"
            [attr.data-cy]="cy() + '-retry'"
            [attr.aria-label]="t().goals.photos.reloadPhoto"
            (click)="image.retry()"
          >
            {{ t().goals.photos.retry }}
          </button>
        </span>
      }
      @default {
        <span class="visually-hidden" role="status">{{ t().goals.photos.loading }}</span>
        <span class="photo__skeleton sk" aria-hidden="true"></span>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--color-surface-muted);
    }

    .photo__img,
    .photo__skeleton {
      display: block;
      width: 100%;
      height: 100%;
    }

    .photo__img {
      object-fit: cover;
      animation: photo-fade var(--duration-base) var(--ease-enter) both;
    }

    .photo__fallback {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: var(--space-1);
      height: 100%;
      padding: var(--space-2);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      text-align: center;
    }

    .photo__retry {
      min-height: 0;
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-xs);
    }

    @keyframes photo-fade {
      from {
        opacity: 0;
      }
    }
  `,
})
export class GoalPhotoComponent {
  protected readonly t = inject(I18nService).t;
  protected readonly image = inject(GoalPhotoImageFacade);

  protected readonly url = computed(() => {
    const state = this.image.state();
    return state.status === 'ready' ? state.url : '';
  });

  readonly goalId = input.required<string>();
  readonly photoId = input.required<string>();
  readonly variant = input<GoalPhotoVariant>('thumb');
  /** Texto alternativo (descritivo, ex.: "Foto 1 de 3 da meta Carro"). */
  readonly alt = input.required<string>();
  /** Dimensões intrínsecas (do contrato), só para reservar espaço e evitar salto de layout. */
  readonly width = input<number>();
  readonly height = input<number>();
  /** Foto principal da tela (`eager`); as demais carregam sob demanda (`lazy`). */
  readonly eager = input(false);
  readonly cy = input('goal-photo');

  constructor() {
    effect(() => {
      const goalId = this.goalId();
      const photoId = this.photoId();
      const variant = this.variant();
      untracked(() => this.image.show(goalId, photoId, variant));
    });
  }
}
