import type {
  ImportApplied,
  ImportBatch,
  ImportBulkResult,
  ImportLine,
  ImportLinePatch,
  ImportMapping,
  ImportUndone,
} from '~/modules/imports/core/types/import';
import type {
  ImportAppliedResponse,
  ImportBatchResponse,
  ImportBulkResultResponse,
  ImportLinePatchRequest,
  ImportLineResponse,
  ImportMappingResponse,
  ImportUndoneResponse,
} from '~/modules/imports/infra/responses/import.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toBatch(r: ImportBatchResponse): ImportBatch {
  return {
    id: r.id,
    accountId: r.accountId ?? null,
    cardId: r.cardId ?? null,
    format: r.format,
    status: r.status,
    warnings: r.warnings,
    skipped: r.skipped,
    counts: { ...r.counts },
    createdAt: r.createdAt,
    appliedAt: r.appliedAt ?? null,
    undoneAt: r.undoneAt ?? null,
    undoReason: r.undoReason ?? null,
  };
}

export function toLine(r: ImportLineResponse): ImportLine {
  return {
    id: r.id,
    position: r.position,
    date: r.date,
    amount: money(r.amount),
    direction: r.direction,
    description: r.description,
    normalizedDescription: r.normalizedDescription,
    status: r.status,
    flags: r.flags,
    requiresDecision: r.requiresDecision,
    rejectReason: r.rejectReason ?? null,
    categoryId: r.categoryId ?? null,
    method: r.method ?? null,
    editedDescription: r.editedDescription ?? null,
    counterpartAccountId: r.counterpartAccountId ?? null,
    suggestion: r.suggestion
      ? {
          categoryId: r.suggestion.categoryId,
          method: r.suggestion.method ?? null,
          confidence: r.suggestion.confidence,
        }
      : null,
    matches: r.matches,
    transactionId: r.transactionId ?? null,
  };
}

export function toBulkResult(r: ImportBulkResultResponse): ImportBulkResult {
  return { updated: r.updated, skipped: r.skipped.map((s) => ({ ...s })) };
}

export function toApplied(r: ImportAppliedResponse): ImportApplied {
  return { batch: toBatch(r.batch), created: r.created };
}

export function toUndone(r: ImportUndoneResponse): ImportUndone {
  return { batch: toBatch(r.batch), blocked: r.blocked.map((b) => ({ ...b })) };
}

export function toMapping(r: ImportMappingResponse): ImportMapping {
  return {
    date: r.date,
    description: r.description,
    amount: r.amount ?? null,
    debit: r.debit ?? null,
    credit: r.credit ?? null,
    invert: r.invert === true,
    hasHeader: r.hasHeader !== false,
    delimiter: r.delimiter ?? null,
  };
}

export function toMappingRequest(m: ImportMapping): ImportMappingResponse {
  return {
    date: m.date,
    description: m.description,
    amount: m.amount,
    debit: m.debit,
    credit: m.credit,
    invert: m.invert,
    hasHeader: m.hasHeader,
    delimiter: m.delimiter,
  };
}

export function toPatchRequest(patch: ImportLinePatch): ImportLinePatchRequest {
  return {
    action: patch.action,
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
    ...(patch.method !== undefined
      ? { method: patch.method as ImportLinePatchRequest['method'] }
      : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.asTransferTo ? { asTransfer: { counterpartAccountId: patch.asTransferTo } } : {}),
    ...(patch.learn !== undefined ? { learn: patch.learn } : {}),
  };
}
