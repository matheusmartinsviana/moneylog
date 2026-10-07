import { EnvironmentProviders, inject, Provider, provideAppInitializer } from '@angular/core';
import { Observable, of } from 'rxjs';

import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { AuthGateway } from '~/modules/auth/core/interfaces/auth.gateway';
import type { AuthToken, Credentials } from '~/modules/auth/core/types/auth-token';
import { provideAuth } from '~/modules/auth/infra/auth.providers';
import { AUTH_ENDPOINTS } from '~/modules/auth/infra/endpoints';
import { API_MOCKS } from '~/util/api-mocks';

export const aToken = (accessToken = 'token-1'): AuthToken => ({
  accessToken,
  expiresAt: '2026-10-10T12:15:00Z',
});

/** Porta de auth falsa e configurável, com registro das chamadas. */
export class AuthGatewayStub extends AuthGateway {
  login$: Observable<AuthToken> = of(aToken());
  refresh$: Observable<AuthToken> = of(aToken('token-2'));
  logout$: Observable<void> = of(undefined);
  readonly logins: Credentials[] = [];
  refreshes = 0;
  logouts = 0;

  login(credentials: Credentials): Observable<AuthToken> {
    this.logins.push(credentials);
    return this.login$;
  }

  refresh(): Observable<AuthToken> {
    this.refreshes++;
    return this.refresh$;
  }

  logout(): Observable<void> {
    this.logouts++;
    return this.logout$;
  }
}

export function provideAuthStub(stub: AuthGatewayStub = new AuthGatewayStub()): Provider[] {
  return [{ provide: AuthGateway, useValue: stub }];
}

/** Sessão já restaurada (como o `provideAppInitializer` do bootstrap), para testar rotas protegidas. */
export function provideAuthenticatedSession(): (Provider | EnvironmentProviders)[] {
  return [provideAuthStub(), provideAppInitializer(() => inject(SessionFacade).restore())];
}

export { AUTH_ENDPOINTS };

/** A porta real de auth (infra) falando HTTP de verdade, para testar interceptors com `HttpTestingController`. */
export function provideAuthOverHttp(): Provider[] {
  return [{ provide: API_MOCKS, useValue: false }, ...provideAuth()];
}
