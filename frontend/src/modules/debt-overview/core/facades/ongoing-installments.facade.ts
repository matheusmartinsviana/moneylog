import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, switchMap, tap, timer } from 'rxjs';

import { DebtOverviewGateway } from '~/modules/debt-overview/core/interfaces/debt-overview.gateway';
import type {
  OngoingInstallmentsInput,
  OngoingPreview,
} from '~/modules/debt-overview/core/types/debt-overview';
import { Problem, problemOf } from '~/util/api/problem';

/** Espera até a digitação parar antes de pedir a prévia. */
export const ONGOING_PREVIEW_DEBOUNCE_MS = 300;

interface PreviewKey {
  readonly cardId: string;
  readonly input: OngoingInstallmentsInput;
}

type PreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: OngoingPreview };

/**
 * Cadastro da compra parcelada em andamento. A prévia (`remaining`, `lastDueDate`) vem do servidor: o front
 * não soma parcelas. `switchMap` cancela a prévia anterior; o salvar usa `exhaustMap` (duplo toque = um
 * envio, porque o contrato não tem idempotência). Escopo de componente.
 */
@Injectable()
export class OngoingInstallmentsFacade {
  private readonly gateway = inject(DebtOverviewGateway);
  private readonly previews = new Subject<PreviewKey | null>();
  private readonly saves = new Subject<PreviewKey>();
  private readonly savedEvents = new Subject<string>();
  private readonly previewState = signal<PreviewState>({ status: 'idle' });
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);

  readonly preview = computed(() => {
    const state = this.previewState();
    return state.status === 'ready' ? state.data : null;
  });
  readonly previewLoading = computed(() => this.previewState().status === 'loading');
  readonly previewProblem = computed(() => {
    const state = this.previewState();
    return state.status === 'error' ? state.problem : null;
  });
  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  /** Emite o id da compra criada. */
  readonly saved$ = this.savedEvents.asObservable();

  constructor() {
    this.previews
      .pipe(
        switchMap((key) =>
          key === null
            ? of<PreviewState>({ status: 'idle' })
            : timer(ONGOING_PREVIEW_DEBOUNCE_MS).pipe(
                switchMap(() =>
                  this.gateway.previewOngoing(key.cardId, key.input).pipe(
                    map((data): PreviewState => ({ status: 'ready', data })),
                    catchError((error: unknown) =>
                      of<PreviewState>({ status: 'error', problem: problemOf(error) }),
                    ),
                  ),
                ),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.previewState.set(state));

    this.saves
      .pipe(
        exhaustMap((key) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.gateway.createOngoing(key.cardId, key.input).pipe(
            tap((id) => this.savedEvents.next(id)),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        this.problemState.set(problem);
      });
  }

  /** Dados completos pedem a prévia; `null` (incompletos) limpa. */
  requestPreview(cardId: string, input: OngoingInstallmentsInput | null): void {
    this.previewState.set(input === null ? { status: 'idle' } : { status: 'loading' });
    this.previews.next(input === null ? null : { cardId, input });
  }

  save(cardId: string, input: OngoingInstallmentsInput): void {
    this.saves.next({ cardId, input });
  }

  dismissProblem(): void {
    this.problemState.set(null);
  }
}
