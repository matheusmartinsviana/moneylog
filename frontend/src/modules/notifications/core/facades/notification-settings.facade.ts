import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import type { NotificationSettings } from '~/modules/notifications/core/types/notification';
import { Problem, problemOf } from '~/util/api/problem';

export type SettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly settings: NotificationSettings };

/**
 * Facade das configurações de notificação. Salvar usa `version` (lock otimista) e `exhaustMap`; o resultado
 * é o que o backend devolveu. `409` (`VERSION_CONFLICT`) recarrega as configurações atuais. Escopo de componente.
 */
@Injectable()
export class NotificationSettingsFacade {
  private readonly gateway = inject(NotificationsGateway);
  private readonly loads = new Subject<void>();
  private readonly saves = new Subject<NotificationSettings>();
  private readonly current = signal<SettingsState>({ status: 'loading' });
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly savedState = signal(false);

  readonly state = this.current.asReadonly();
  readonly settings = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.settings : null;
  });
  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  /** Verdadeiro depois de um salvar bem-sucedido, até a próxima edição. */
  readonly saved = this.savedState.asReadonly();

  constructor() {
    this.loads
      .pipe(
        switchMap(() =>
          this.gateway.settings().pipe(
            map((settings): SettingsState => ({ status: 'ready', settings })),
            startWith<SettingsState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<SettingsState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.saves
      .pipe(
        exhaustMap((input) => {
          this.savingState.set(true);
          this.problemState.set(null);
          this.savedState.set(false);
          return this.gateway.saveSettings(input).pipe(
            tap((settings) => {
              this.current.set({ status: 'ready', settings });
              this.savedState.set(true);
            }),
            map(() => null),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              this.problemState.set(problem);
              if (problem.code === 'VERSION_CONFLICT') this.loads.next();
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.savingState.set(false));
  }

  load(): void {
    this.loads.next();
  }

  save(settings: NotificationSettings): void {
    this.saves.next(settings);
  }

  markEdited(): void {
    this.savedState.set(false);
  }
}
