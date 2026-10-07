import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: DummyComponent },
        { path: 'cards', component: DummyComponent },
        {
          path: 'quick-add',
          loadChildren: () => import('~/app/features/quick-add/quick-add.routes'),
        },
        {
          path: 'quick-add',
          outlet: 'modal',
          loadChildren: () => import('~/app/features/quick-add/quick-add.routes'),
        },
      ]),
    ],
  });
  return TestBed.inject(Router);
}

describe('quickAddModalGuard', () => {
  it('Dado /quick-add?mode=income vindo de /cards, então abre o modal sobre /cards e leva os parâmetros', async () => {
    const router = await setup();
    await router.navigateByUrl('/cards');

    await router.navigateByUrl('/quick-add?mode=income');

    expect(router.url).toBe('/cards(modal:quick-add)?mode=income');
  });

  it('Dado o link direto, sem tela de origem, então abre o modal sobre o Início', async () => {
    const router = await setup();

    await router.navigateByUrl('/quick-add?mode=pix');

    expect(router.url).toBe('/(modal:quick-add)?mode=pix');
  });
});
