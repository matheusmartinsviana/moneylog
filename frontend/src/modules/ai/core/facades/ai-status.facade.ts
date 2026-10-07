import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type { AiStatus } from '~/modules/ai/core/types/ai';
import { Problem, problemOf } from '~/util/api/problem';

export type AiStatusState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready'; readonly data: AiStatus };

/**
 * Estado da IA no servidor (`GET /v1/ai/status`), compartilhado pelo cabeçalho, pelo Início e por `/ai`.
 * Enquanto não carregou, ou se falhar, `enabled` é falso: a IA é opcional e o app funciona sem ela. Sem
 * gateway (ambientes de teste sem o módulo), fica desligada.
 */
@Injectable({ providedIn: 'root' })
export class AiStatusFacade {
  private readonly gateway = inject(AiGateway, { optional: true });
  private readonly current = signal<AiStatusState>({ status: 'loading' });
  private started = false;

  readonly state = this.current.asReadonly();
  readonly data = computed(() => {
    const state = this.current();
    return state.status === 'ready' ? state.data : null;
  });
  readonly enabled = computed(() => this.data()?.enabled === true);

  /** Carrega uma vez; chamadas seguintes são ignoradas. */
  ensureLoaded(): void {
    if (this.started) return;
    this.started = true;
    this.reload();
  }

  reload(): void {
    this.started = true;
    if (this.gateway === null) return;
    this.current.set({ status: 'loading' });
    this.gateway
      .status()
      .pipe(
        catchError((error: unknown) => {
          this.current.set({ status: 'error', problem: problemOf(error) });
          return of(null);
        }),
      )
      .subscribe((data) => {
        if (data !== null) this.current.set({ status: 'ready', data });
      });
  }
}
