import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  exhaustMap,
  finalize,
  map,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

import { ImportsGateway } from '~/modules/imports/core/interfaces/imports.gateway';
import type {
  ImportBatch,
  ImportMapping,
  ImportUploadInput,
} from '~/modules/imports/core/types/import';
import { IdempotencyTracker, isAmbiguousFailure } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

/**
 * Facade do envio do extrato. `exhaustMap`: clique duplo = um envio só. Uma `Idempotency-Key` por tentativa,
 * reaproveitada depois de falha ambígua com o mesmo arquivo. Cancelar aborta a requisição (nada é criado:
 * o lote só nasce na resposta). Emite o lote devolvido pelo backend em `uploaded$`. Escopo de componente.
 */
@Injectable()
export class ImportUploadFacade {
  private readonly gateway = inject(ImportsGateway);
  private readonly starts = new Subject<ImportUploadInput>();
  private readonly cancels = new Subject<void>();
  private readonly uploadedEvents = new Subject<ImportBatch>();
  private readonly mappingLoads = new Subject<string>();
  private readonly keys = new IdempotencyTracker<unknown>();
  private readonly uploadingState = signal(false);
  private readonly percentState = signal<number | null>(null);
  private readonly problemState = signal<Problem | null>(null);
  private readonly cancelledState = signal(false);
  private readonly mappingState = signal<ImportMapping | null>(null);
  private last: ImportUploadInput | null = null;

  readonly uploading = this.uploadingState.asReadonly();
  /** Progresso do envio em % (`null` = o navegador não informou o total). */
  readonly percent = this.percentState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly cancelled = this.cancelledState.asReadonly();
  readonly savedMapping = this.mappingState.asReadonly();
  readonly canRetry = computed(() => isAmbiguousFailure(this.problemState()));
  readonly uploaded$ = this.uploadedEvents.asObservable();

  constructor() {
    this.starts
      .pipe(
        exhaustMap((input) => {
          this.uploadingState.set(true);
          this.percentState.set(0);
          this.problemState.set(null);
          this.cancelledState.set(false);
          const key = this.keys.begin({
            name: input.file.name,
            size: input.file.size,
            modified: input.file.lastModified,
            source: input.source,
            format: input.format,
            mapping: input.mapping,
          });
          return this.gateway.upload(input, key).pipe(
            takeUntil(
              this.cancels.pipe(
                tap(() => {
                  this.cancelledState.set(true);
                  this.keys.succeeded();
                }),
              ),
            ),
            tap((event) => {
              if (event.kind === 'progress') this.percentState.set(event.percent);
              else {
                this.keys.succeeded();
                this.uploadedEvents.next(event.batch);
              }
            }),
            map(() => null),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              this.keys.failed(problem);
              this.problemState.set(problem);
              return of(null);
            }),
            finalize(() => {
              this.uploadingState.set(false);
              this.percentState.set(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.mappingLoads
      .pipe(
        switchMap((sourceId) =>
          this.gateway
            .savedMapping(sourceId)
            .pipe(catchError(() => of<ImportMapping | null>(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((mapping) => this.mappingState.set(mapping));
  }

  start(input: ImportUploadInput): void {
    this.last = input;
    this.starts.next(input);
  }

  cancel(): void {
    if (this.uploadingState()) this.cancels.next();
  }

  retry(): void {
    if (this.last) this.starts.next(this.last);
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }

  /** Busca o mapeamento salvo da conta/cartão (a última busca vence). */
  loadSavedMapping(sourceId: string): void {
    this.mappingState.set(null);
    this.mappingLoads.next(sourceId);
  }

  clearSavedMapping(): void {
    this.mappingState.set(null);
  }
}
