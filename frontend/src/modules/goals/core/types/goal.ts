import type { Money } from '~/util/money';

/** Moeda das metas: só BRL no MVP (S-2). */
export const GOAL_CURRENCY = 'BRL';

export type GoalPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export const GOAL_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const satisfies readonly GoalPriority[];

/** `ACHIEVED` e `ACTIVE` são derivados no backend (S-150); só `ARCHIVED` é gravado. */
export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'ARCHIVED';
export const GOAL_STATUSES = [
  'ACTIVE',
  'ACHIEVED',
  'ARCHIVED',
] as const satisfies readonly GoalStatus[];

/** `SAVINGS` = reserva (padrão); `DEBT_PAYOFF` = "quitar todas as dívidas" (sem reservas, progresso do servidor). */
export type GoalKind = 'SAVINGS' | 'DEBT_PAYOFF';

export interface Ref {
  readonly id: string;
  readonly name: string;
}

/** Reserva (positiva) ou liberação (negativa) lógica: não é movimentação nem lançamento (S-147). */
export interface GoalReservation {
  readonly id: string;
  readonly account: Ref;
  readonly amount: Money;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly note: string | null;
  /** Instante ISO-8601 UTC. */
  readonly createdAt: string;
}

/**
 * Meta como a API devolve. **Tudo vem calculado pelo backend**: `current` (Σ reservas), `progress` (razão
 * decimal em string, `0.4250`), `remaining`, `monthlyNeeded` (estimativa, S-156) e `uncovered` (S-148). O
 * front só exibe: nunca soma reservas nem divide valores.
 */
export interface Goal {
  readonly id: string;
  readonly kind: GoalKind;
  readonly name: string;
  readonly target: Money;
  readonly current: Money;
  /** Razão do backend (`Ratio`): pode passar de 1. Só se formata. */
  readonly progress: string;
  readonly remaining: Money;
  readonly status: GoalStatus;
  readonly deadline: string | null;
  readonly priority: GoalPriority;
  readonly description: string | null;
  /** Estimativa por mês para atingir no prazo (S-156); `null` sem prazo ou com prazo vencido. */
  readonly monthlyNeeded: Money | null;
  /** Alguma conta tem mais reservado que saldo (S-148): só avisa, nunca bloqueia. */
  readonly uncovered: boolean;
  /** Da mais recente para a mais antiga. */
  readonly reservations: readonly GoalReservation[];
  /** `DEBT_PAYOFF`: "cadastrei tudo" confirmado. `false` = "montando" (sem percentual). */
  readonly baselineSet: boolean;
  /** Total de dívidas fixado em "cadastrei tudo" (`DEBT_PAYOFF`). */
  readonly baseline: Money | null;
  /** `DEBT_PAYOFF`: dívida nova depois de ancorar; a UI avisa e oferece re-ancorar. */
  readonly grewSinceBaseline: boolean;
  readonly version: number;
}

/** Criação (`POST /v1/goals`). `target` é a string decimal digitada. */
export interface GoalInput {
  /** Omitido = `SAVINGS`. `DEBT_PAYOFF` não leva `name` nem `target` (nome padrão do servidor). */
  readonly kind?: GoalKind;
  readonly name: string;
  readonly target: string;
  readonly deadline: string | null;
  /** Omitida = o servidor usa a padrão. */
  readonly priority?: GoalPriority;
  readonly description: string | null;
}

/** Edição (`PUT /v1/goals/{id}`): os mesmos campos mais a `version`. */
export interface GoalUpdate extends GoalInput {
  readonly version: number;
}

/**
 * Reservar ou liberar. `kind` decide o sinal: o usuário **nunca digita "−"**; a infra manda o valor
 * negativo no corpo (S-147). `amount` é o valor positivo digitado.
 */
export interface ReservationInput {
  readonly kind: 'reserve' | 'release';
  readonly accountId: string;
  readonly amount: string;
  readonly date: string;
  readonly note: string | null;
}
