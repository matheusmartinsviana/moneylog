import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, exhaustMap, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { PeopleGateway } from '~/modules/people/core/interfaces/people.gateway';
import type { PersonDetail } from '~/modules/people/core/types/person';
import { Problem, problemOf } from '~/util/api/problem';

export type PersonDetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly person: PersonDetail };

interface Load {
  readonly id: string;
  readonly silent: boolean;
}

/**
 * Facade da tela da pessoa: o saldo (`net`, `direction`), a próxima cobrança e o histórico de dívidas,
 * como o backend os calculou. `refresh` recarrega sem piscar (depois de quitar ou perdoar uma dívida).
 * Arquivar e desarquivar usam a pessoa da resposta e recarregam o detalhe. Escopo de componente.
 */
@Injectable()
export class PersonDetailFacade {
  private readonly gateway = inject(PeopleGateway);
  private readonly loads = new Subject<Load>();
  private readonly toggles = new Subject<{ id: string; archive: boolean }>();
  private readonly current = signal<PersonDetailState>({ status: 'idle' });
  private readonly busyState = signal(false);
  private readonly refreshProblemState = signal<Problem | null>(null);
  private lastId: string | null = null;
  private readonly problemState = signal<Problem | null>(null);

  readonly state = this.current.asReadonly();
  /** Uma recarga silenciosa falhou: a tela continua com o último dado bom, mais este aviso. */
  readonly refreshProblem = this.refreshProblemState.asReadonly();
  readonly person = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.person : null;
  });
  /** Arquivar/desarquivar em andamento. */
  readonly busy = this.busyState.asReadonly();
  /** Falha do último arquivar/desarquivar. */
  readonly problem = this.problemState.asReadonly();

  constructor() {
    this.loads
      .pipe(
        switchMap(({ id, silent }) =>
          this.gateway.get(id).pipe(
            map((person): PersonDetailState => ({ status: 'ready', person })),
            silent ? (source) => source : startWith<PersonDetailState>({ status: 'loading' }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              // Recarga em segundo plano que falha: a tela que já está pronta continua (com um aviso).
              if (silent && problem.status !== 404 && this.current().status === 'ready') {
                this.refreshProblemState.set(problem);
                return EMPTY;
              }
              return of<PersonDetailState>(
                problem.status === 404 ? { status: 'notFound' } : { status: 'error', problem },
              );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.refreshProblemState.set(null);
        this.current.set(state);
      });

    this.toggles
      .pipe(
        exhaustMap(({ id, archive }) => {
          this.busyState.set(true);
          this.problemState.set(null);
          const call = archive ? this.gateway.archive(id) : this.gateway.unarchive(id);
          return call.pipe(
            tap(() => this.refresh(id)),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.busyState.set(false);
        this.problemState.set(problem);
      });
  }

  load(id: string): void {
    this.lastId = id;
    this.loads.next({ id, silent: false });
  }

  refresh(id: string): void {
    this.lastId = id;
    this.loads.next({ id, silent: true });
  }

  /** "Tentar de novo" do aviso de recarga que falhou. */
  retryRefresh(): void {
    if (this.lastId !== null) this.loads.next({ id: this.lastId, silent: true });
  }

  archive(id: string): void {
    this.toggles.next({ id, archive: true });
  }

  unarchive(id: string): void {
    this.toggles.next({ id, archive: false });
  }
}
