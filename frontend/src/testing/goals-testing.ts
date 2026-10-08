import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { GoalsGateway, GoalsQuery } from '~/modules/goals/core/interfaces/goals.gateway';
import type {
  Goal,
  GoalActionInput,
  GoalInput,
  GoalMetric,
  GoalReservation,
  GoalUpdate,
  ReservationInput,
} from '~/modules/goals/core/types/goal';
import type {
  GoalReservationResponse,
  GoalResponse,
} from '~/modules/goals/infra/responses/goal.response';
import { brl } from '~/testing/accounts-testing';
import type { Slice } from '~/util/api/slice';
import type { Money } from '~/util/money';

export function aReservation(overrides: Partial<GoalReservation> = {}): GoalReservation {
  return {
    id: 'res-1',
    account: { id: 'acc-1', name: 'Nubank' },
    amount: brl('8500.00'),
    date: '2026-10-10',
    note: null,
    createdAt: '2026-10-10T13:00:00Z',
    ...overrides,
  };
}

/** O cenário do plano: Reserva de emergência, 8.500,00 de 20.000,00 (42,5%), prazo 31/12/2027. */
export function aGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    kind: 'SAVINGS',
    name: 'Reserva de emergência',
    target: brl('20000.00'),
    current: brl('8500.00'),
    progress: '0.4250',
    remaining: brl('11500.00'),
    status: 'ACTIVE',
    deadline: '2027-12-31',
    priority: 'HIGH',
    description: 'Seis meses de custo fixo',
    monthlyNeeded: brl('766.67'),
    uncovered: false,
    reservations: [aReservation()],
    baselineSet: false,
    baseline: null,
    grewSinceBaseline: false,
    metric: null,
    direction: null,
    reached: false,
    metricAsOf: null,
    stage: 'OBJECTIVE',
    requiredPace: brl('766.67'),
    monthsLeft: 15,
    nextMilestone: brl('9000.00'),
    onTrack: true,
    gap: brl('0.00'),
    planNote: null,
    actions: [],
    consistency: [],
    streak: 0,
    consistencyRate: null,
    version: 1,
    ...overrides,
  };
}

/** Meta inteligente (sintética): total de dívidas de 10.000,00 para 4.000,00. */
export function aMetricGoal(overrides: Partial<Goal> = {}): Goal {
  return aGoal({
    id: 'goal-metric',
    kind: 'METRIC',
    name: null,
    target: brl('4000.00'),
    current: brl('8000.00'),
    progress: '0.3333',
    remaining: brl('4000.00'),
    description: null,
    monthlyNeeded: null,
    reservations: [],
    baseline: brl('10000.00'),
    metric: 'TOTAL_DEBT',
    direction: 'DECREASE',
    metricAsOf: '2026-10-08',
    deadline: '2027-04-30',
    stage: 'OBJECTIVE',
    requiredPace: brl('500.00'),
    monthsLeft: 8,
    nextMilestone: brl('7500.00'),
    ...overrides,
  });
}

/** Porta falsa de metas: guarda as chamadas e devolve o que o teste configurar. */
export class GoalsGatewayStub extends GoalsGateway {
  goals: Goal[] = [];
  readonly queries: GoalsQuery[] = [];
  readonly calls: string[] = [];
  readonly creates: GoalInput[] = [];
  readonly createKeys: string[] = [];
  readonly updates: GoalUpdate[] = [];
  readonly reservations: { goalId: string; input: ReservationInput; key: string }[] = [];
  /** Resultado das escritas de meta (`create`, `update`, `archive`, `unarchive`). */
  next: Observable<Goal> | null = null;
  getResult: Observable<Goal> | null = null;
  listError: Observable<never> | null = null;
  reserve$: Observable<Goal> | null = null;
  readonly actionCalls: string[] = [];
  metricValues: Partial<Record<GoalMetric, Money>> = {};
  metricValue$: Observable<Money> | null = null;

  list(query: GoalsQuery): Observable<Slice<Goal>> {
    this.queries.push(query);
    if (this.listError) return this.listError;
    const filtered = this.goals.filter((g) => !query.status || g.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);
    return of({ items, hasNext: start + query.pageSize < filtered.length });
  }

  get(id: string): Observable<Goal> {
    this.calls.push(`get:${id}`);
    return this.getResult ?? of(this.goals.find((g) => g.id === id) ?? aGoal({ id }));
  }

