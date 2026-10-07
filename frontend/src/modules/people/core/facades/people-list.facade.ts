import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  defer,
  distinctUntilChanged,
  EMPTY,
  expand,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { PeopleGateway } from '~/modules/people/core/interfaces/people.gateway';
import type { Person, PersonInput, PersonStatus } from '~/modules/people/core/types/person';
import { IdempotencyTracker } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export type PeopleListState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: readonly Person[] };

interface Load {
  readonly status: PersonStatus;
  readonly q: string;
}

const LOADING: PeopleListState = { status: 'loading' };

/** Espera da digitação antes de buscar pelo nome (a busca anterior é cancelada). */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Facade de negócio da lista de pessoas (FE 01). Expõe `loading`/`empty`/`error`/`data` por signals e
 * repassa o que a API devolveu: `net`, `direction`, `openDebts` e `nextDueDate` chegam como vieram
 * (nenhuma soma no front, S-142). `search` espera a digitação (300 ms) e cancela a busca anterior.
 * `loadAll` pagina até o fim (como S-91) para os seletores de pessoa. Escopo de componente.
 */
@Injectable()
export class PeopleListFacade {
  private readonly gateway = inject(PeopleGateway);
  private readonly loads = new Subject<Load>();
  private readonly searches = new Subject<string>();
  private readonly current = signal<PeopleListState>(LOADING);
  private readonly queryState = signal('');
  private status: PersonStatus = 'ACTIVE';
  private readonly createKeys = new IdempotencyTracker<PersonInput>();

  readonly state = this.current.asReadonly();
  /** Texto da busca em vigor (para distinguir "ninguém cadastrado" de "nenhum resultado"). */
  readonly query = this.queryState.asReadonly();
  readonly loading = computed(() => this.current().status === 'loading');
  readonly empty = computed(() => this.current().status === 'empty');
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.problem : null;
  });
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    this.loads
      .pipe(
        // switchMap: uma busca nova (ou trocar de aba) descarta a anterior.
        switchMap(({ status, q }) =>
          this.loadAll(status, q).pipe(
            map((data): PeopleListState =>
              data.length === 0 ? { status: 'empty' } : { status: 'ready', data },
            ),
            startWith(LOADING),
            catchError((error: unknown) =>
              of<PeopleListState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.searches
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => this.load(this.status, q));
  }

  /** Carrega (ou recarrega, no "tentar de novo") as pessoas do filtro; sem filtro, as ativas. */
  load(status: PersonStatus = 'ACTIVE', q = this.queryState()): void {
    this.status = status;
    this.queryState.set(q);
    this.loads.next({ status, q });
  }

  /** Busca pelo nome com espera (300 ms); só a última digitação chega ao backend. */
  search(q: string): void {
    this.searches.next(q.trim());
  }

  /** Todas as pessoas do filtro, pedindo `pageSize=50` e paginando até o fim. */
  loadAll(status: PersonStatus = 'ACTIVE', q = ''): Observable<readonly Person[]> {
    const page = (n: number) => this.gateway.list({ status, q, page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce((all: readonly Person[], slice) => [...all, ...slice.items], [] as readonly Person[]),
    );
  }

  /**
   * Cria a pessoa antes da dívida (S-138): devolve a pessoa da resposta, que passa a ser a escolhida.
   * Com `Idempotency-Key`: depois de uma falha ambígua, criar o mesmo nome de novo reusa a chave.
   */
  create(input: PersonInput): Observable<Person> {
    return defer(() => this.gateway.create(input, this.createKeys.begin(input))).pipe(
      tap({
        next: () => this.createKeys.succeeded(),
        error: (error: unknown) => this.createKeys.failed(problemOf(error)),
      }),
    );
  }

  archive(id: string): Observable<Person> {
    return this.gateway.archive(id).pipe(tap((person) => this.replace(person)));
  }

  unarchive(id: string): Observable<Person> {
    return this.gateway.unarchive(id).pipe(tap((person) => this.replace(person)));
  }

  /** Troca a pessoa pelo recurso da resposta; sai da lista se deixou de casar com o filtro. */
  private replace(person: Person): void {
    const state = this.current();
    if (state.status !== 'ready') return;
    const wantsArchived = this.status === 'ARCHIVED';
    const data = state.data
      .map((item) => (item.id === person.id ? person : item))
      .filter((item) => item.archived === wantsArchived);
    this.current.set(data.length === 0 ? { status: 'empty' } : { status: 'ready', data });
  }
}
