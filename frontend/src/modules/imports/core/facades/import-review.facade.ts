import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
  defaultIfEmpty,
  EMPTY,
  expand,
  finalize,
  forkJoin,
  from,
  map,
  Observable,
  of,
  reduce,
  startWith,
  Subject,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { ImportsGateway } from '~/modules/imports/core/interfaces/imports.gateway';
import type {
  ImportBatch,
  ImportBlocked,
  ImportBulkResult,
  ImportLine,
  ImportLineFlag,
  ImportLinePatch,
  ImportLineStatus,
} from '~/modules/imports/core/types/import';
import {
  applyFailureOf,
  type ImportApplyFailure,
} from '~/modules/imports/core/types/import-apply-failure';
import { IdempotencyTracker } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';
import { MAX_PAGE_SIZE } from '~/util/api/slice';

export interface ImportLinesFilter {
  readonly status: ImportLineStatus | null;
  readonly flag: ImportLineFlag | null;
}

export type ImportReviewLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready' };

export type ImportBusy = 'line' | 'bulk' | 'apply' | 'undo' | 'discard';

/** O backend aceita até 500 ids por chamada de `lines:bulk`. */
const BULK_CHUNK = 500;

interface Command {
  readonly busy: ImportBusy;
  readonly run: () => Observable<unknown>;
}

/**
 * Facade da revisão de um lote: lote, linhas (páginas de 50, "carregar mais"), decisões, aplicar e desfazer.
 * Nada é calculado aqui: contadores e estados vêm do backend. Depois de cada ação o lote é relido; em falha
 * (inclusive parcial) as linhas são recarregadas do backend. As ações rodam em fila (`concatMap`); aplicar,
 * desfazer e o lote em massa ignoram um segundo clique enquanto rodam. Aplicar leva `Idempotency-Key`
 * (reutilizada se a tentativa anterior falhou de forma ambígua). Escopo de componente.
 */
@Injectable()
export class ImportReviewFacade {
  private readonly gateway = inject(ImportsGateway);
  private readonly loads = new Subject<string>();
  private readonly commands = new Subject<Command>();
  private readonly keys = new IdempotencyTracker<string>();
  private batchId: string | null = null;
  private page = 1;

  private readonly loadState = signal<ImportReviewLoad>({ status: 'loading' });
  private readonly batchState = signal<ImportBatch | null>(null);
  private readonly linesState = signal<readonly ImportLine[]>([]);
  private readonly hasMoreState = signal(false);
  private readonly moreLoading = signal(false);
  private readonly filterState = signal<ImportLinesFilter>({ status: null, flag: null });
  private readonly busyState = signal<ImportBusy | null>(null);
  private readonly problemState = signal<Problem | null>(null);
  private readonly createdState = signal<readonly string[] | null>(null);
  private readonly blockedState = signal<readonly ImportBlocked[]>([]);
  private readonly bulkState = signal<ImportBulkResult | null>(null);
  private readonly discardedState = signal(false);
  private readonly legConflictState = signal<string | null>(null);

  readonly loadStatus = this.loadState.asReadonly();
  readonly batch = this.batchState.asReadonly();
  readonly lines = this.linesState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.moreLoading.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  /** Falha da última ação (traduzida pela tela pelo `code`). */
  readonly problem = this.problemState.asReadonly();
  /** Ids das movimentações criadas pelo último "Aplicar". */
  readonly created = this.createdState.asReadonly();
  /** O que a guarda impediu de estornar no último "Desfazer". */
  readonly blocked = this.blockedState.asReadonly();
  /** Resultado do último "Aceitar todas as sem decisão" (`skipped` explica o que ficou). */
  readonly bulkResult = this.bulkState.asReadonly();
  /** `true` depois que o backend descartou o lote (a tela volta à lista). */
  readonly discarded = this.discardedState.asReadonly();
  /** Linha cuja transferência foi recusada porque a outra ponta já foi lançada (aceitar como está ou rejeitar). */
  readonly legConflictLineId = this.legConflictState.asReadonly();
  /** Linha e causa de um `IMPORT_APPLY_FAILED`, lidas do `detail`. */
  readonly applyFailure = computed<ImportApplyFailure | null>(() =>
    applyFailureOf(this.problemState()),
  );
  readonly editable = computed(() => this.batchState()?.status === 'PENDING_REVIEW');
  /** O que o backend diz que falta decidir (`counts.requireDecision`). */
  readonly requireDecision = computed(() => this.batchState()?.counts.requireDecision ?? 0);

