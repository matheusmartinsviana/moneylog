import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  filter,
  map,
  merge,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  timer,
} from 'rxjs';

import { SearchGateway } from '~/modules/search/core/interfaces/search.gateway';
import { SEARCH_GROUPS, type SearchResults } from '~/modules/search/core/types/search';
import { Problem, problemOf } from '~/util/api/problem';
import { searchQueryOf } from '~/util/search-term';

/** Espera entre a última tecla e a requisição (T209, pedido da rodada C1). */
export const GLOBAL_SEARCH_DEBOUNCE_MS = 300;

export type SearchFailureKind = 'invalid' | 'rateLimit' | 'generic';

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'empty'; readonly q: string }
  | { readonly status: 'error'; readonly kind: SearchFailureKind; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: SearchResults };

const IDLE: SearchState = { status: 'idle' };

function failureKind(problem: Problem): SearchFailureKind {
  if (problem.status === 429) return 'rateLimit';
  if (problem.code === 'SEARCH_QUERY_INVALID') return 'invalid';
  return 'generic';
}

function isEmpty(data: SearchResults): boolean {
  return SEARCH_GROUPS.every((group) => data[group].length === 0);
}

/**
 * Facade da busca global (T209). O texto digitado vira `q` (sem caracteres de controle, no máximo 100 caracteres,
 * mínimo 2); a requisição só sai depois de 300 ms parado e **a anterior é cancelada** (`switchMap`), então uma
 * resposta atrasada nunca sobrescreve a mais nova. Sem `q` válido volta a `idle` na hora (e cancela o que
 * estava em voo). Os resultados são repassados como vieram: nenhum total, nenhuma soma. Escopo de componente.
 */
@Injectable()
export class SearchFacade {
  private readonly gateway = inject(SearchGateway);
  private readonly typed = new Subject<string>();
  private readonly retries = new Subject<string>();
  private readonly current = signal<SearchState>(IDLE);
  private lastQuery: string | null = null;

  readonly state = this.current.asReadonly();
  /** O termo limpo da busca atual (`null` sem termo válido). */
  readonly query = signal<string | null>(null);
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    const debounced = this.typed.pipe(
      map((text) => searchQueryOf(text)),
      // Termo curto demais (ou vazio) limpa na hora; termo válido espera a pausa de digitação.
      // (`timer` e não `debounceTime` sobre `of(q)`: este emitiria no `complete`, sem esperar.)
      switchMap((q) =>
        q === null ? of(null) : timer(GLOBAL_SEARCH_DEBOUNCE_MS).pipe(map(() => q)),
      ),
      // Mesmo termo que a tela já mostra (um espaço a mais, por exemplo): nada a pedir.
      filter((q) => q === null || !this.showing(q)),
    );
    merge(debounced, this.retries)
      .pipe(
        switchMap((q) => this.fetch(q)),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));
  }

  /** O campo mudou. */
  type(text: string): void {
    const q = searchQueryOf(text);
    this.lastQuery = q;
    this.query.set(q);
    if (q === null) this.current.set(IDLE);
    else if (!this.showing(q)) {
      // Termo novo: não deixa resultados do termo anterior à mostra (e à mercê do Enter) durante a pausa.
      this.current.set({ status: 'loading' });
    }
    this.typed.next(text);
  }

  /** "Tentar de novo" depois de uma falha: repete o último termo sem esperar a pausa. */
  retry(): void {
    if (this.lastQuery !== null) this.retries.next(this.lastQuery);
  }

  /** Esvazia a busca (fechou o painel). */
  clear(): void {
    this.type('');
  }

  /** A tela já mostra o resultado (ou o "nada encontrado") deste mesmo termo. */
  private showing(q: string): boolean {
    const state = this.current();
    if (state.status === 'ready') return state.data.q === q;
    return state.status === 'empty' && state.q === q;
  }

  private fetch(q: string | null): Observable<SearchState> {
    if (q === null) return of(IDLE);
    return this.gateway.search(q).pipe(
      map((data): SearchState =>
        isEmpty(data) ? { status: 'empty', q } : { status: 'ready', data },
      ),
      startWith<SearchState>({ status: 'loading' }),
      catchError((error: unknown) => {
        const problem = problemOf(error);
        return of<SearchState>({ status: 'error', kind: failureKind(problem), problem });
      }),
    );
  }
}
