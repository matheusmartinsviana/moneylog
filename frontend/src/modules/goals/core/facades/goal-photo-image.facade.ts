import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, Subject, switchMap } from 'rxjs';

import { GoalPhotoCache, photoKey } from '~/modules/goals/core/facades/goal-photo-cache';
import { GoalPhotosGateway } from '~/modules/goals/core/interfaces/goal-photos.gateway';
import type { GoalPhotoVariant } from '~/modules/goals/core/types/goal';
import { Problem, problemOf } from '~/util/api/problem';

export type PhotoImageState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly url: string };

interface ImageRequest {
  readonly goalId: string;
  readonly photoId: string;
  readonly variant: GoalPhotoVariant;
}

/**
 * Facade de UMA imagem de foto na tela: busca os bytes pela porta (com o Bearer do interceptor), guarda no
 * cache em memória e expõe o `blob:` URL. Trocar de foto cancela a busca anterior (`switchMap`) e solta a
 * imagem antiga; ao destruir, solta a atual (o cache revoga quando ninguém mais usa). Escopo de componente.
 */
@Injectable()
export class GoalPhotoImageFacade {
  private readonly gateway = inject(GoalPhotosGateway);
  private readonly cache = inject(GoalPhotoCache);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<ImageRequest>();
  private readonly current = signal<PhotoImageState>({ status: 'loading' });
  private held: string | null = null;
  private last: ImageRequest | null = null;

  readonly state = this.current.asReadonly();

  constructor() {
    this.requests
      .pipe(
        switchMap((request) => {
          this.current.set({ status: 'loading' });
          return this.fetch(request).pipe(
            map((url): PhotoImageState => ({ status: 'ready', url })),
            catchError((error: unknown) =>
              of<PhotoImageState>({ status: 'error', problem: problemOf(error) }),
            ),
            map((state) => ({ request, state })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ request, state }) => {
        this.swapHold(
          state.status === 'ready'
            ? photoKey(request.goalId, request.photoId, request.variant)
            : null,
        );
        this.current.set(state);
      });
    this.destroyRef.onDestroy(() => this.swapHold(null));
  }

  show(goalId: string, photoId: string, variant: GoalPhotoVariant): void {
    this.last = { goalId, photoId, variant };
    this.requests.next(this.last);
  }

  /** "Tentar de novo" depois de uma falha. */
  retry(): void {
    if (this.last) this.requests.next(this.last);
  }

  /** Aquece o cache com a próxima imagem (melhor esforço: falha em silêncio). */
  preload(goalId: string, photoId: string, variant: GoalPhotoVariant): void {
    this.fetch({ goalId, photoId, variant })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private fetch({ goalId, photoId, variant }: ImageRequest): Observable<string> {
    return this.cache.fetch(photoKey(goalId, photoId, variant), () =>
      this.gateway.content(goalId, photoId, variant),
    );
  }

  private swapHold(next: string | null): void {
    if (this.held === next) return;
    if (next !== null) this.cache.hold(next);
    if (this.held !== null) this.cache.release(this.held);
    this.held = next;
  }
}
