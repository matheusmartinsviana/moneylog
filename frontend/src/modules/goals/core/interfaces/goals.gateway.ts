import { Observable } from 'rxjs';

import type {
  Goal,
  GoalInput,
  GoalStatus,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import type { Slice } from '~/util/api/slice';

export interface GoalsQuery {
  /** Sem o parâmetro, devolve todas (ativas, atingidas e arquivadas). */
  readonly status?: GoalStatus;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Porta de metas (FE 01). As implementações falham com `ProblemError` (`GOAL_NOT_FOUND`, `GOAL_ARCHIVED`,
 * `GOAL_RELEASE_EXCEEDS_RESERVED`, `VERSION_CONFLICT`...).
 */
export abstract class GoalsGateway {
  abstract list(query: GoalsQuery): Observable<Slice<Goal>>;
  abstract get(id: string): Observable<Goal>;
  /** `Idempotency-Key` opcional no contrato; a tela manda uma por tentativa (o retry reusa). */
  abstract create(input: GoalInput, idempotencyKey: string): Observable<Goal>;
  abstract update(id: string, input: GoalUpdate): Observable<Goal>;
  /** Reserva ou libera (valor negativo no corpo). `Idempotency-Key` **obrigatório**. Devolve a meta. */
  abstract reserve(id: string, input: ReservationInput, idempotencyKey: string): Observable<Goal>;
  /** "Cadastrei tudo" (`DEBT_PAYOFF`): fixa o total atual como base; repetir re-ancora. Devolve a meta. */
  abstract baseline(id: string): Observable<Goal>;
  abstract archive(id: string): Observable<Goal>;
  abstract unarchive(id: string): Observable<Goal>;
}
