import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { authInterceptor } from '~/app/common/interceptors/auth.interceptor';
import { unauthorizedInterceptor } from '~/app/common/interceptors/unauthorized.interceptor';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { AUTH_ENDPOINTS, provideAuthOverHttp } from '~/testing/auth-testing';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const unauthorized = { status: 401, statusText: 'Unauthorized' };
const token = (accessToken: string) => ({ accessToken, expiresAt: '2026-10-10T12:15:00Z' });

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([unauthorizedInterceptor, authInterceptor])),
      provideHttpClientTesting(),
      provideAuthOverHttp(),
      provideRouter([
        { path: 'login', component: DummyComponent },
        { path: 'transactions', component: DummyComponent },
        { path: '', component: DummyComponent },
      ]),
    ],
  });
  const http = TestBed.inject(HttpClient);
  const controller = TestBed.inject(HttpTestingController);
  const session = TestBed.inject(SessionFacade);
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/transactions');
  // Login real pela infra, para o token nascer do jeito de produção.
  session.login({ email: 'dono@moneylog.app', password: 'x' });
  controller.expectOne(AUTH_ENDPOINTS.login).flush(token('token-1'));
  return { http, controller, session, router };
}

describe('authInterceptor', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado uma requisição a /v1/accounts, então sai com Authorization: Bearer', async () => {
    const { http, controller } = await setup();

    http.get('/v1/accounts?status=ACTIVE').subscribe();

    const req = controller.expectOne((r) => r.url.startsWith('/v1/accounts'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
  });

  it.each([
    'https://api.outra-origem.example/v1/accounts',
    '/assets/icons/icon.svg',
    '/ngsw.json',
    '/v1x/accounts',
  ])('Dado %s, então sai sem o header', async (url) => {
    const { http, controller } = await setup();

    http.get(url).subscribe();

    expect(controller.expectOne(url).request.headers.has('Authorization')).toBe(false);
  });

  it('Dado as rotas públicas /v1/auth/*, então saem sem o header', async () => {
    const { http, controller } = await setup();

    http.post(AUTH_ENDPOINTS.logout, null).subscribe();

    expect(controller.expectOne(AUTH_ENDPOINTS.logout).request.headers.has('Authorization')).toBe(
      false,
    );
  });
});

describe('unauthorizedInterceptor', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado três requisições paralelas com 401, então um refresh só e as três são repetidas com o token novo', async () => {
    const { http, controller } = await setup();
    const results: unknown[] = [];
    for (const path of ['a', 'b', 'c']) {
      http.get(`/v1/${path}`).subscribe((body) => results.push(body));
    }
    for (const path of ['a', 'b', 'c']) {
      controller.expectOne(`/v1/${path}`).flush({ code: 'UNAUTHENTICATED' }, unauthorized);
    }

    controller.expectOne(AUTH_ENDPOINTS.refresh).flush(token('token-2'));

    for (const path of ['a', 'b', 'c']) {
      const retry = controller.expectOne(`/v1/${path}`);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
      retry.flush({ path });
    }
    expect(results).toEqual([{ path: 'a' }, { path: 'b' }, { path: 'c' }]);
  });

  it('Dado a requisição repetida que volta 401, então o erro chega a quem chamou e não há novo refresh (sem loop)', async () => {
    const { http, controller, session } = await setup();
    let error: unknown;
    http.get('/v1/a').subscribe({ error: (e: unknown) => (error = e) });
    controller.expectOne('/v1/a').flush(null, unauthorized);
    controller.expectOne(AUTH_ENDPOINTS.refresh).flush(token('token-2'));

    controller.expectOne('/v1/a').flush(null, unauthorized);

    expect(error).toMatchObject({ status: 401 });
    controller.expectNone(AUTH_ENDPOINTS.refresh);
    expect(session.status()).toBe('authenticated');
  });

  it('Dado o refresh recusado (401), então limpa a sessão e vai para /login?returnUrl=<rota atual>', async () => {
    const { http, controller, session, router } = await setup();
    let error: unknown;
    http.get('/v1/a').subscribe({ error: (e: unknown) => (error = e) });
    controller.expectOne('/v1/a').flush(null, unauthorized);

    controller.expectOne(AUTH_ENDPOINTS.refresh).flush({ code: 'REFRESH_INVALID' }, unauthorized);

    expect(session.status()).toBe('anonymous');
    expect(session.token()).toBeNull();
    expect(error).toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(router.url).toBe('/login?returnUrl=%2Ftransactions'));
  });

  it('Dado três 401 e o refresh recusado, então navega para o login uma vez só', async () => {
    const { http, controller, router } = await setup();
    const navigate = vi.spyOn(router, 'navigate');
    for (const path of ['a', 'b', 'c'])
      http.get(`/v1/${path}`).subscribe({ error: () => undefined });
    for (const path of ['a', 'b', 'c'])
      controller.expectOne(`/v1/${path}`).flush(null, unauthorized);

    controller.expectOne(AUTH_ENDPOINTS.refresh).flush(null, unauthorized);

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('Dado erro de rede no refresh, então a sessão continua e a requisição falha com o erro original', async () => {
    const { http, controller, session } = await setup();
    let error: unknown;
    http.get('/v1/a').subscribe({ error: (e: unknown) => (error = e) });
    controller.expectOne('/v1/a').flush(null, unauthorized);

    controller.expectOne(AUTH_ENDPOINTS.refresh).error(new ProgressEvent('error'));

    expect(error).toMatchObject({ status: 401 });
    expect(session.status()).toBe('authenticated');
    expect(session.token()).toBe('token-1');
  });

  it.each([AUTH_ENDPOINTS.login, AUTH_ENDPOINTS.refresh, AUTH_ENDPOINTS.logout])(
    'Dado 401 vindo de %s, então nunca dispara refresh nem redireciona',
    async (url) => {
      const { http, controller, router } = await setup();
      const before = router.url;
      let error: unknown;
      http.post(url, null).subscribe({ error: (e: unknown) => (error = e) });

      controller.expectOne(url).flush({ code: 'INVALID_CREDENTIALS' }, unauthorized);

      expect(error).toMatchObject({ status: 401 });
      controller.expectNone(AUTH_ENDPOINTS.refresh);
      expect(router.url).toBe(before);
    },
  );

  it('Dado outro erro (500) em /v1, então passa direto, sem refresh', async () => {
    const { http, controller } = await setup();
    let error: unknown;
    http.get('/v1/a').subscribe({ error: (e: unknown) => (error = e) });

    controller.expectOne('/v1/a').flush(null, { status: 500, statusText: 'x' });

    expect(error).toMatchObject({ status: 500 });
    controller.expectNone(AUTH_ENDPOINTS.refresh);
  });

  it('Dado 401 em outra origem, então não tenta refresh', async () => {
    const { http, controller } = await setup();
    http.get('https://outra.example/v1/a').subscribe({ error: () => undefined });

    controller.expectOne('https://outra.example/v1/a').flush(null, unauthorized);

    controller.expectNone(AUTH_ENDPOINTS.refresh);
  });
});
