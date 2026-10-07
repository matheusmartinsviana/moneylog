import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, switchMap, tap } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type { AiAnalysis, AiPreview, AiPreviewRequest } from '~/modules/ai/core/types/ai';
import { Problem, problemOf } from '~/util/api/problem';

export type ConsentState =
  | { readonly step: 'idle' }
  | { readonly step: 'previewing' }
  | { readonly step: 'consent'; readonly preview: AiPreview; readonly problem: Problem | null }
  | { readonly step: 'running'; readonly preview: AiPreview }
  | { readonly step: 'done'; readonly analysis: AiAnalysis }
  | { readonly step: 'error'; readonly problem: Problem };

/** Erros em que a prévia não serve mais: é preciso gerar outra e pedir o consentimento de novo. */
const REDO_PREVIEW = new Set([
  'AI_PREVIEW_EXPIRED',
  'AI_PREVIEW_MISMATCH',
  'AI_PREVIEW_ALREADY_USED',
]);

/**
 * Fluxo prévia, consentimento, resultado. Nada vai à IA sem o usuário ver o `redactedPayload` e aprovar. A
 * `Idempotency-Key` nasce com a prévia e é reutilizada no "tentar de novo" da mesma prévia (nunca gera uma
 * segunda análise); uma prévia nova traz uma chave nova. Escopo de componente.
 */
@Injectable()
export class AiConsentFacade {
  private readonly gateway = inject(AiGateway);
  private readonly starts = new Subject<AiPreviewRequest>();
  private readonly approvals = new Subject<void>();
  private readonly current = signal<ConsentState>({ step: 'idle' });
  private lastRequest: AiPreviewRequest | null = null;
  private key = '';

  readonly state = this.current.asReadonly();
  readonly busy = computed(() => ['previewing', 'running'].includes(this.current().step));

  constructor() {
    this.starts
      .pipe(
        switchMap((request) => {
          this.current.set({ step: 'previewing' });
          return this.gateway.createPreview(request).pipe(
            tap(() => (this.key = crypto.randomUUID())),
            map((preview): ConsentState => ({ step: 'consent', preview, problem: null })),
            catchError((error: unknown) =>
              of<ConsentState>({ step: 'error', problem: problemOf(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.current.set(state));

    this.approvals
      .pipe(
        exhaustMap(() => {
          const state = this.current();
          if (state.step !== 'consent') return of(null);
          const preview = state.preview;
          this.current.set({ step: 'running', preview });
          return this.gateway.runAnalysis(preview.previewId, true, this.key).pipe(
            map((analysis): ConsentState => ({ step: 'done', analysis })),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              return of<ConsentState>(
                REDO_PREVIEW.has(problem.code)
                  ? { step: 'error', problem }
                  : { step: 'consent', preview, problem },
              );
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        if (state !== null) this.current.set(state);
      });
  }

  start(request: AiPreviewRequest): void {
    this.lastRequest = request;
    this.starts.next(request);
  }

  /** O usuário aprovou exatamente o que viu na prévia. */
  approve(): void {
    this.approvals.next();
  }

  /** Refaz a prévia do último pedido (prévia expirada, divergente ou já usada; ou erro ao montar). */
  redo(): void {
    if (this.lastRequest !== null) this.start(this.lastRequest);
  }

  reset(): void {
    this.current.set({ step: 'idle' });
  }
}
