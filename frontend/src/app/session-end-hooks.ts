import { inject, Provider } from '@angular/core';
import { catchError, finalize, Observable, of } from 'rxjs';

import {
  SESSION_END_HOOKS,
  type SessionEndHook,
} from '~/modules/auth/core/interfaces/session-end-hook';
import { PUSH_SUBSCRIPTION_KEY } from '~/modules/notifications/core/facades/push.facade';
import { NotificationsGateway } from '~/modules/notifications/core/interfaces/notifications.gateway';
import { readStorage, removeStorage } from '~/util/safe-storage';

/** No logout: cancela a assinatura de push no backend (melhor esforço) e esquece o id guardado (M4). */
export function cancelPushHook(gateway: NotificationsGateway): SessionEndHook {
  return (): Observable<unknown> => {
    const id = readStorage(PUSH_SUBSCRIPTION_KEY);
    if (!id) return of(undefined);
    return gateway.unsubscribePush(id).pipe(
      catchError(() => of(undefined)),
      finalize(() => removeStorage(PUSH_SUBSCRIPTION_KEY)),
    );
  };
}

export function provideSessionEndHooks(): Provider[] {
  return [
    {
      provide: SESSION_END_HOOKS,
      useFactory: () => [cancelPushHook(inject(NotificationsGateway))],
    },
  ];
}
