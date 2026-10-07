import { TestBed } from '@angular/core/testing';
import { firstValueFrom, NEVER } from 'rxjs';

import { PeopleListFacade } from '~/modules/people/core/facades/people-list.facade';
import { failWith } from '~/testing/accounts-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';

function setup(gateway = new PeopleGatewayStub()) {
  TestBed.configureTestingModule({ providers: [providePeopleStub(gateway), PeopleListFacade] });
  return { gateway, facade: TestBed.inject(PeopleListFacade) };
}

describe('PeopleListFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado nenhuma pessoa, então o estado é vazio', () => {
    const { facade } = setup();
    facade.load();
    expect(facade.empty()).toBe(true);
  });

  it('Dado pessoas, então repassa net, direction e nextDueDate como vieram', () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [
      aPerson({ net: { amount: '-80.00', currency: 'BRL' }, direction: 'PAYABLE' }),
    ];
    const { facade } = setup(gateway);

    facade.load();

    expect(facade.data()?.[0]).toMatchObject({ direction: 'PAYABLE' });
    expect(facade.data()?.[0]?.net.amount).toBe('-80.00');
  });

  it('Dado a carga, então mostra carregando enquanto a resposta não chega', () => {
    const gateway = new PeopleGatewayStub();
    gateway.listError = NEVER as never;
    const { facade } = setup(gateway);

    facade.load();

    expect(facade.loading()).toBe(true);
  });

  it('Dado erro, então o estado carrega o problema tipado e o "tentar de novo" recarrega', () => {
    const gateway = new PeopleGatewayStub();
    gateway.listError = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);
    facade.load();
    expect(facade.error()).toMatchObject({ status: 0, code: 'NETWORK' });

    gateway.listError = null;
    gateway.people = [aPerson()];
    facade.load();
    expect(facade.data()).toHaveLength(1);
  });

  it('Dado a digitação, então espera 300 ms e só a última busca chega ao backend', () => {
    vi.useFakeTimers();
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ name: 'João' }), aPerson({ id: 'p2', name: 'Maria' })];
    const { facade } = setup(gateway);
    facade.load();
    gateway.queries.length = 0;

    facade.search('j');
    vi.advanceTimersByTime(100);
    facade.search('jo');
    vi.advanceTimersByTime(100);
    facade.search('joão');
    vi.advanceTimersByTime(299);
    expect(gateway.queries).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(gateway.queries).toHaveLength(1);
    expect(gateway.queries[0]).toMatchObject({ q: 'joão', status: 'ACTIVE' });
    expect(facade.query()).toBe('joão');
  });

  it('Dado a busca nova, então cancela a carga anterior (switchMap)', () => {
    const gateway = new PeopleGatewayStub();
    const { facade } = setup(gateway);
    gateway.listError = NEVER as never;
    facade.load('ACTIVE', 'a');
    gateway.listError = null;
    gateway.people = [aPerson({ name: 'Ana' })];

    facade.load('ACTIVE', 'an');

    expect(facade.data()?.map((p) => p.name)).toEqual(['Ana']);
  });

  it('Dado muitas pessoas, então loadAll pagina até hasNext = false (a 51ª não some)', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = Array.from({ length: 51 }, (_, i) => aPerson({ id: `p${i}`, name: `P${i}` }));
    const { facade } = setup(gateway);

    const all = await firstValueFrom(facade.loadAll('ACTIVE'));

    expect(all).toHaveLength(51);
    expect(gateway.queries.map((q) => [q.page, q.pageSize])).toEqual([
      [1, 50],
      [2, 50],
    ]);
  });

  it('Dado arquivar, então usa a pessoa da resposta e ela sai da lista de ativas', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'a' }), aPerson({ id: 'b' })];
    const { facade } = setup(gateway);
    facade.load();

    await firstValueFrom(facade.archive('a'));

    expect(facade.data()?.map((p) => p.id)).toEqual(['b']);
  });

  it('Dado criar, então devolve a pessoa da resposta (ex.: "nova pessoa" no formulário, S-138)', async () => {
    const { facade, gateway } = setup();

    const person = await firstValueFrom(facade.create({ name: 'Maria', notes: null }));

    expect(person.id).toBe('person-new');
    expect(gateway.creates).toEqual([{ name: 'Maria', notes: null }]);
  });

  it('Dado criar com Idempotency-Key, então falha de rede + mesmo nome reusa a chave; nome novo, chave nova', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    await expect(
      firstValueFrom(facade.create({ name: 'Maria', notes: null })),
    ).rejects.toBeTruthy();
    await expect(
      firstValueFrom(facade.create({ name: 'Maria', notes: null })),
    ).rejects.toBeTruthy();
    await expect(
      firstValueFrom(facade.create({ name: 'Joana', notes: null })),
    ).rejects.toBeTruthy();

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
  });
});
