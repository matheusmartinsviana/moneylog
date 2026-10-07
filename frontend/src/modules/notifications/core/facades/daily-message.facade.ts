import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap } from 'rxjs';

import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import type { DailyMessage } from '~/modules/notifications/core/types/notification';

/**
 * Mensagem diária do Início: chave + números do dashboard. Falha ou resposta vazia não mostram nada (a
 * mensagem é um complemento, nunca um erro na tela). Escopo de componente.
 */
@Injectable()
export class DailyMessageFacade {
  private readonly gateway = inject(NotificationsGateway);
  private readonly loads = new Subject<void>();
  private readonly messageState = signal<DailyMessage | null>(null);

  readonly message = computed(() => this.messageState());

  constructor() {
    this.loads
      .pipe(
        switchMap(() => this.gateway.dailyMessage().pipe(catchError(() => of(null)))),
        map((message) => message),
        takeUntilDestroyed(),
      )
      .subscribe((message) => this.messageState.set(message));
  }

  load(): void {
    this.loads.next();
  }
}
