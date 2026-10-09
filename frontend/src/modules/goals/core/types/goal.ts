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

/**
 * `SAVINGS` = reserva (padrão); `DEBT_PAYOFF` = "quitar todas as dívidas" (sem reservas, progresso do
 * servidor); `METRIC` = meta inteligente: acompanha uma medida do sistema até um alvo (ADR-016).
 */
export type GoalKind = 'SAVINGS' | 'DEBT_PAYOFF' | 'METRIC';

/** Medidas que uma meta `METRIC` acompanha: o valor atual vem sempre do servidor. */
export type GoalMetric =
  | 'TOTAL_DEBT'
  | 'CARD_DEBT'
  | 'PEOPLE_DEBT'
  | 'OTHER_DEBT'
  | 'ACCOUNTS_BALANCE'
  | 'AVAILABLE_BALANCE'
  | 'FIXED_COSTS_MONTHLY';
export const GOAL_METRICS = [
  'TOTAL_DEBT',
  'CARD_DEBT',
  'PEOPLE_DEBT',
  'OTHER_DEBT',
  'ACCOUNTS_BALANCE',
  'AVAILABLE_BALANCE',
  'FIXED_COSTS_MONTHLY',
] as const satisfies readonly GoalMetric[];

/** Derivada no servidor: `DECREASE` se o alvo é menor que o ponto de partida. */
export type GoalDirection = 'DECREASE' | 'INCREASE';

/** Escada de maturidade, derivada no servidor em toda leitura (ADR-016). */
export type GoalStage = 'FANTASY' | 'OBJECTIVE' | 'STRATEGY' | 'CONSISTENT' | 'ACHIEVED';
export const GOAL_STAGES = [
  'FANTASY',
  'OBJECTIVE',
  'STRATEGY',
  'CONSISTENT',
  'ACHIEVED',
] as const satisfies readonly GoalStage[];

export type GoalActionFrequency = 'MONTHLY' | 'WEEKLY' | 'ONE_TIME';
export const GOAL_ACTION_FREQUENCIES = [
  'MONTHLY',
  'WEEKLY',
  'ONE_TIME',
] as const satisfies readonly GoalActionFrequency[];
/** Limite de ações por meta (o servidor também recusa: `GOAL_ACTION_LIMIT`). */
export const GOAL_ACTION_MAX = 10;
export const GOAL_PLAN_NOTE_MAX = 500;

/** Ação do plano declarado. `doneIn`: períodos com check-in (`YYYY-MM`, `YYYY-Www` ou `ONCE`). */
export interface GoalAction {
  readonly id: string;
  readonly title: string;
  readonly frequency: GoalActionFrequency;
  readonly doneIn: readonly string[];
}

export interface GoalActionInput {
  readonly title: string;
  readonly frequency: GoalActionFrequency;
}

/** Mês da linha do tempo de consistência. `actual` e `met` nulos = "sem dado". */
export interface GoalConsistencyMonth {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly expected: Money;
  readonly actual: Money | null;
  readonly met: boolean | null;
  readonly closed: boolean;
}

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

/** Limites das fotos do sonho. O servidor decide; o front só avisa antes (conforto). */
export const GOAL_PHOTO_MAX = 8;
export const GOAL_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const GOAL_PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
/** Extensões aceitas no seletor (`accept`). */
export const GOAL_PHOTO_ACCEPT = '.jpg,.jpeg,.png';

/** Metadados de uma foto (os bytes vêm de `GET .../content`). `position` 0 = capa. */
export interface GoalPhoto {
  readonly id: string;
  readonly position: number;
  readonly width: number;
  readonly height: number;
  /** Instante ISO-8601 UTC. */
  readonly createdAt: string;
}

/** Versão da imagem: miniatura (≤ 320 px) ou exibição (≤ 1280 px). */
export type GoalPhotoVariant = 'thumb' | 'display';

/**
 * Meta como a API devolve. **Tudo vem calculado pelo backend**: `current` (Σ reservas), `progress` (razão
 * decimal em string, `0.4250`), `remaining`, `monthlyNeeded` (estimativa, S-156) e `uncovered` (S-148). O
 * front só exibe: nunca soma reservas nem divide valores.
 */
export interface Goal {
  readonly id: string;
  readonly kind: GoalKind;
  /** Nulo só em `METRIC` sem nome: a tela mostra o rótulo gerado pela medida. */
  readonly name: string | null;
  readonly target: Money;
  /** Nulo em `METRIC` arquivada (meta arquivada não calcula). */
  readonly current: Money | null;
  /** Razão do backend (`Ratio`): pode passar de 1. Só se formata. */
  readonly progress: string;
  /** Nulo em `METRIC` arquivada. */
  readonly remaining: Money | null;
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
  /** `METRIC`: a medida acompanhada. */
  readonly metric: GoalMetric | null;
  readonly direction: GoalDirection | null;
  /** Meta atingida (`status = ACHIEVED`). */
  readonly reached: boolean;
  /** `METRIC` ativa: ponto de partida e data do cálculo. */
  readonly metricAsOf: string | null;
  readonly stage: GoalStage;
  /** Plano automático (tudo do servidor): ritmo por mês, meses restantes e marco do mês. */
  readonly requiredPace: Money | null;
  readonly monthsLeft: number | null;
  readonly nextMilestone: Money | null;
  /** `null` sem plano automático. */
  readonly onTrack: boolean | null;
  /** Positivo = adiantado, negativo = atrasado. */
  readonly gap: Money | null;
  readonly planNote: string | null;
  readonly actions: readonly GoalAction[];
  readonly consistency: readonly GoalConsistencyMonth[];
  /** Meses fechados seguidos cumprindo o ritmo. */
  readonly streak: number;
  /** Razão (`0.6667`) ou nula sem meses fechados com dado. */
  readonly consistencyRate: string | null;
  readonly version: number;
  /** Meta em destaque na Home (só uma por usuário). */
  readonly featured: boolean;
  /** Foto da capa (posição 0) ou `null`. */
  readonly coverPhotoId: string | null;
  /** Só metadados, em ordem; vazio fora de `SAVINGS`. */
  readonly photos: readonly GoalPhoto[];
}

/** Criação (`POST /v1/goals`). `target` é a string decimal digitada. */
export interface GoalInput {
  /** Omitido = `SAVINGS`. `DEBT_PAYOFF` não leva `name` nem `target` (nome padrão do servidor). */
  readonly kind?: GoalKind;
  /** `METRIC`: a medida acompanhada (obrigatória). */
  readonly metric?: GoalMetric;
  /** `METRIC` aceita nome vazio (o servidor guarda nulo). */
  readonly name: string;
  readonly target: string;
  readonly deadline: string | null;
  /** Omitida = o servidor usa a padrão. */
  readonly priority?: GoalPriority;
  readonly description: string | null;
}

/** Edição (`PUT /v1/goals/{id}`): os mesmos campos mais `planNote` e a `version`. */
export interface GoalUpdate extends GoalInput {
  /** O `PUT` apaga o que não vai: reenvie sempre o texto atual do plano (`null` apaga de propósito). */
  readonly planNote: string | null;
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