  constructor() {
    this.loads
      .pipe(
        switchMap((id) => {
          this.batchId = id;
          this.page = 1;
          this.loadState.set({ status: 'loading' });
          return forkJoin([this.gateway.get(id), this.fetchLines(1)]).pipe(
            map(([batch, slice]) => {
              this.batchState.set(batch);
              this.setLines(slice.items, slice.hasNext);
              return { status: 'ready' } as ImportReviewLoad;
            }),
            catchError((error: unknown) =>
              of<ImportReviewLoad>({ status: 'error', problem: problemOf(error) }),
            ),
            startWith<ImportReviewLoad>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.loadState.set(state));

    this.commands
      .pipe(
        concatMap((command) => {
          this.busyState.set(command.busy);
          this.problemState.set(null);
          this.legConflictState.set(null);
          return command.run().pipe(
            defaultIfEmpty(null),
            catchError((error: unknown) => {
              this.problemState.set(problemOf(error));
              // Falha: o backend é a verdade; recarrega lote e linhas.
              return this.reload().pipe(catchError(() => of(null)));
            }),
            finalize(() => this.busyState.set(null)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  load(id: string): void {
    this.loads.next(id);
  }

  retry(): void {
    if (this.batchId) this.load(this.batchId);
  }

  setFilter(filter: ImportLinesFilter): void {
    this.filterState.set(filter);
    this.page = 1;
    this.enqueueReloadLines();
  }

  loadMore(): void {
    if (!this.hasMoreState() || this.moreLoading() || !this.batchId) return;
    this.moreLoading.set(true);
    this.fetchLines(this.page + 1)
      .pipe(finalize(() => this.moreLoading.set(false)))
      .subscribe({
        next: (slice) => {
          this.page += 1;
          this.linesState.update((all) => [...all, ...slice.items]);
          this.hasMoreState.set(slice.hasNext);
        },
        error: (error: unknown) => this.problemState.set(problemOf(error)),
      });
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }

  /** Aceitar, rejeitar, forçar ou decidir uma linha: usa a linha devolvida e relê o lote. */
  review(lineId: string, patch: ImportLinePatch): void {
    const id = this.batchId;
    if (!id || !this.editable()) return;
    this.enqueue({
      busy: 'line',
      run: () =>
        this.gateway.reviewLine(id, lineId, patch).pipe(
          catchError((error: unknown) => {
            if (problemOf(error).code === 'IMPORT_TRANSFER_LEG_ALREADY_RECORDED') {
              this.legConflictState.set(lineId);
            }
            return throwError(() => error);
          }),
          tap((line) =>
            this.linesState.update((all) => all.map((l) => (l.id === line.id ? line : l))),
          ),
          switchMap(() => this.refreshBatch()),
        ),
    });
  }

  /** "Aceitar todas as sem decisão": ids das linhas `PENDING` sem `requiresDecision`, em lotes de 500. */
  acceptAllWithoutDecision(): void {
    const id = this.batchId;
    if (!id || !this.editable()) return;
    this.enqueueBulk(id, 'ACCEPT');
  }

  applyBatch(): void {
    const id = this.batchId;
    if (!id || !this.editable()) return;
    this.enqueue({
      busy: 'apply',
      run: () =>
        this.gateway.apply(id, this.keys.begin(id)).pipe(
          tap({
            next: (applied) => {
              this.keys.succeeded();
              this.batchState.set(applied.batch);
              this.createdState.set(applied.created);
            },
            error: (error: unknown) => this.keys.failed(problemOf(error)),
          }),
          switchMap(() => this.reloadLines()),
        ),
    });
  }

  /** Descarta o lote em revisão; a resposta (204) marca `discarded` e a tela volta à lista. */
  discardBatch(): void {
    const id = this.batchId;
    if (!id || !this.editable()) return;
    this.enqueue({
      busy: 'discard',
      run: () => this.gateway.discard(id).pipe(tap(() => this.discardedState.set(true))),
    });
  }

  /** Rejeita a linha apontada por `IMPORT_APPLY_FAILED` (posição no arquivo, entre as aceitas). */
  rejectAcceptedAt(position: number): void {
    const id = this.batchId;
    if (!id || !this.editable()) return;
    this.enqueue({
      busy: 'line',
      run: () =>
        this.fetchAll(id, 'ACCEPTED').pipe(
          map((lines) => lines.find((l) => l.position === position)),
          switchMap((line) =>
            line
              ? this.gateway.reviewLine(id, line.id, { action: 'REJECT' })
              : throwError(() => new Error('line-not-found')),
          ),
          switchMap(() => this.reload()),
        ),
    });
  }

  undoBatch(reason: string | null): void {
    const id = this.batchId;
    if (!id || this.batchState()?.status === 'PENDING_REVIEW') return;
    this.enqueue({
      busy: 'undo',
      run: () =>
        this.gateway.undo(id, reason).pipe(
          tap((undone) => {
            this.batchState.set(undone.batch);
            this.blockedState.set(undone.blocked);
          }),
          switchMap(() => this.reloadLines()),
        ),
    });
  }

  private enqueueBulk(id: string, action: 'ACCEPT' | 'REJECT'): void {
    this.bulkState.set(null);
    this.enqueue({
      busy: 'bulk',
      run: () =>
        this.fetchAllPending(id).pipe(
          map((pending) => pending.filter((line) => !line.requiresDecision).map((l) => l.id)),
          switchMap((ids) => {
            const chunks: string[][] = [];
            for (let i = 0; i < ids.length; i += BULK_CHUNK)
              chunks.push(ids.slice(i, i + BULK_CHUNK));
            return from(chunks).pipe(
              concatMap((chunk) => this.gateway.bulk(id, chunk, action)),
              reduce(
                (total: ImportBulkResult, part) => ({
                  updated: total.updated + part.updated,
                  skipped: [...total.skipped, ...part.skipped],
                }),
                { updated: 0, skipped: [] } as ImportBulkResult,
              ),
            );
          }),
          tap((result) => this.bulkState.set(result)),
          switchMap(() => this.reload()),
        ),
    });
  }

  private enqueue(command: Command): void {
    const busy = this.busyState();
    if (busy === 'apply' || busy === 'undo' || busy === 'bulk' || busy === 'discard') return;
    this.commands.next(command);
  }

  private enqueueReloadLines(): void {
    this.commands.next({ busy: 'line', run: () => this.reloadLines() });
  }

  private fetchLines(page: number) {
    const filter = this.filterState();
    return this.gateway.lines(this.batchId ?? '', {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.flag ? { flag: filter.flag } : {}),
      page,
      pageSize: MAX_PAGE_SIZE,
    });
  }

  private fetchAllPending(id: string): Observable<readonly ImportLine[]> {
    return this.fetchAll(id, 'PENDING');
  }

  private fetchAll(id: string, status: ImportLineStatus): Observable<readonly ImportLine[]> {
    const page = (n: number) =>
      this.gateway.lines(id, { status, page: n, pageSize: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((slice, index) => (slice.hasNext ? page(index + 2) : EMPTY)),
      reduce(
        (all: readonly ImportLine[], slice) => [...all, ...slice.items],
        [] as readonly ImportLine[],
      ),
    );
  }

  private refreshBatch(): Observable<ImportBatch> {
    const id = this.batchId;
    if (!id) return EMPTY;
    return this.gateway.get(id).pipe(tap((batch) => this.batchState.set(batch)));
  }

  private reloadLines(): Observable<unknown> {
    this.page = 1;
    return this.fetchLines(1).pipe(tap((slice) => this.setLines(slice.items, slice.hasNext)));
  }

  private reload(): Observable<unknown> {
    return this.refreshBatch().pipe(switchMap(() => this.reloadLines()));
  }

  private setLines(items: readonly ImportLine[], hasNext: boolean): void {
    this.linesState.set(items);
    this.hasMoreState.set(hasNext);
  }
}
