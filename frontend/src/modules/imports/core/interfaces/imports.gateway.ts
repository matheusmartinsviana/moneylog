import { Observable } from 'rxjs';

import type {
  ImportAction,
  ImportApplied,
  ImportBatch,
  ImportBatchStatus,
  ImportBulkResult,
  ImportLine,
  ImportLinePatch,
  ImportLinesQuery,
  ImportMapping,
  ImportUndone,
  ImportUploadEvent,
  ImportUploadInput,
} from '~/modules/imports/core/types/import';
import type { Slice } from '~/util/api/slice';

/**
 * Porta da importação de extrato. Falha com `ProblemError` (`IMPORT_TOO_LARGE`, `IMPORT_PARSE_FAILED`,
 * `IMPORT_LINES_REQUIRE_DECISION`...). O upload emite progresso e termina com o lote; cancelar é
 * cancelar a inscrição (a requisição é abortada).
 */
export abstract class ImportsGateway {
  abstract upload(input: ImportUploadInput, idempotencyKey: string): Observable<ImportUploadEvent>;
  abstract list(query: {
    readonly status?: ImportBatchStatus;
    readonly page: number;
    readonly pageSize: number;
  }): Observable<Slice<ImportBatch>>;
  abstract get(id: string): Observable<ImportBatch>;
  abstract lines(id: string, query: ImportLinesQuery): Observable<Slice<ImportLine>>;
  abstract reviewLine(id: string, lineId: string, patch: ImportLinePatch): Observable<ImportLine>;
  abstract bulk(
    id: string,
    lineIds: readonly string[],
    action: Exclude<ImportAction, 'FORCE' | 'REOPEN'>,
  ): Observable<ImportBulkResult>;
  abstract apply(id: string, idempotencyKey: string): Observable<ImportApplied>;
  /** Descarta um lote em revisão (204). */
  abstract discard(id: string): Observable<void>;
  abstract undo(id: string, reason: string | null): Observable<ImportUndone>;
  /** Mapeamento salvo da conta/cartão; `null` quando não há. */
  abstract savedMapping(sourceId: string): Observable<ImportMapping | null>;
}
