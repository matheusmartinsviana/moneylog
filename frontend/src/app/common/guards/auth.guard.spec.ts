import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { throwError } from 'rxjs';

import { authGuard, guestGuard } from '~/app/common/guards/auth.guard';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { AuthFailure } from '~/modules/auth/core/types/auth-failure';
import { AuthGatewayStub, provideAuthStub } from '~/testing/auth-testing';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(restore: 'ok' | 'refresh_invalid' | 'network') {
  const gateway = new AuthGatewayStub();
  if (restore !== 'ok') gateway.refresh$ = throwError(() => new AuthFailure(restore));
  TestBed.configureTestingModule({
    providers: [
      provideAuthStub(gateway),
      provideRouter([
        { path: 'login', canMatch: [guestGuard], component: DummyComponent },
        {
          path: '',
          canMatch: [authGuard],
          children: [
            { path: '', component: DummyComponent },
            { path: 'transactions', component: DummyComponent },
          ],
        },
      ]),
    ],
  });
  await TestBed.inject(SessionFacade).restore();
  return TestBed.inject(Router);
}

describe('guards de sessão', () => {
  it('Dado sem sessão, quando abro /transactions, então vai para /login?returnUrl=%2Ftransactions sem ativar a rota', async () => {
    const router = await setup('refresh_invalid');

    await router.navigateByUrl('/transactions?view=entries');

    expect(router.url).toBe('/login?returnUrl=%2Ftransactions%3Fview%3Dentries');
  });

  it('Dado sem sessão, quando abro a raiz, então vai para /login sem returnUrl', async () => {
    const router = await setup('refresh_invalid');

    await router.navigateByUrl('/');

    expect(router.url).toBe('/login');
  });

  it('Dado a sessão restaurada, então a rota protegida abre', async () => {
    const router = await setup('ok');

    await router.navigateByUrl('/transactions');

    expect(router.url).toBe('/transactions');
  });

  it('Dado o servidor inalcançável no boot (S-93), então o shell abre em vez de ir ao login', async () => {
    const router = await setup('network');

    await router.navigateByUrl('/transactions');

    expect(router.url).toBe('/transactions');
  });

  it('Dado a sessão ativa, quando abro /login, então vai para o início', async () => {
    const router = await setup('ok');

    await router.navigateByUrl('/login');

    expect(router.url).toBe('/');
  });

  it('Dado sem sessão, então /login abre', async () => {
    const router = await setup('refresh_invalid');

    await router.navigateByUrl('/login');

    expect(router.url).toBe('/login');
  });
});
