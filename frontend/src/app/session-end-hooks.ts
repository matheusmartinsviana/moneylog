import { inject, Provider } from '@angular/core';
import { catchError, finalize, from, Observable, of } from 'rxjs';

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

/** Caches que o logout preserva: o shell do app (`ngsw:`) e a preferência de idioma do worker de push. */
const KEPT_CACHE_PREFIXES = ['ngsw:', 'moneylog-prefs'];

/**
 * No logout: apaga do Cache Storage tudo que não é o shell do app, para não sobrar dado privado no
 * dispositivo (hoje o `ngsw-config` não cacheia a API; isto é a rede de segurança). Melhor esforço.
 */
export function clearPrivateCachesHook(cacheStorage: CacheStorage | undefined): SessionEndHook {
  return (): Observable<unknown> =>
    from(
      (async () => {
        if (!cacheStorage) return;
        const names = await cacheStorage.keys();
        await Promise.all(
          names
            .filter((name) => !KEPT_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
            .map((name) => cacheStorage.delete(name)),
        );
      })(),
    ).pipe(catchError(() => of(undefined)));
}

export function provideSessionEndHooks(): Provider[] {
  return [
    {
      provide: SESSION_END_HOOKS,
      useFactory: () => [
        cancelPushHook(inject(NotificationsGateway)),
        clearPrivateCachesHook(typeof caches === 'undefined' ? undefined : caches),
      ],
    },
  ];
}
