import { computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, Subject, switchMap, timer } from 'rxjs';

import { Problem, problemOf } from '~/util/api/problem';

/** Espera até a digitação parar antes de pedir uma prévia (T62 CA4, T68 CA2, T69 CA1). */
export const PREVIEW_DEBOUNCE_MS = 300;

export type PreviewState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: T };

const IDLE: PreviewState<never> = { status: 'idle' };

/**
 * Prévia pedida ao backend (sem efeito colateral) com espera de 300 ms e `switchMap`: a resposta
 * anterior é cancelada e só a da **última** combinação chega ao estado. `request()` já marca
 * `loading` na hora, então a tela nunca mostra uma prévia velha como se fosse da combinação atual.
 * Nenhum valor é calculado aqui: `data` é o que o backend devolveu. Criar dentro de um contexto de
 * injeção (a facade que a usa), porque cancela a assinatura ao ser destruída.
 */
export class DebouncedPreview<K, T> {
  private readonly requests = new Subject<K | null>();
  private readonly current = signal<PreviewState<T>>(IDLE);

  readonly state = this.current.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly loading = computed(() => this.current().status === 'loading');
  readonly problem = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });

  constructor(fetch: (key: K) => Observable<T>, debounceMs: number = PREVIEW_DEBOUNCE_MS) {
    this.requests
      .pipe(
        switchMap((key) =>
          key === null
            ? of<PreviewState<T>>(IDLE)
            : timer(debounceMs).pipe(
                switchMap(() =>
                  fetch(key).pipe(
                    map((data): PreviewState<T> => ({ status: 'ready', data })),
                    catchError((error: unknown) =>
                      of<PreviewState<T>>({ status: 'error', problem: problemOf(error) }),
                    ),
                  ),
                ),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Pede a prévia desta combinação; `null` limpa (e cancela o que estava em andamento). */
  request(key: K | null): void {
    this.current.set(key === null ? IDLE : { status: 'loading' });
    this.requests.next(key);
  }
}
