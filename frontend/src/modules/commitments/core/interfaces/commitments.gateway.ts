import { Observable } from 'rxjs';

import type {
  Commitment,
  CommitmentInput,
  CommitmentProgressInput,
} from '~/modules/commitments/core/types/commitment';
import type { Slice } from '~/util/api/slice';

export interface CommitmentsQuery {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Porta de compromissos acompanhados. Falha com `ProblemError` (`COMMITMENT_INVALID`,
 * `COMMITMENT_SCHEDULE_ITEM_ALREADY_PAID`, `COMMITMENT_SCHEDULE_ITEM_NOT_FOUND`, `VERSION_CONFLICT`...).
 * Nada aqui mexe em conta: é só acompanhamento.
 */
export abstract class CommitmentsGateway {
  abstract list(query: CommitmentsQuery): Observable<Slice<Commitment>>;
  abstract get(id: string): Observable<Commitment>;
  /** `Idempotency-Key`: uma por tentativa (o retry reusa). */
  abstract create(input: CommitmentInput, idempotencyKey: string): Observable<Commitment>;
  /** Devolve o compromisso atualizado (a fonte da verdade). */
  abstract payItem(
    id: string,
    position: number,
    paidOn: string,
    version: number,
  ): Observable<Commitment>;
  abstract updateProgress(id: string, input: CommitmentProgressInput): Observable<Commitment>;
}
