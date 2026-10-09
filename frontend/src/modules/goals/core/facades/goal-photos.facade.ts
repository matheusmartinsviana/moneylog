import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  filter,
  finalize,
  map,
  Observable,
  of,
  Subject,
  takeUntil,
  tap,
} from 'rxjs';

import { GoalPhotoCache } from '~/modules/goals/core/facades/goal-photo-cache';
import { GoalPhotosGateway } from '~/modules/goals/core/interfaces/goal-photos.gateway';
import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import {
  GOAL_PHOTO_ACCEPT,
  GOAL_PHOTO_MAX,
  GOAL_PHOTO_MAX_BYTES,
  type Goal,
} from '~/modules/goals/core/types/goal';
import { newIdempotencyKey } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

export type PhotoQueueStatus = 'waiting' | 'uploading' | 'failed';

/** Foto escolhida que ainda não está na meta (aguardando a meta existir, enviando ou com falha). */
export interface PhotoQueueItem {
  readonly localId: string;
  readonly file: File;
  readonly status: PhotoQueueStatus;
  /** 0 a 100. */
  readonly percent: number;
  readonly problem: Problem | null;
  /** Mesma chave a cada reenvio: o servidor devolve a foto já gravada em vez de duplicar. */
  readonly key: string;
}

/** Por que um arquivo escolhido foi recusado ANTES do envio (conforto; quem decide é o servidor). */
export type PhotoRejectionReason = 'type' | 'size' | 'empty' | 'limit';
export interface PhotoRejection {
  readonly name: string;
  readonly reason: PhotoRejectionReason;
}

/** Última movida: a tela anuncia a nova posição para leitores de tela. */
export interface PhotoMove {
  readonly photoId: string;
  /** Posição, de 1. */
  readonly position: number;
  readonly total: number;
}

type Command =
  | { readonly kind: 'upload'; readonly localId: string }
  | { readonly kind: 'mutate'; readonly run: () => Observable<Goal>; readonly move?: string }
  | { readonly kind: 'sync' };

const ALLOWED_EXTENSIONS = GOAL_PHOTO_ACCEPT.split(',');

