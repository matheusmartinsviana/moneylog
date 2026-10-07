import { Provider } from '@angular/core';
import { Observable, of, Subject, throwError } from 'rxjs';

import { ImportsGateway } from '~/modules/imports/core/interfaces/imports.gateway';
import type {
  ImportAction,
  ImportApplied,
  ImportBatch,
  ImportBulkResult,
  ImportLine,
  ImportLinePatch,
  ImportLinesQuery,
  ImportMapping,
  ImportUndone,
  ImportUploadEvent,
  ImportUploadInput,
} from '~/modules/imports/core/types/import';
import { Problem, ProblemError } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';

const brl = (amount: string) => ({ amount, currency: 'BRL' });

export function aLine(overrides: Partial<ImportLine> = {}): ImportLine {
  return {
    id: 'l-1',
    position: 1,
    date: '2026-10-05',
    amount: brl('24.50'),
    direction: 'OUT',
    description: 'PADARIA SAO JORGE',
    normalizedDescription: 'padaria sao jorge',
    status: 'PENDING',
    flags: [],
    requiresDecision: false,
    rejectReason: null,
    categoryId: null,
    method: null,
    editedDescription: null,
    counterpartAccountId: null,
    suggestion: { categoryId: 'cat-food', method: 'DEBIT', confidence: 'HIGH' },
    matches: [],
    transactionId: null,
    ...overrides,
  };
}

export function aBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 'b-1',
    accountId: 'acc-1',
    cardId: null,
    format: 'CSV',
    status: 'PENDING_REVIEW',
    warnings: [],
    skipped: [],
    counts: {
      total: 3,
      pending: 3,
      accepted: 0,
      rejected: 0,
      duplicate: 0,
      possibleDuplicate: 0,
      requireDecision: 0,
    },
    createdAt: '2026-10-07T12:00:00Z',
    appliedAt: null,
    undoneAt: null,
    undoReason: null,
    ...overrides,
  };
}

/** Porta falsa de importação: o lote e as linhas vivem aqui; o teste lê as chamadas. */
export class ImportsGatewayStub extends ImportsGateway {
  batch: ImportBatch = aBatch();
  batches: ImportBatch[] = [];
  lineList: ImportLine[] = [aLine()];
  mapping: ImportMapping | null = null;
  readonly calls: string[] = [];
  readonly patches: { lineId: string; patch: ImportLinePatch }[] = [];
  readonly bulkCalls: { ids: readonly string[]; action: string }[] = [];
  readonly uploads: { input: ImportUploadInput; key: string }[] = [];
  readonly applyKeys: string[] = [];
  readonly lineQueries: ImportLinesQuery[] = [];
  /** Upload controlado pelo teste (progresso, cancelamento). */
  uploadStream: Subject<ImportUploadEvent> | null = null;
  uploadUnsubscribed = 0;
  applyError: Problem | null = null;
  discardError: Problem | null = null;
  patchError: Problem | null = null;
  undoResult: ImportUndone | null = null;
  bulkResult: ImportBulkResult | null = null;

  upload(input: ImportUploadInput, idempotencyKey: string): Observable<ImportUploadEvent> {
    this.uploads.push({ input, key: idempotencyKey });
    const stream = this.uploadStream;
    if (!stream) return of({ kind: 'done', batch: this.batch });
    return new Observable<ImportUploadEvent>((subscriber) => {
      const sub = stream.subscribe(subscriber);
      return () => {
        this.uploadUnsubscribed += 1;
        sub.unsubscribe();
      };
    });
  }

  list(): Observable<Slice<ImportBatch>> {
    return of({ items: this.batches, hasNext: false });
  }

  get(id: string): Observable<ImportBatch> {
    this.calls.push(`get:${id}`);
    return of(this.batch);
  }

  lines(_id: string, query: ImportLinesQuery): Observable<Slice<ImportLine>> {
    this.lineQueries.push(query);
    const items = this.lineList.filter(
      (l) =>
        (!query.status || l.status === query.status) &&
        (!query.flag || l.flags.includes(query.flag)),
    );
    const start = (query.page - 1) * query.pageSize;
    return of({
      items: items.slice(start, start + query.pageSize),
      hasNext: start + query.pageSize < items.length,
    });
  }

  reviewLine(_id: string, lineId: string, patch: ImportLinePatch): Observable<ImportLine> {
    this.patches.push({ lineId, patch });
    if (this.patchError) return throwError(() => new ProblemError(this.patchError as Problem));
    const current = this.lineList.find((l) => l.id === lineId) ?? aLine({ id: lineId });
    const updated: ImportLine = {
      ...current,
      status:
        patch.action === 'REJECT' ? 'REJECTED' : patch.action === 'REOPEN' ? 'PENDING' : 'ACCEPTED',
      categoryId: patch.categoryId ?? current.categoryId,
      requiresDecision: false,
    };
    this.lineList = this.lineList.map((l) => (l.id === lineId ? updated : l));
    this.batch = {
      ...this.batch,
      counts: {
        ...this.batch.counts,
        accepted: this.lineList.filter((l) => l.status === 'ACCEPTED').length,
        rejected: this.lineList.filter((l) => l.status === 'REJECTED').length,
        pending: this.lineList.filter((l) => l.status === 'PENDING').length,
        requireDecision: this.lineList.filter((l) => l.requiresDecision).length,
      },
    };
    return of(updated);
  }

  bulk(
    _id: string,
    lineIds: readonly string[],
    action: Exclude<ImportAction, 'FORCE' | 'REOPEN'>,
  ): Observable<ImportBulkResult> {
    this.bulkCalls.push({ ids: lineIds, action });
    this.lineList = this.lineList.map((l) =>
      lineIds.includes(l.id) ? { ...l, status: action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' } : l,
    );
    return of(this.bulkResult ?? { updated: lineIds.length, skipped: [] });
  }

  apply(_id: string, idempotencyKey: string): Observable<ImportApplied> {
    this.applyKeys.push(idempotencyKey);
    if (this.applyError) return throwError(() => new ProblemError(this.applyError as Problem));
    this.batch = { ...this.batch, status: 'APPLIED', appliedAt: '2026-10-07T13:00:00Z' };
    return of({ batch: this.batch, created: ['tx-1', 'tx-2'] });
  }

  discard(id: string): Observable<void> {
    this.calls.push(`discard:${id}`);
    if (this.discardError) return throwError(() => new ProblemError(this.discardError as Problem));
    return of(undefined);
  }

  undo(_id: string, reason: string | null): Observable<ImportUndone> {
    this.calls.push(`undo:${reason ?? ''}`);
    const result = this.undoResult ?? {
      batch: { ...this.batch, status: 'UNDONE' as const },
      blocked: [],
    };
    this.batch = result.batch;
    return of(result);
  }

  savedMapping(): Observable<ImportMapping | null> {
    return of(this.mapping);
  }
}

export function provideImportsStub(
  gateway: ImportsGatewayStub = new ImportsGatewayStub(),
): Provider[] {
  return [{ provide: ImportsGateway, useValue: gateway }];
}
