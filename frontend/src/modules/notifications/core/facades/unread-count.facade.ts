import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  exhaustMap,
  fromEvent,
  map,
  merge,
  startWith,
  switchMap,
  timer,
} from 'rxjs';

import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';

/** Intervalo do polling leve do contador de não lidas (T132 CA3). */
export const UNREAD_POLL_MS = 60_000;

/**
 * Contador de notificações não lidas do sino. Consulta ao conectar e a cada 60 s **só com a aba visível e
 * online** (`visibilitychange`, `online`/`offline`); fora disso para. O número vem do backend; depois de ler
 * notificações a tela chama `refresh()`. Uma instância por app (o cabeçalho conecta uma vez).
 */
@Injectable({ providedIn: 'root' })
export class UnreadCountFacade {
  private readonly gateway = inject(NotificationsGateway);
  private readonly document = inject(DOCUMENT);
  private readonly countState = signal<number | null>(null);
  private connected = false;

  /** `null` = ainda não se sabe (nenhum número é inventado). */
  readonly count = this.countState.asReadonly();

  /** Liga o polling até `destroyRef` ser destruído. Chamar de novo não duplica. */
  connect(destroyRef: DestroyRef): void {
    if (this.connected) return;
    this.connected = true;
    destroyRef.onDestroy(() => (this.connected = false));
    const win = this.document.defaultView;
    const active = () =>
      this.document.visibilityState !== 'hidden' && (win?.navigator.onLine ?? true);
    const changes = win
      ? merge(
          fromEvent(this.document, 'visibilitychange'),
          fromEvent(win, 'online'),
          fromEvent(win, 'offline'),
        )
      : EMPTY;
    changes
      .pipe(
        startWith(null),
        map(active),
        distinctUntilChanged(),
        switchMap((on) =>
          on ? timer(0, UNREAD_POLL_MS).pipe(exhaustMap(() => this.fetch())) : EMPTY,
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((count) => this.countState.set(count));
  }

  /** Relê o número do backend (depois de marcar como lida). */
  refresh(): void {
    this.fetch().subscribe((count) => this.countState.set(count));
  }

  private fetch() {
    return this.gateway.unreadCount().pipe(catchError(() => EMPTY));
  }
}
