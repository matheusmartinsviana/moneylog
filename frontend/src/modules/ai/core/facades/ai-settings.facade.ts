import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type { AiSettings } from '~/modules/ai/core/types/ai';
import { Problem, problemOf } from '~/util/api/problem';

export type AiSettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly settings: AiSettings };

/** Preferências de IA (mensagem diária). Salvar usa `exhaustMap`; o estado é o que o backend devolveu. */
@Injectable()
export class AiSettingsFacade {
  private readonly gateway = inject(AiGateway);
  private readonly loads = new Subject<void>();
  private readonly saves = new Subject<AiSettings>();
  private readonly current = signal<AiSettingsState>({ status: 'loading' });
  readonly saving = signal(false);
  readonly problem = signal<Problem | null>(null);

  readonly state = this.current.asReadonly();
  readonly settings = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.settings : null;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap(() =>
          this.gateway.settings().pipe(
            map((settings): AiSettingsState => ({ status: 'ready', settings })),
            startWith<AiSettingsState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<AiSettingsState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.saves
      .pipe(
        exhaustMap((input) => {
          this.saving.set(true);
          this.problem.set(null);
          return this.gateway.saveSettings(input).pipe(
            tap((settings) => this.current.set({ status: 'ready', settings })),
            catchError((error: unknown) => {
              this.problem.set(problemOf(error));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.saving.set(false));
  }

  load(): void {
    this.loads.next();
  }

  save(settings: AiSettings): void {
    this.saves.next(settings);
  }
}
