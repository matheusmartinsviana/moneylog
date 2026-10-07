import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
  finalize,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import type { Reminder, ReminderInput } from '~/modules/notifications/core/types/notification';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type RemindersState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Reminder[] };

type Write = () => Observable<unknown>;

/**
 * Facade dos lembretes (abertos primeiro). Cada escrita roda em fila e, no fim, a lista é relida do
 * backend (a resposta é a verdade). `saved$`-like: `lastSaved` guarda o lembrete devolvido. Concluir não
 * gera notificação (regra do backend). Escopo de componente.
 */
@Injectable()
export class RemindersFacade {
  private readonly gateway = inject(NotificationsGateway);
  private readonly loads = new Subject<boolean>();
  private readonly writes = new Subject<Write>();
  private readonly current = signal<RemindersState>({ status: 'loading' });
  private readonly busyState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private includeDone = false;

  readonly state = this.current.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly problem = this.problemState.asReadonly();

  constructor() {
    this.loads
      .pipe(
        switchMap((includeDone) =>
          this.gateway.reminders(includeDone, 1, MAX_PAGE_SIZE).pipe(
            map((slice): RemindersState =>
              slice.items.length === 0
                ? { status: 'empty' }
                : { status: 'ready', data: slice.items },
            ),
            startWith<RemindersState>({ status: 'loading' }),
            catchError((error: unknown) =>
              of<RemindersState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.writes
      .pipe(
        concatMap((write) => {
          this.busyState.set(true);
          this.problemState.set(null);
          return write().pipe(
            catchError((error: unknown) => {
              this.problemState.set(problemOf(error));
              return of(null);
            }),
            tap(() => this.loads.next(this.includeDone)),
            finalize(() => this.busyState.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  load(includeDone = this.includeDone): void {
    this.includeDone = includeDone;
    this.loads.next(includeDone);
  }

  create(input: ReminderInput): void {
    this.enqueue(() => this.gateway.createReminder(input));
  }

  update(id: string, input: ReminderInput): void {
    this.enqueue(() => this.gateway.updateReminder(id, input));
  }

  complete(id: string): void {
    this.enqueue(() => this.gateway.completeReminder(id));
  }

  /** Adia para daqui a `days` dias (1 = amanhã). */
  snooze(id: string, days = 1): void {
    this.enqueue(() => this.gateway.snoozeReminder(id, days));
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }

  private enqueue(write: Write): void {
    if (this.busyState()) return;
    this.writes.next(write);
  }
}
