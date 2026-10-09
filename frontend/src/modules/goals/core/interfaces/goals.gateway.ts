import { Observable } from 'rxjs';

import type {
  Goal,
  GoalMetric,
  GoalActionInput,
  GoalInput,
  GoalStatus,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import type { Slice } from '~/util/api/slice';
import type { Money } from '~/util/money';

export interface GoalsQuery {
  /** Sem o parâmetro, devolve todas (ativas, atingidas e arquivadas). */
  readonly status?: GoalStatus;
  /** `true` = só a meta em destaque da Home. */
  readonly featured?: boolean;
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
  /** Plano declarado (ADR-016): sem efeito em contas nem no razão. Cada chamada devolve a meta. */
  abstract addAction(id: string, input: GoalActionInput): Observable<Goal>;
  abstract updateAction(id: string, actionId: string, input: GoalActionInput): Observable<Goal>;
  abstract deleteAction(id: string, actionId: string): Observable<Goal>;
  /** Idempotente. `period`: `YYYY-MM` (mensal), `YYYY-Www` (semanal) ou `ONCE`; `done=false` desmarca. */
  abstract checkIn(id: string, actionId: string, period: string, done: boolean): Observable<Goal>;
  /**
   * Valor atual da medida, **lido da mesma fonte da tela** (visão de dívidas, painel, custos fixos). Só
   * leitura para mostrar antes de criar a meta: o front nunca calcula a medida.
   */
  abstract metricValue(metric: GoalMetric): Observable<Money>;
  /** Marca ou desmarca o destaque da Home (só uma por usuário: marcar move a anterior). Devolve a meta. */
  abstract setFeatured(id: string, featured: boolean): Observable<Goal>;
  abstract archive(id: string): Observable<Goal>;
  abstract unarchive(id: string): Observable<Goal>;
}
