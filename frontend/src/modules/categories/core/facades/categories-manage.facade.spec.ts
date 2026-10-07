import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { CategoriesManageFacade } from '~/modules/categories/core/facades/categories-manage.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';

function setup(
  categories = [aCategory({ id: 'e1' }), aCategory({ id: 'e2', name: 'Antiga', archived: true })],
) {
  const gateway = new CategoriesGatewayStub();
  gateway.categories = categories;
  TestBed.configureTestingModule({
    providers: [provideCategoriesStub(gateway), CategoriesManageFacade],
  });
  return { gateway, facade: TestBed.inject(CategoriesManageFacade) };
}

describe('CategoriesManageFacade', () => {
  it('Dado o kind, então separa ativas e arquivadas', () => {
    const { facade, gateway } = setup();

    facade.load('EXPENSE');

    expect(facade.active().map((c) => c.id)).toEqual(['e1']);
    expect(facade.archived().map((c) => c.id)).toEqual(['e2']);
    expect(gateway.queries).toEqual([{ kind: 'EXPENSE', includeArchived: true }]);
  });

  it('Dado nenhuma categoria, então "empty"', () => {
    const { facade } = setup([]);

    facade.load('INCOME');

    expect(facade.state().status).toBe('empty');
  });

  it('Dado erro, então expõe o Problem', () => {
    const { facade, gateway } = setup();
    gateway.listResult = failWith(500, 'INTERNAL_ERROR');

    facade.load('EXPENSE');

    expect(facade.error()?.code).toBe('INTERNAL_ERROR');
  });

  it('Dado criar "Pets", então a categoria aparece na lista a partir da resposta, no kind ativo', async () => {
    const { facade } = setup();
    facade.load('EXPENSE');

    const created = await firstValueFrom(facade.create('Pets'));

    expect(created).toMatchObject({ name: 'Pets', kind: 'EXPENSE', system: false });
    expect(facade.active().map((c) => c.name)).toEqual(['Alimentação', 'Pets']);
  });

  it('Dado criar numa lista vazia, então passa a "ready"', async () => {
    const { facade } = setup([]);
    facade.load('EXPENSE');

    await firstValueFrom(facade.create('Pets'));

    expect(facade.state().status).toBe('ready');
    expect(facade.active()).toHaveLength(1);
  });

  it('Dado 409 CATEGORY_NAME_TAKEN, então a falha chega tipada e a lista não muda', async () => {
    const { facade, gateway } = setup();
    facade.load('EXPENSE');
    gateway.next = failWith(409, 'CATEGORY_NAME_TAKEN');

    await expect(firstValueFrom(facade.create('Alimentação'))).rejects.toMatchObject({
      problem: { code: 'CATEGORY_NAME_TAKEN' },
    });
    expect(facade.active()).toHaveLength(1);
  });

  it('Dado renomear, então envia a version e troca pelo recurso devolvido', async () => {
    const { facade, gateway } = setup();
    facade.load('EXPENSE');

    const renamed = await firstValueFrom(facade.rename(facade.active()[0]!, 'Comida'));

    expect(gateway.calls).toContain('rename:e1:Comida:0');
    expect(renamed.version).toBe(1);
    expect(facade.active()[0]).toMatchObject({ name: 'Comida', version: 1 });
  });

  it('Dado arquivar e desarquivar, então a categoria muda de grupo pela resposta', async () => {
    const { facade } = setup();
    facade.load('EXPENSE');

    await firstValueFrom(facade.archive('e1'));
    expect(
      facade
        .archived()
        .map((c) => c.id)
        .sort(),
    ).toEqual(['e1', 'e2']);
    expect(facade.active()).toEqual([]);

    await firstValueFrom(facade.unarchive('e2'));
    expect(facade.active().map((c) => c.id)).toEqual(['e2']);
  });

  it('Dado a aba Receita, quando crio, então a categoria nasce com kind INCOME', async () => {
    const { facade, gateway } = setup();
    facade.load('INCOME');

    await firstValueFrom(facade.create('Bônus'));

    expect(gateway.calls).toContain('create:Bônus:INCOME');
    expect(facade.active().map((c) => c.name)).toEqual(['Bônus']);
  });
});
