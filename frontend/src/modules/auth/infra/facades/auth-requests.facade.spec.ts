import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthGateway } from '~/modules/auth/core/interfaces/auth.gateway';
import { provideAuth } from '~/modules/auth/infra/auth.providers';
import { AUTH_ENDPOINTS } from '~/modules/auth/infra/endpoints';
import { FAKE_SESSION } from '~/modules/auth/mock-data/fake-session';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideAuth(),
    ],
  });
  return { gateway: TestBed.inject(AuthGateway), http: TestBed.inject(HttpTestingController) };
}

const token = { accessToken: 'jwt-1', expiresAt: '2026-10-10T12:15:00Z' };

describe('AuthRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('em modo mock', () => {
    it('Dado o mock, então login, refresh e logout devolvem a sessão falsa sem nenhuma requisição', async () => {
      const { gateway, http } = setup(true);

      expect(await firstValueFrom(gateway.login({ email: 'a@b.c', password: 'x' }))).toEqual(
        FAKE_SESSION,
      );
      expect(await firstValueFrom(gateway.refresh())).toEqual(FAKE_SESSION);
      await firstValueFrom(gateway.logout());
      http.expectNone(() => true);
    });
  });

  describe('com a API', () => {
    it('Dado login, então POST /v1/auth/login com e-mail e senha e devolve o token', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.login({ email: 'dono@moneylog.app', password: 's3' }));
      const req = http.expectOne(AUTH_ENDPOINTS.login);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'dono@moneylog.app', password: 's3' });
      req.flush(token);

      expect(await result).toEqual(token);
    });

    it('Dado 401 no login, então falha com invalid_credentials', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.login({ email: 'a@b.c', password: 'x' }));
      http
        .expectOne(AUTH_ENDPOINTS.login)
        .flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });

      await expect(result).rejects.toMatchObject({ reason: 'invalid_credentials' });
    });

    it('Dado 429 no login com Retry-After, então falha com rate_limited e a espera', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.login({ email: 'a@b.c', password: 'x' }));
      http
        .expectOne(AUTH_ENDPOINTS.login)
        .flush(
          { code: 'TOO_MANY_ATTEMPTS' },
          { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '600' } },
        );

      await expect(result).rejects.toMatchObject({
        reason: 'rate_limited',
        retryAfterSeconds: 600,
      });
    });

    it.each([
      [0, 'network'],
      [500, 'unavailable'],
      [503, 'unavailable'],
    ])('Dado status %i no login, então falha com %s', async (status, reason) => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.login({ email: 'a@b.c', password: 'x' }));
      const req = http.expectOne(AUTH_ENDPOINTS.login);
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush(null, { status, statusText: 'x' });

      await expect(result).rejects.toMatchObject({ reason });
    });

    it('Dado refresh, então POST /v1/auth/refresh sem corpo (o cookie vai sozinho) e devolve o token', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.refresh());
      const req = http.expectOne(AUTH_ENDPOINTS.refresh);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(token);

      expect(await result).toEqual(token);
    });

    it.each([
      [401, 'refresh_invalid'],
      [403, 'unavailable'],
      [500, 'unavailable'],
      [0, 'network'],
    ])('Dado status %i no refresh, então falha com %s', async (status, reason) => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.refresh());
      const req = http.expectOne(AUTH_ENDPOINTS.refresh);
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush(null, { status, statusText: 'x' });

      await expect(result).rejects.toMatchObject({ reason });
    });

    it('Dado logout, então POST /v1/auth/logout e completa com 204', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.logout(), { defaultValue: undefined });
      const req = http.expectOne(AUTH_ENDPOINTS.logout);
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });

      await expect(result).resolves.toBeUndefined();
    });

    it.each([
      [0, 'network'],
      [500, 'unavailable'],
    ])('Dado status %i no logout, então falha com %s', async (status, reason) => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.logout());
      const req = http.expectOne(AUTH_ENDPOINTS.logout);
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush(null, { status, statusText: 'x' });

      await expect(result).rejects.toMatchObject({ reason });
    });
  });
});
