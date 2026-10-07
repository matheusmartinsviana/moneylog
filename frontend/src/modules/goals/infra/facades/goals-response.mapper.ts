import type {
  Goal,
  GoalInput,
  GoalReservation,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import type {
  GoalCreateRequest,
  GoalReservationRequest,
  GoalReservationResponse,
  GoalResponse,
  GoalUpdateRequest,
} from '~/modules/goals/infra/responses/goal.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toReservation(response: GoalReservationResponse): GoalReservation {
  return {
    id: response.id,
    account: { id: response.account.id, name: response.account.name },
    amount: money(response.amount),
    date: response.date,
    note: response.note,
    createdAt: response.createdAt,
  };
}

export function toGoal(response: GoalResponse): Goal {
  return {
    id: response.id,
    name: response.name,
    target: money(response.target),
    current: money(response.current),
    progress: response.progress,
    remaining: money(response.remaining),
    status: response.status,
    deadline: response.deadline,
    priority: response.priority,
    description: response.description,
    monthlyNeeded: response.monthlyNeeded ? money(response.monthlyNeeded) : null,
    uncovered: response.uncovered,
    reservations: response.reservations.map(toReservation),
    version: response.version,
  };
}

function description(input: GoalInput): string | null {
  const text = input.description?.trim() ?? '';
  return text === '' ? null : text;
}

export function toCreateRequest(input: GoalInput): GoalCreateRequest {
  return {
    name: input.name.trim(),
    target: input.target,
    deadline: input.deadline,
    ...(input.priority ? { priority: input.priority } : {}),
    description: description(input),
  };
}

export function toUpdateRequest(input: GoalUpdate): GoalUpdateRequest {
  // @ts-expect-error contrato 2.11: `target` e `priority` do PUT divergem do POST (pendência do backend).
  return { ...toCreateRequest(input), version: input.version };
}

/** Liberar manda o valor **negativo** no corpo: o usuário digita o valor positivo (S-147). */
export function toReservationRequest(input: ReservationInput): GoalReservationRequest {
  const note = input.note?.trim() ?? '';
  return {
    accountId: input.accountId,
    amount: input.kind === 'release' ? `-${input.amount}` : input.amount,
    date: input.date,
    note: note === '' ? null : note,
  };
}
