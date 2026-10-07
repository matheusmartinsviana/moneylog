import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';

function setup() {
  const gateway = new CategoriesGatewayStub();
  gateway.categories = [
    aCategory({ id: 'e1', name: 'Alimentação', kind: 'EXPENSE' }),
    aCategory({ id: 'i1', name: 'Salário', kind: 'INCOME' }),
    aCategory({ id: 'e2', name: 'Antiga', kind: 'EXPENSE', archived: true }),
  ];
  TestBed.configureTestingModule({ providers: [provideCategoriesStub(gateway)] });
  return { gateway, facade: TestBed.inject(CategoriesFacade) };
}

describe('CategoriesFacade', () => {
  it('Dado um kind, então carrega só as categorias dele (ativas por padrão)', async () => {
    const { facade, gateway } = setup();

    const expense = await firstValueFrom(facade.list('EXPENSE'));
    const income = await firstValueFrom(facade.list('INCOME'));

    expect(expense.map((c) => c.id)).toEqual(['e1']);
    expect(income.map((c) => c.id)).toEqual(['i1']);
    expect(gateway.queries).toEqual([
      { kind: 'EXPENSE', includeArchived: false },
      { kind: 'INCOME', includeArchived: false },
    ]);
  });

  it('Dado includeArchived, então traz também as arquivadas', async () => {
    const { facade } = setup();

    const all = await firstValueFrom(facade.list('EXPENSE', true));

    expect(all.map((c) => c.id)).toEqual(['e1', 'e2']);
  });

  it('Dado a mesma lista pedida duas vezes na sessão, então só uma requisição sai (cache)', async () => {
    const { facade, gateway } = setup();

    await firstValueFrom(facade.list('EXPENSE'));
    await firstValueFrom(facade.list('EXPENSE'));

    expect(gateway.queries).toHaveLength(1);
  });

  it.each([
    ['create', (f: CategoriesFacade) => f.create({ name: 'Pets', kind: 'EXPENSE' })],
    ['rename', (f: CategoriesFacade) => f.rename('e1', { name: 'Comida', version: 0 })],
    ['archive', (f: CategoriesFacade) => f.archive('e1')],
    ['unarchive', (f: CategoriesFacade) => f.unarchive('e2')],
  ])('Dado %s, então devolve o recurso da resposta e invalida o cache', async (_, mutate) => {
    const { facade, gateway } = setup();
    await firstValueFrom(facade.list('EXPENSE'));

    const category = await firstValueFrom(mutate(facade));
    await firstValueFrom(facade.list('EXPENSE'));

    expect(category.id).toBeTruthy();
    expect(gateway.queries).toHaveLength(2);
  });

  it('Dado falha ao listar, então não fica em cache e o "tentar de novo" pede de novo', async () => {
    const { facade, gateway } = setup();
    gateway.listResult = failWith(500, 'INTERNAL_ERROR');
    await expect(firstValueFrom(facade.list('EXPENSE'))).rejects.toBeDefined();

    gateway.listResult = null;
    const again = await firstValueFrom(facade.list('EXPENSE'));

    expect(again).toHaveLength(1);
    expect(gateway.queries).toHaveLength(2);
  });

  it('Dado erro na criação (409), então não invalida o cache', async () => {
    const { facade, gateway } = setup();
    await firstValueFrom(facade.list('EXPENSE'));
    gateway.next = failWith(409, 'CATEGORY_NAME_TAKEN');

    await expect(
      firstValueFrom(facade.create({ name: 'Alimentação', kind: 'EXPENSE' })),
    ).rejects.toMatchObject({ problem: { code: 'CATEGORY_NAME_TAKEN' } });
    await firstValueFrom(facade.list('EXPENSE'));

    expect(gateway.queries).toHaveLength(1);
  });
});
