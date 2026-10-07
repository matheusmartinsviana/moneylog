import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { PersonFormFacade, sameName } from '~/modules/people/core/facades/person-form.facade';
import { failWith } from '~/testing/accounts-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';

function setup(gateway = new PeopleGatewayStub()) {
  TestBed.configureTestingModule({ providers: [providePeopleStub(gateway), PersonFormFacade] });
  return { gateway, facade: TestBed.inject(PersonFormFacade) };
}

describe('PersonFormFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado o salvar, então emite a pessoa da resposta', () => {
    const { facade } = setup();
    const saved: string[] = [];
    facade.saved$.subscribe((person) => saved.push(person.id));

    facade.save({ kind: 'create', input: { name: 'Maria', notes: null } });

    expect(saved).toEqual(['person-new']);
    expect(facade.saving()).toBe(false);
  });

  it('Dado criar, então envia Idempotency-Key; falha de rede e mesmo corpo reusam a chave, corpo novo não', () => {
    const gateway = new PeopleGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: { name: 'Maria', notes: null } });
    facade.save({ kind: 'create', input: { name: 'Maria', notes: null } });
    facade.save({ kind: 'create', input: { name: 'Maria Souza', notes: null } });

    expect(gateway.createKeys).toHaveLength(3);
    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado o clique duplo, então uma requisição só', () => {
    const gateway = new PeopleGatewayStub();
    gateway.next = new Subject<ReturnType<typeof aPerson>>();
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input: { name: 'Maria', notes: null } });
    facade.save({ kind: 'create', input: { name: 'Maria', notes: null } });

    expect(gateway.calls.filter((c) => c.startsWith('create'))).toHaveLength(1);
    expect(facade.saving()).toBe(true);
  });

  it('Dado a edição, então envia a version', () => {
    const { facade, gateway } = setup();

    facade.save({ kind: 'update', id: 'p1', input: { name: 'João', notes: null, version: 3 } });

    expect(gateway.calls).toContain('update:p1:3');
  });

  it('Dado 409 VERSION_CONFLICT, então a falha fica tipada', () => {
    const gateway = new PeopleGatewayStub();
    gateway.next = failWith(409, 'VERSION_CONFLICT');
    const { facade } = setup(gateway);

    facade.save({ kind: 'update', id: 'p1', input: { name: 'João', notes: null, version: 3 } });

    expect(facade.problem()).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });

  it('Dado um homônimo, então avisa (sem bloquear) depois de 300 ms; na edição ignora a própria pessoa', () => {
    vi.useFakeTimers();
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'p1', name: 'João' })];
    const { facade } = setup(gateway);

    facade.checkName('joao');
    expect(facade.homonym()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(facade.homonym()).toBe(true);

    facade.checkName('João', 'p1');
    vi.advanceTimersByTime(300);
    expect(facade.homonym()).toBe(false);

    facade.checkName('  ');
    vi.advanceTimersByTime(300);
    expect(facade.homonym()).toBe(false);
  });

  it('Dado erro na checagem do nome, então não mostra aviso (o salvar continua possível)', () => {
    vi.useFakeTimers();
    const gateway = new PeopleGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.checkName('João');
    vi.advanceTimersByTime(300);

    expect(facade.homonym()).toBe(false);
  });

  it('sameName ignora caixa, acentos e espaços nas pontas', () => {
    expect(sameName(' JOÃO ', 'joao')).toBe(true);
    expect(sameName('João', 'João Pedro')).toBe(false);
  });
});
