import { Observable } from 'rxjs';

import type {
  Occurrence,
  OccurrenceStatus,
  RealizedTransaction,
  Recurrence,
  RecurrenceInput,
  RecurrenceSummary,
  RecurrenceUpdate,
} from '~/modules/recurrences/core/types/recurrence';
import type { OccurrenceSlice, Slice } from '~/util/api/slice';

export interface RecurrencesQuery {
  /** Sem o parâmetro, devolve ativas e desativadas. */
  readonly active?: boolean;
  readonly page: number;
  readonly pageSize: number;
}

export interface OccurrencesQuery {
  /** Sem `from`, a janela começa no início da agenda: lista as vencidas e não realizadas (S-20). */
  readonly from?: string;
  readonly to?: string;
  readonly status?: OccurrenceStatus;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Porta de recorrências (FE 01). As implementações falham com `ProblemError`
 * (`RECURRENCE_OCCURRENCE_ALREADY_REALIZED`, `RECURRENCE_INVALID`, `VERSION_CONFLICT`...).
 */
export abstract class RecurrencesGateway {
  abstract list(query: RecurrencesQuery): Observable<Slice<Recurrence>>;
  abstract get(id: string): Observable<Recurrence>;
  /** `Idempotency-Key`: uma por tentativa (o retry reusa); 409 `IDEMPOTENCY_KEY_REUSED` se o corpo mudar. */
  abstract create(input: RecurrenceInput, idempotencyKey: string): Observable<Recurrence>;
  abstract update(id: string, input: RecurrenceUpdate): Observable<Recurrence>;
  /** Encerra numa data (`null` = hoje, no backend); nada é apagado. */
  abstract end(id: string, endDate: string | null): Observable<Recurrence>;
  abstract deactivate(id: string): Observable<Recurrence>;
  abstract summary(): Observable<RecurrenceSummary>;
  abstract listOccurrences(query: OccurrencesQuery): Observable<OccurrenceSlice<Occurrence>>;
  /**
   * Confirma a ocorrência (cria a movimentação). `Idempotency-Key` obrigatório: uma por tentativa
   * (a mesma chave + o mesmo corpo devolve a mesma movimentação). `amount` `null` = valor do modelo.
   */
  abstract realize(
    recurrenceId: string,
    date: string,
    amount: string | null,
    idempotencyKey: string,
  ): Observable<RealizedTransaction>;
  abstract skip(recurrenceId: string, date: string): Observable<Occurrence>;
}