  create(input: GoalInput, idempotencyKey: string): Observable<Goal> {
    this.createKeys.push(idempotencyKey);
    this.creates.push(input);
    this.calls.push(`create:${input.name}`);
    return this.next ?? of(aGoal({ id: 'goal-new', name: input.name }));
  }

  update(id: string, input: GoalUpdate): Observable<Goal> {
    this.calls.push(`update:${id}:${input.version}`);
    this.updates.push(input);
    return (
      this.next ??
      of(aGoal({ id, name: input.name, planNote: input.planNote, version: input.version + 1 }))
    );
  }

  reserve(id: string, input: ReservationInput, key: string): Observable<Goal> {
    this.calls.push(`reserve:${id}`);
    this.reservations.push({ goalId: id, input, key });
    return this.reserve$ ?? of(aGoal({ id }));
  }

  baseline(id: string): Observable<Goal> {
    this.calls.push(`baseline:${id}`);
    return this.next ?? of(aGoal({ id, kind: 'DEBT_PAYOFF', baselineSet: true }));
  }

  addAction(id: string, input: GoalActionInput): Observable<Goal> {
    this.actionCalls.push(`add:${id}:${input.title}:${input.frequency}`);
    return this.next ?? of(aGoal({ id }));
  }

  updateAction(id: string, actionId: string, input: GoalActionInput): Observable<Goal> {
    this.actionCalls.push(`update:${id}:${actionId}:${input.title}:${input.frequency}`);
    return this.next ?? of(aGoal({ id }));
  }

  deleteAction(id: string, actionId: string): Observable<Goal> {
    this.actionCalls.push(`delete:${id}:${actionId}`);
    return this.next ?? of(aGoal({ id }));
  }

  checkIn(id: string, actionId: string, period: string, done: boolean): Observable<Goal> {
    this.actionCalls.push(`check-in:${id}:${actionId}:${period}:${done}`);
    return this.next ?? of(aGoal({ id }));
  }

  metricValue(metric: GoalMetric): Observable<Money> {
    this.calls.push(`metric:${metric}`);
    return this.metricValue$ ?? of(this.metricValues[metric] ?? brl('0.00'));
  }

  archive(id: string): Observable<Goal> {
    this.calls.push(`archive:${id}`);
    return this.next ?? of(aGoal({ id, status: 'ARCHIVED' }));
  }

  unarchive(id: string): Observable<Goal> {
    this.calls.push(`unarchive:${id}`);
    return this.next ?? of(aGoal({ id, status: 'ACTIVE' }));
  }
}

export function provideGoalsStub(stub: GoalsGatewayStub = new GoalsGatewayStub()): Provider[] {
  return [{ provide: GoalsGateway, useValue: stub }];
}

/** Resposta crua da API (como `schema.gen.ts`), para os testes da infra. */
export function aReservationResponse(
  overrides: Partial<GoalReservationResponse> = {},
): GoalReservationResponse {
  return {
    id: 'res-1',
    account: { id: 'acc-1', name: 'Nubank' },
    amount: { amount: '8500.00', currency: 'BRL' },
    date: '2026-10-10',
    note: null,
    createdAt: '2026-10-10T13:00:00Z',
    ...overrides,
  };
}

export function aGoalResponse(overrides: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'goal-1',
    kind: 'SAVINGS',
    name: 'Reserva de emergência',
    target: { amount: '20000.00', currency: 'BRL' },
    current: { amount: '8500.00', currency: 'BRL' },
    progress: '0.4250',
    remaining: { amount: '11500.00', currency: 'BRL' },
    status: 'ACTIVE',
    deadline: '2027-12-31',
    priority: 'HIGH',
    description: 'Seis meses de custo fixo',
    monthlyNeeded: { amount: '766.67', currency: 'BRL' },
    uncovered: false,
    reservations: [aReservationResponse()],
    baselineSet: false,
    baseline: null,
    baselineAt: null,
    grewSinceBaseline: false,
    metric: null,
    direction: null,
    reached: false,
    metricAsOf: null,
    stage: 'OBJECTIVE',
    requiredPace: { amount: '766.67', currency: 'BRL' },
    monthsLeft: 15,
    nextMilestone: { amount: '9000.00', currency: 'BRL' },
    onTrack: true,
    gap: { amount: '0.00', currency: 'BRL' },
    planNote: null,
    actions: [],
    consistency: [],
    streak: 0,
    consistencyRate: null,
    version: 1,
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T13:00:00Z',
    ...overrides,
  };
}
