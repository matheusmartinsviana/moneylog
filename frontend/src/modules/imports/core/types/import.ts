import type { Money } from '~/util/money';

/** Tipos do negócio de importação de extrato (Etapa 7). Os valores e contadores vêm prontos do backend. */
export type ImportFormat = 'CSV' | 'OFX';
export type ImportBatchStatus = 'PENDING_REVIEW' | 'APPLIED' | 'UNDONE' | 'PARTIALLY_UNDONE';
export type ImportLineStatus =
  'PENDING' | 'ACCEPTED' | 'DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'REJECTED';
export type ImportLineFlag =
  | 'LOOKS_LIKE_INVOICE_PAYMENT'
  | 'CARD_CREDIT_NOT_IMPORTED'
  | 'LOOKS_LIKE_INSTALLMENT'
  | 'POSSIBLE_TRANSFER';
export type ImportDirection = 'IN' | 'OUT';
export type ImportAction = 'ACCEPT' | 'REJECT' | 'FORCE' | 'REOPEN';
export type ImportConfidence = 'HIGH' | 'MEDIUM';

export interface ImportCounts {
  readonly total: number;
  readonly pending: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly duplicate: number;
  readonly possibleDuplicate: number;
  readonly requireDecision: number;
}

export interface ImportBatch {
  readonly id: string;
  readonly accountId: string | null;
  readonly cardId: string | null;
  readonly format: ImportFormat;
  readonly status: ImportBatchStatus;
  /** `SAME_FILE_ALREADY_IMPORTED`, `STATEMENT_KIND_MISMATCH`. */
  readonly warnings: readonly string[];
  /** Linhas do arquivo ignoradas, no texto do backend ("n: motivo"). */
  readonly skipped: readonly string[];
  readonly counts: ImportCounts;
  readonly createdAt: string;
  readonly appliedAt: string | null;
  readonly undoneAt: string | null;
  readonly undoReason: string | null;
}

export interface ImportSuggestion {
  readonly categoryId: string;
  readonly method: string | null;
  readonly confidence: ImportConfidence;
}

export interface ImportLine {
  readonly id: string;
  readonly position: number;
  readonly date: string;
  readonly amount: Money;
  readonly direction: ImportDirection;
  readonly description: string;
  readonly normalizedDescription: string;
  readonly status: ImportLineStatus;
  readonly flags: readonly ImportLineFlag[];
  readonly requiresDecision: boolean;
  readonly rejectReason: string | null;
  readonly categoryId: string | null;
  readonly method: string | null;
  readonly editedDescription: string | null;
  readonly counterpartAccountId: string | null;
  readonly suggestion: ImportSuggestion | null;
  /** Ids das movimentações que motivaram `DUPLICATE`/`POSSIBLE_DUPLICATE`. */
  readonly matches: readonly string[];
  readonly transactionId: string | null;
}

export interface ImportLinePatch {
  readonly action: ImportAction;
  readonly categoryId?: string | null;
  readonly method?: string | null;
  readonly description?: string | null;
  readonly asTransferTo?: string | null;
  readonly learn?: boolean;
}

export interface ImportBulkResult {
  readonly updated: number;
  readonly skipped: readonly { readonly lineId: string; readonly reason: string }[];
}

export interface ImportApplied {
  readonly batch: ImportBatch;
  readonly created: readonly string[];
}

export interface ImportBlocked {
  readonly transactionId: string;
  readonly code: string;
  readonly message: string;
}

export interface ImportUndone {
  readonly batch: ImportBatch;
  readonly blocked: readonly ImportBlocked[];
}

/** Colunas do CSV por índice (0-based). Valor em uma coluna (`amount`) ou em duas (`debit`/`credit`). */
export interface ImportMapping {
  readonly date: number;
  readonly description: number;
  readonly amount: number | null;
  readonly debit: number | null;
  readonly credit: number | null;
  readonly invert: boolean;
  readonly hasHeader: boolean;
  readonly delimiter: ';' | ',' | '\t' | null;
}

export type ImportSource =
  | { readonly kind: 'account'; readonly id: string }
  | { readonly kind: 'card'; readonly id: string };

export interface ImportUploadInput {
  readonly file: File;
  readonly source: ImportSource;
  readonly format: ImportFormat | null;
  /** Só para CSV; o backend salva para a conta/cartão. */
  readonly mapping: ImportMapping | null;
}

export type ImportUploadEvent =
  | { readonly kind: 'progress'; readonly percent: number | null }
  | { readonly kind: 'done'; readonly batch: ImportBatch };

export interface ImportLinesQuery {
  readonly status?: ImportLineStatus;
  readonly flag?: ImportLineFlag;
  readonly page: number;
  readonly pageSize: number;
}

/** Tamanho máximo aceito pelo backend (5 MB): só evita enviar o que seria recusado. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
