import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY as NEVER_EMITS,
  forkJoin,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';

import { DashboardGateway } from '~/modules/dashboard/core/interfaces/dashboard.gateway';
import {
  DashboardFailure,
  DashboardFailureReason,
} from '~/modules/dashboard/core/types/dashboard-failure';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';
import { LEDGER_GATE } from '~/util/api/ledger-gate';

/** O que a tela Início exibe quando há dados. Os valores são os recebidos da porta, sem cálculo. */
export interface DashboardOverview {
  readonly summary: DashboardSummary;
  readonly upcoming: Upcoming;
}

export type DashboardState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly reason: DashboardFailureReason }
  | { readonly status: 'ready'; readonly data: DashboardOverview };

const LOADING: DashboardState = { status: 'loading' };
const EMPTY: DashboardState = { status: 'empty' };

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(source: Observable<T>): Observable<Settled<T>> {
  return source.pipe(
    map((value): Settled<T> => ({ ok: true, value })),
    catchError((error: unknown) => of<Settled<T>>({ ok: false, error })),
  );
}

function failureReason(error: unknown): DashboardFailureReason {
  return error instanceof DashboardFailure ? error.reason : 'unavailable';
}

/**
 * Facade de negócio do Início (FE 01): orquestra a porta e expõe o estado da tela por signals.
 * Não soma, não subtrai e não recalcula nada: repassa o resumo exatamente como veio (arquitetura §1).
 *
 * Escopo de componente (`providers: [DashboardFacade]` na página): o estado nasce a cada visita e a
 * assinatura termina com a página (`takeUntilDestroyed`).
 */
@Injectable()
export class DashboardFacade {
  private readonly gateway = inject(DashboardGateway);
  private readonly gate = inject(LEDGER_GATE, { optional: true });
  private readonly loads = new Subject<boolean>();
  private readonly refreshFailedState = signal(false);
  private readonly current = signal<DashboardState>(LOADING);

  readonly state = this.current.asReadonly();
  /** Uma recarga silenciosa (`reload`) falhou: o Início continua com o último dado bom, mais um aviso. */
  readonly refreshFailed = this.refreshFailedState.asReadonly();
  readonly loading = computed(() => this.current().status === 'loading');
  readonly empty = computed(() => this.current().status === 'empty');
  readonly error = computed(() => {
    const state = this.current();
    return state.status === 'error' ? state.reason : null;
  });
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    this.loads
      .pipe(
        // switchMap: um novo "tentar de novo" substitui a carga anterior, que é descartada.
        switchMap((silent) =>
          silent
            ? this.fetch().pipe(
                // Recarga em segundo plano: se falha e já há dado na tela, mantém o dado e avisa.
                switchMap((state) => {
                  if (state.status === 'error' && this.current().status === 'ready') {
                    this.refreshFailedState.set(true);
                    return NEVER_EMITS;
                  }
                  return of(state);
                }),
              )
            : this.fetch().pipe(startWith(LOADING)),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.refreshFailedState.set(false);
        this.current.set(state);
      });
  }

  /** Carrega (ou recarrega, no "tentar de novo") o resumo do Início, voltando ao esqueleto. */
  load(): void {
    this.loads.next(false);
  }

  /** Recarrega sem piscar o esqueleto (depois de realizar uma ocorrência na folha, que fica montada). */
  reload(): void {
    this.loads.next(true);
  }

  /** No Início as leituras do razão passam pelo `LedgerGate` (no máximo 2 em voo, R13); o dashboard vai primeiro. */
  private gated<T>(source: Observable<T>, priority: number): Observable<T> {
    return this.gate ? this.gate.run(source, priority) : source;
  }

  private fetch(): Observable<DashboardState> {
    // As duas leituras são independentes: vão em paralelo, numa ida só (FE 05). O estado vazio vem
    // de `summary.hasAccounts` (S-61): nenhuma requisição a `/v1/accounts` sai do Início.
    //
    // Cada leitura termina "assentada" (valor ou falha): o `forkJoin` só emite quando as duas acabam.
    // Se uma falha e a outra é cancelada, a requisição irmã fica abortada no navegador enquanto o
    // backend a processa até o fim, e o "tentar de novo" a repete por cima da anterior.
    return forkJoin({
      summary: settle(this.gated(this.gateway.getSummary(), -2)),
      upcoming: settle(this.gated(this.gateway.getUpcoming(), -1)),
    }).pipe(
      map(({ summary, upcoming }): DashboardState => {
        if (!summary.ok) return { status: 'error', reason: failureReason(summary.error) };
        if (!upcoming.ok) return { status: 'error', reason: failureReason(upcoming.error) };
        return summary.value.hasAccounts
          ? { status: 'ready', data: { summary: summary.value, upcoming: upcoming.value } }
          : EMPTY;
      }),
    );
  }
}
