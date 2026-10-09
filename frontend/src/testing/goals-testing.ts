import { Provider } from '@angular/core';
import { Observable, of, Subject } from 'rxjs';

import {
  GoalPhotosGateway,
  type PhotoUploadEvent,
} from '~/modules/goals/core/interfaces/goal-photos.gateway';
import { GoalsGateway, GoalsQuery } from '~/modules/goals/core/interfaces/goals.gateway';
import type {
  Goal,
  GoalActionInput,
  GoalInput,
  GoalMetric,
  GoalPhoto,
  GoalPhotoVariant,
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
    featured: false,
    coverPhotoId: null,
    photos: [],
    ...overrides,
  };
}

/** Foto de teste (metadados). */
export function aGoalPhoto(overrides: Partial<GoalPhoto> = {}): GoalPhoto {
  return {
    id: 'photo-1',
    position: 0,
    width: 640,
    height: 360,
    createdAt: '2026-10-10T12:00:00Z',
    ...overrides,
  };
}

/** Meta de sonho (SAVINGS) sintética com fotos; a primeira é a capa. */
export function aDreamGoal(photoCount = 3, overrides: Partial<Goal> = {}): Goal {
  const photos = Array.from({ length: photoCount }, (_, i) =>
    aGoalPhoto({ id: `photo-${i + 1}`, position: i }),
  );
  return aGoal({
    id: 'goal-dream',
    name: 'Carro de exemplo',
    target: brl('10000.00'),
    current: brl('2500.00'),
    progress: '0.2500',
    remaining: brl('7500.00'),
    featured: true,
    coverPhotoId: photos[0]?.id ?? null,
    photos,
    ...overrides,
  });
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
    const filtered = this.goals
      .filter((g) => !query.status || g.status === query.status)
      .filter((g) => query.featured === undefined || g.featured === query.featured);
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

  setFeatured(id: string, featured: boolean): Observable<Goal> {
    this.calls.push(`featured:${id}:${featured}`);
    return this.next ?? of(aGoal({ id, featured }));
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

/**
 * Porta das fotos para os testes. `uploads` registra cada envio; por padrão o envio termina na hora com uma
 * foto nova. Use `uploadResults` para controlar (ex.: um `Subject` por arquivo, falha de rede).
 */
export class GoalPhotosGatewayStub extends GoalPhotosGateway {
  readonly uploads: { goalId: string; fileName: string; key: string }[] = [];
  readonly contentCalls: string[] = [];
  readonly calls: string[] = [];
  /** Resultado do próximo envio (consumido em ordem); sem item, termina com sucesso. */
  uploadResults: Observable<PhotoUploadEvent>[] = [];
  /** Corpo devolvido pelo conteúdo; erro opcional. */
  content$: Observable<Blob> | null = null;
  /** Meta devolvida pelas escritas; padrão = meta com as fotos pedidas. */
  next: Observable<Goal> | null = null;
  private sequence = 0;

  upload(goalId: string, _file: Blob, fileName: string, key: string): Observable<PhotoUploadEvent> {
    this.uploads.push({ goalId, fileName, key });
    const planned = this.uploadResults.shift();
    if (planned) return planned;
    const photo = aGoalPhoto({ id: `uploaded-${++this.sequence}`, position: this.sequence - 1 });
    return of({ kind: 'progress', percent: 100 } as const, { kind: 'done', photo } as const);
  }

  content(goalId: string, photoId: string, variant: GoalPhotoVariant): Observable<Blob> {
    this.contentCalls.push(`${goalId}/${photoId}/${variant}`);
    return this.content$ ?? of(new Blob(['x'], { type: 'image/jpeg' }));
  }

  reorder(goalId: string, photoIds: readonly string[]): Observable<Goal> {
    this.calls.push(`reorder:${goalId}:${photoIds.join(',')}`);
    return (
      this.next ??
      of(
        aGoal({
          id: goalId,
          photos: photoIds.map((id, position) => aGoalPhoto({ id, position })),
          coverPhotoId: photoIds[0] ?? null,
        }),
      )
    );
  }

  setCover(goalId: string, photoId: string): Observable<Goal> {
    this.calls.push(`cover:${goalId}:${photoId}`);
    return this.next ?? of(aGoal({ id: goalId, coverPhotoId: photoId }));
  }

  remove(goalId: string, photoId: string): Observable<Goal> {
    this.calls.push(`remove:${goalId}:${photoId}`);
    return this.next ?? of(aGoal({ id: goalId }));
  }

  /** Atalho: um envio controlado à mão (emita progresso e `done`/erro quando quiser). */
  controlUpload(): Subject<PhotoUploadEvent> {
    const subject = new Subject<PhotoUploadEvent>();
    this.uploadResults.push(subject);
    return subject;
  }
}

export function provideGoalsStub(
  stub: GoalsGatewayStub = new GoalsGatewayStub(),
  photos: GoalPhotosGatewayStub = new GoalPhotosGatewayStub(),
): Provider[] {
  return [
    { provide: GoalsGateway, useValue: stub },
    { provide: GoalPhotosGateway, useValue: photos },
  ];
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
    featured: false,
    coverPhotoId: null,
    photos: [],
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T13:00:00Z',
    ...overrides,
  };
}
