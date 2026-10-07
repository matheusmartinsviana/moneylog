import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type { AiAnalysisSummary } from '~/modules/ai/core/types/ai';
import { Problem, problemOf } from '~/util/api/problem';

export type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly problem: Problem }
  | {
      readonly status: 'ready';
      readonly items: readonly AiAnalysisSummary[];
      readonly hasNext: boolean;
    };

const PAGE_SIZE = 20;

/** Histórico de análises: carrega a primeira página e acrescenta as seguintes. Escopo de componente. */
@Injectable()
export class AiHistoryFacade {
  private readonly gateway = inject(AiGateway);
  private readonly loads = new Subject<number>();
  private readonly current = signal<HistoryState>({ status: 'loading' });
  private page = 1;
  private items: readonly AiAnalysisSummary[] = [];

  readonly state = this.current.asReadonly();
  readonly loadingMore = signal(false);
  readonly hasNext = computed(() => {
    const state = this.current();
    return state.status === 'ready' && state.hasNext;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap((page) =>
          this.gateway.history(page, PAGE_SIZE).pipe(
            map((slice): HistoryState => {
              this.page = page;
              this.items = page === 1 ? slice.items : [...this.items, ...slice.items];
              return this.items.length === 0
                ? { status: 'empty' }
                : { status: 'ready', items: this.items, hasNext: slice.hasNext };
            }),
            startWith<HistoryState | null>(page === 1 ? { status: 'loading' } : null),
            catchError((error: unknown) =>
              of<HistoryState>({ status: 'error', problem: problemOf(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.loadingMore.set(state === null);
        if (state !== null) this.current.set(state);
      });
  }

  /** Conteúdo enviado por análise (`GET /analyses/{id}`), buscado só quando o usuário pede para ver. */
  readonly payloads = signal<
    Readonly<Record<string, { status: 'loading' | 'error' | 'ready'; text: string | null }>>
  >({});

  loadPayload(id: string): void {
    if (this.payloads()[id]?.status === 'ready') return;
    this.payloads.update((p) => ({ ...p, [id]: { status: 'loading', text: null } }));
    this.gateway
      .analysis(id)
      .pipe(
        map((a) => a.redactedPayload),
        catchError(() => of(undefined)),
      )
      .subscribe((text) =>
        this.payloads.update((p) => ({
          ...p,
          [id]: text === undefined ? { status: 'error', text: null } : { status: 'ready', text },
        })),
      );
  }

  load(): void {
    this.loads.next(1);
  }

  loadMore(): void {
    this.loads.next(this.page + 1);
  }
}