function typeAllowed(file: File): boolean {
  if (file.type === 'image/jpeg' || file.type === 'image/png') return true;
  const name = file.name.toLowerCase();
  return file.type === '' && ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Facade do gerenciador de fotos de uma meta de sonho (ADR-018). Envia **uma foto por vez** (fila com
 * `concatMap`: a ordem importa), com progresso, cancelamento e reenvio com a **mesma** `Idempotency-Key`.
 * Reordenar, definir capa, remover e destacar vão pela mesma fila e **a meta da resposta vira o estado**
 * (nada é chutado); em falha, relê a meta do backend. Sem meta ainda (criação), as fotos escolhidas ficam
 * na fila local, na ordem final, e sobem quando `setGoal` recebe a meta criada. A validação de tipo e
 * tamanho aqui é só conforto: o servidor decide. Escopo de componente.
 */
@Injectable()
export class GoalPhotosFacade {
  private readonly photosGateway = inject(GoalPhotosGateway);
  private readonly goalsGateway = inject(GoalsGateway);
  private readonly cache = inject(GoalPhotoCache);

  private readonly commands = new Subject<Command>();
  private readonly cancels = new Subject<string>();
  private readonly changedEvents = new Subject<Goal>();
  private readonly settledEvents = new Subject<void>();
  private readonly goalState = signal<Goal | null>(null);
  private readonly queueState = signal<readonly PhotoQueueItem[]>([]);
  private readonly busyState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private readonly rejectionState = signal<readonly PhotoRejection[]>([]);
  private readonly moveState = signal<PhotoMove | null>(null);
  private readonly featuredIntent = signal(false);
  private pendingCommands = 0;
  private nextLocalId = 0;

  readonly goal = this.goalState.asReadonly();
  readonly queue = this.queueState.asReadonly();
  /** Há uma escrita (ordem, capa, remover, destaque) ou envio em andamento. */
  readonly busy = this.busyState.asReadonly();
  /** Falha da última escrita (mensagem pelo `code`). */
  readonly problem = this.problemState.asReadonly();
  readonly rejections = this.rejectionState.asReadonly();
  readonly lastMove = this.moveState.asReadonly();
  /** Destaque desejado (na criação vale depois que a meta existe; na edição reflete a meta). */
  readonly featured = computed(() => this.goalState()?.featured ?? this.featuredIntent());
  readonly photos = computed(() => this.goalState()?.photos ?? []);
  readonly coverPhotoId = computed(() => this.goalState()?.coverPhotoId ?? null);
  /** Fotos na meta + na fila (o contador "n de 8"). */
  readonly count = computed(() => this.photos().length + this.queueState().length);
  readonly max = GOAL_PHOTO_MAX;
  readonly full = computed(() => this.count() >= GOAL_PHOTO_MAX);
  readonly failed = computed(() => this.queueState().filter((item) => item.status === 'failed'));
  /** Algo para enviar ou aplicar quando a meta existir (criação). */
  readonly hasPending = computed(() => this.queueState().length > 0 || this.featuredIntent());
  /** Meta com a lista de fotos já feita pelo servidor: sem fila, o gerenciador só reflete a meta. */
  readonly goalChanged$ = this.changedEvents.asObservable();
  /** A fila de comandos esvaziou (envios e escritas terminaram, com ou sem falha). */
  readonly settled$ = this.settledEvents.asObservable();

  constructor() {
    this.commands
      .pipe(
        concatMap((command) => {
          this.busyState.set(true);
          return this.run(command).pipe(
            finalize(() => {
              this.pendingCommands--;
              if (this.pendingCommands === 0) {
                this.busyState.set(false);
                this.settledEvents.next();
              }
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Recebe a meta (carregada ou recém-criada) e começa a enviar o que estava aguardando. */
  setGoal(goal: Goal): void {
    const first = this.goalState() === null;
    this.goalState.set(goal);
    if (!first) return;
    const batch: Command[] = [];
    if (this.featuredIntent() && !goal.featured) batch.push(this.featuredCommand(goal.id, true));
    for (const item of this.queueState()) {
      if (item.status === 'waiting') batch.push({ kind: 'upload', localId: item.localId });
    }
    this.enqueueAll(batch);
  }

  /** Escolha de arquivos (vários): valida por conforto, enfileira os aceitos e devolve os recusados. */
  add(files: readonly File[]): void {
    const rejections: PhotoRejection[] = [];
    const accepted: PhotoQueueItem[] = [];
    let room = GOAL_PHOTO_MAX - this.count();
    for (const file of files) {
      const reason: PhotoRejectionReason | null = !typeAllowed(file)
        ? 'type'
        : file.size === 0
          ? 'empty'
          : file.size > GOAL_PHOTO_MAX_BYTES
            ? 'size'
            : room <= 0
              ? 'limit'
              : null;
      if (reason !== null) {
        rejections.push({ name: file.name, reason });
        continue;
      }
      room--;
      accepted.push({
        localId: `local-${++this.nextLocalId}`,
        file,
        status: 'waiting',
        percent: 0,
        problem: null,
        key: newIdempotencyKey(),
      });
    }
    this.rejectionState.set(rejections);
    if (accepted.length === 0) return;
    this.queueState.update((queue) => [...queue, ...accepted]);
    if (this.goalState() !== null) {
      this.enqueueAll(accepted.map((item): Command => ({ kind: 'upload', localId: item.localId })));
    }
  }

  clearRejections(): void {
    this.rejectionState.set([]);
  }

  clearProblem(): void {
    this.problemState.set(null);
  }

  /** Cancela um envio (ou tira da fila): o que já subiu continua na meta. */
  cancel(localId: string): void {
    this.cancels.next(localId);
    this.queueState.update((queue) => queue.filter((item) => item.localId !== localId));
  }

  /** "Tentar de novo": reenvia só a que falhou, com a mesma chave. */
  retry(localId: string): void {
    const item = this.queueState().find((candidate) => candidate.localId === localId);
    if (!item || item.status !== 'failed') return;
    this.patchItem(localId, { status: 'waiting', percent: 0, problem: null });
    if (this.goalState() !== null) this.enqueue({ kind: 'upload', localId });
  }

  retryAll(): void {
    for (const item of this.failed()) this.retry(item.localId);
  }

  /** Reordena as fotos da fila local (só antes de a meta existir). */
  moveQueued(localId: string, delta: -1 | 1): void {
    if (this.goalState() !== null) return;
    this.queueState.update((queue) => {
      const from = queue.findIndex((item) => item.localId === localId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= queue.length) return queue;
      const next = [...queue];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  /** Antes de a meta existir, a capa é a primeira da fila. */
  makeQueuedCover(localId: string): void {
    if (this.goalState() !== null) return;
    this.queueState.update((queue) => {
      const from = queue.findIndex((item) => item.localId === localId);
      if (from <= 0) return queue;
      const next = [...queue];
      next.unshift(...next.splice(from, 1));
      return next;
    });
  }

  /** Move a foto uma posição; a ordem é calculada na hora de executar (a fila garante a sequência). */
  move(photoId: string, delta: -1 | 1): void {
    const goalId = this.goalState()?.id;
    if (goalId === undefined) return;
    this.enqueue({
      kind: 'mutate',
      move: photoId,
      run: () => {
        const ids = (this.goalState()?.photos ?? []).map((photo) => photo.id);
        const from = ids.indexOf(photoId);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return EMPTY;
        ids.splice(to, 0, ...ids.splice(from, 1));
        return this.photosGateway.reorder(goalId, ids);
      },
    });
  }

  makeCover(photoId: string): void {
    const goalId = this.goalState()?.id;
    if (goalId === undefined) return;
    this.enqueue({
      kind: 'mutate',
      move: photoId,
      run: () =>
        this.goalState()?.coverPhotoId === photoId
          ? EMPTY
          : this.photosGateway.setCover(goalId, photoId),
    });
  }

  remove(photoId: string): void {
    const goalId = this.goalState()?.id;
    if (goalId === undefined) return;
    this.enqueue({
      kind: 'mutate',
      run: () =>
        this.photosGateway
          .remove(goalId, photoId)
          .pipe(tap(() => this.cache.forgetPhoto(goalId, photoId))),
    });
  }

  /** Liga ou desliga o destaque. Sem meta (criação), guarda a intenção para depois de criar. */
  setFeatured(featured: boolean): void {
    if (this.goalState() === null) {
      this.featuredIntent.set(featured);
      return;
    }
    this.enqueueFeatured(featured);
  }

  private enqueueFeatured(featured: boolean): void {
    const goalId = this.goalState()?.id;
    if (goalId === undefined) return;
    this.enqueue(this.featuredCommand(goalId, featured));
  }

  private featuredCommand(goalId: string, featured: boolean): Command {
    return { kind: 'mutate', run: () => this.goalsGateway.setFeatured(goalId, featured) };
  }

  private enqueue(command: Command): void {
    this.enqueueAll([command]);
  }

  /** Conta o lote inteiro antes de despachar: o fim da fila (`settled$`) só vale quando o lote acaba. */
  private enqueueAll(batch: readonly Command[]): void {
    this.pendingCommands += batch.length;
    for (const command of batch) this.commands.next(command);
  }

  private run(command: Command): Observable<unknown> {
    switch (command.kind) {
      case 'upload':
        return this.runUpload(command.localId);
      case 'mutate':
        return this.runMutation(command.run, command.move);
      case 'sync':
        return this.reload();
    }
  }

  private runUpload(localId: string): Observable<unknown> {
    return defer(() => {
      const goalId = this.goalState()?.id;
      const item = this.queueState().find((candidate) => candidate.localId === localId);
      if (goalId === undefined || !item || item.status !== 'waiting') return EMPTY;
      this.patchItem(localId, { status: 'uploading', percent: 0, problem: null });
      return this.photosGateway.upload(goalId, item.file, item.file.name, item.key).pipe(
        takeUntil(this.cancels.pipe(filter((id) => id === localId))),
        tap((event) => {
          if (event.kind === 'progress') this.patchItem(localId, { percent: event.percent });
          else {
            // A foto criada pelo servidor entra na meta já (a releitura do lote confirma ordem e capa).
            this.queueState.update((queue) => queue.filter((i) => i.localId !== localId));
            this.goalState.update((goal) =>
              goal && !goal.photos.some((photo) => photo.id === event.photo.id)
                ? { ...goal, photos: [...goal.photos, event.photo] }
                : goal,
            );
          }
        }),
        catchError((error: unknown) => {
          this.patchItem(localId, { status: 'failed', problem: problemOf(error) });
          return of(null);
        }),
        finalize(() => {
          // Última do lote: relê a meta (capa, ordem e posições vêm do servidor).
          const more = this.queueState().some(
            (candidate) => candidate.status === 'waiting' || candidate.status === 'uploading',
          );
          if (!more) this.enqueue({ kind: 'sync' });
        }),
      );
    });
  }

  private runMutation(run: () => Observable<Goal>, move?: string): Observable<unknown> {
    this.problemState.set(null);
    return defer(run).pipe(
      tap((goal) => {
        this.apply(goal);
        if (move !== undefined) {
          const index = goal.photos.findIndex((photo) => photo.id === move);
          if (index >= 0) {
            this.moveState.set({ photoId: move, position: index + 1, total: goal.photos.length });
          }
        }
      }),
      catchError((error: unknown) => {
        this.problemState.set(problemOf(error));
        // Falha: o servidor é a fonte da verdade, então relê a meta.
        return this.reload();
      }),
    );
  }

  private reload(): Observable<unknown> {
    const goalId = this.goalState()?.id;
    if (goalId === undefined) return EMPTY;
    return this.goalsGateway.get(goalId).pipe(
      tap((goal) => this.apply(goal)),
      map(() => null),
      catchError(() => EMPTY),
    );
  }

  private apply(goal: Goal): void {
    this.goalState.set(goal);
    this.changedEvents.next(goal);
  }

  private patchItem(localId: string, patch: Partial<PhotoQueueItem>): void {
    this.queueState.update((queue) =>
      queue.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  }
}
