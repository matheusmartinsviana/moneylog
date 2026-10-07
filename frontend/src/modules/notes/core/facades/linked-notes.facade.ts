import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { NotesGateway } from '~/modules/notes/core/interfaces/notes.gateway';
import type { NoteLinkType, NoteSummary } from '~/modules/notes/core/types/note';
import { Problem, problemOf } from '~/util/api/problem';

export type LinkedNotesState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | {
      readonly status: 'ready';
      readonly items: readonly NoteSummary[];
      readonly hasNext: boolean;
    };

export interface LinkedNotesTarget {
  readonly type: NoteLinkType;
  /** `id` da entidade, ou `key` (`AAAA-MM`) no resumo mensal. */
  readonly id?: string;
  readonly key?: string;
}

const PAGE_SIZE = 20;

/**
 * Facade do bloco "Notas vinculadas" das telas financeiras (`GET /v1/links`): só notas ativas, mais recentes
 * primeiro. Trocar o alvo cancela a requisição anterior (`switchMap`). **Não calcula nada financeiro**: a nota
 * nunca altera o valor da entidade. Escopo de componente.
 */
@Injectable()
export class LinkedNotesFacade {
  private readonly gateway = inject(NotesGateway);
  private readonly commands = new Subject<{
    readonly target: LinkedNotesTarget;
    readonly page: number;
  }>();
  private readonly current = signal<LinkedNotesState>({ status: 'loading' });
  private readonly moreState = signal(false);
  private target: LinkedNotesTarget | null = null;
  private page = 1;

  readonly state = this.current.asReadonly();
  readonly loadingMore = this.moreState.asReadonly();
  readonly items = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.items : [];
  });

  constructor() {
    this.commands
      .pipe(
        switchMap(({ target, page }) =>
          this.fetch(target, page).pipe(
            map((slice): LinkedNotesState => {
              const before = this.current();
              const previous = page > 1 && before.status === 'ready' ? before.items : [];
              return {
                status: 'ready',
                items: [...previous, ...slice.items],
                hasNext: slice.hasNext,
              };
            }),
            tap(() => {
              this.page = page;
              this.moreState.set(false);
            }),
            startWith(...(page === 1 ? [{ status: 'loading' } as LinkedNotesState] : [])),
            catchError((error: unknown) => {
              this.moreState.set(false);
              return of<LinkedNotesState>({ status: 'error', problem: problemOf(error) });
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** Carrega (ou recarrega, no "tentar de novo") as notas ligadas ao alvo. */
  load(target: LinkedNotesTarget): void {
    this.target = target;
    this.commands.next({ target, page: 1 });
  }

  retry(): void {
    if (this.target) this.load(this.target);
  }

  loadMore(): void {
    const state = this.current();
    if (this.target && state.status === 'ready' && state.hasNext && !this.moreState()) {
      this.moreState.set(true);
      this.commands.next({ target: this.target, page: this.page + 1 });
    }
  }

  private fetch(target: LinkedNotesTarget, page: number) {
    return this.gateway.linkedTo({
      type: target.type,
      ...(target.id ? { id: target.id } : {}),
      ...(target.key ? { key: target.key } : {}),
      page,
      pageSize: PAGE_SIZE,
    }) as Observable<{ items: readonly NoteSummary[]; hasNext: boolean }>;
  }
}
