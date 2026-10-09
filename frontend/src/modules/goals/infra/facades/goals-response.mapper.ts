import type {
  Goal,
  GoalAction,
  GoalActionInput,
  GoalConsistencyMonth,
  GoalInput,
  GoalPhoto,
  GoalReservation,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import type {
  GoalActionRequest,
  GoalPhotoResponse,
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

const moneyOrNull = (value: { amount: string; currency: string } | null): Money | null =>
  value ? money(value) : null;

function toAction(response: GoalResponse['actions'][number]): GoalAction {
  return {
    id: response.id,
    title: response.title,
    frequency: response.frequency,
    doneIn: [...response.doneIn],
  };
}

function toConsistencyMonth(response: GoalResponse['consistency'][number]): GoalConsistencyMonth {
  return {
    month: response.month,
    expected: money(response.expected),
    actual: moneyOrNull(response.actual),
    met: response.met,
    closed: response.closed,
  };
}

export function toPhoto(response: GoalPhotoResponse): GoalPhoto {
  return {
    id: response.id,
    position: response.position,
    width: response.width,
    height: response.height,
    createdAt: response.createdAt,
  };
}

export function toGoal(response: GoalResponse): Goal {
  // Resposta de servidor antigo (sem os campos de fotos): o tipo gerado os exige, o runtime pode não trazer.
  const legacy: Partial<Pick<GoalResponse, 'featured' | 'coverPhotoId' | 'photos'>> = response;
  return {
    id: response.id,
    kind: response.kind,
    name: response.name,
    target: money(response.target),
    current: moneyOrNull(response.current),
    progress: response.progress,
    remaining: moneyOrNull(response.remaining),
    status: response.status,
    deadline: response.deadline,
    priority: response.priority,
    description: response.description,
    monthlyNeeded: moneyOrNull(response.monthlyNeeded),
    uncovered: response.uncovered,
    reservations: response.reservations.map(toReservation),
    baselineSet: response.baselineSet,
    baseline: moneyOrNull(response.baseline),
    grewSinceBaseline: response.grewSinceBaseline,
    metric: response.metric,
    direction: response.direction,
    reached: response.reached,
    metricAsOf: response.metricAsOf,
    stage: response.stage,
    requiredPace: moneyOrNull(response.requiredPace),
    monthsLeft: response.monthsLeft,
    nextMilestone: moneyOrNull(response.nextMilestone),
    onTrack: response.onTrack,
    gap: moneyOrNull(response.gap),
    planNote: response.planNote,
    actions: response.actions.map(toAction),
    consistency: response.consistency.map(toConsistencyMonth),
    streak: response.streak,
    consistencyRate: response.consistencyRate,
    version: response.version,
    // Respostas antigas (sem os campos de fotos) viram "sem destaque e sem fotos".
    featured: legacy.featured ?? false,
    coverPhotoId: legacy.coverPhotoId ?? null,
    photos: (legacy.photos ?? []).map(toPhoto),
  };
}

function description(input: GoalInput): string | null {
  const text = input.description?.trim() ?? '';
  return text === '' ? null : text;
}

export function toCreateRequest(input: GoalInput): GoalCreateRequest {
  if (input.kind === 'DEBT_PAYOFF') {
    return {
      kind: 'DEBT_PAYOFF',
      deadline: input.deadline,
      ...(input.priority ? { priority: input.priority } : {}),
      description: description(input),
    };
  }
  if (input.kind === 'METRIC') {
    const name = input.name.trim();
    return {
      kind: 'METRIC',
      ...(input.metric ? { metric: input.metric } : {}),
      ...(name === '' ? {} : { name }),
      target: input.target,
      deadline: input.deadline,
      ...(input.priority ? { priority: input.priority } : {}),
      description: description(input),
    };
  }
  return {
    name: input.name.trim(),
    target: input.target,
    deadline: input.deadline,
    ...(input.priority ? { priority: input.priority } : {}),
    description: description(input),
  };
}

/**
 * `PUT`: o que não vai é apagado (nome em `METRIC`, `planNote`, `deadline`), então tudo vai explícito.
 * `name` e `target` só são omitidos quando vazios (nome opcional em `METRIC`; alvo ausente mantém o atual).
 */
export function toUpdateRequest(input: GoalUpdate): GoalUpdateRequest {
  const name = input.name.trim();
  const planNote = input.planNote?.trim() ?? '';
  return {
    ...(name === '' ? {} : { name }),
    ...(input.target === '' ? {} : { target: input.target }),
    deadline: input.deadline,
    ...(input.priority ? { priority: input.priority } : {}),
    description: description(input),
    planNote: planNote === '' ? null : planNote,
    version: input.version,
  };
}

export function toActionRequest(input: GoalActionInput): GoalActionRequest {
  return { title: input.title.trim(), frequency: input.frequency };
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
