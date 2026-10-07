import { TestBed } from '@angular/core/testing';

import { NoteCreateFacade } from '~/modules/notes/core/facades/note-create.facade';
import type { NoteInput } from '~/modules/notes/core/types/note';
import { failWith } from '~/testing/accounts-testing';
import { NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

const INPUT: NoteInput = { path: 'reviews/novo.md', body: '# Novo' };

function setup(gateway = new NotesGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideNotesStub(gateway), NoteCreateFacade] });
  return { gateway, facade: TestBed.inject(NoteCreateFacade) };
}

describe('NoteCreateFacade', () => {
  it('Dado criar, então envia uma Idempotency-Key e emite a nota da resposta', () => {
    const { facade, gateway } = setup();
    const created: string[] = [];
    facade.created$.subscribe((note) => created.push(note.id));

    facade.create(INPUT);

    expect(gateway.createKeys).toHaveLength(1);
    expect(created).toEqual(['note-new']);
    expect(facade.saving()).toBe(false);
  });

  it('Dado vínculos na criação, então chegam ao backend como foram pedidos', () => {
    const { facade, gateway } = setup();

    facade.create({ ...INPUT, links: [{ type: 'TRANSACTION', id: 'tx-1' }] });

    expect(gateway.creates[0]?.links).toEqual([{ type: 'TRANSACTION', id: 'tx-1' }]);
  });

  it('Dado falha de rede e a mesma entrada, então reusa a chave; entrada nova, chave nova', () => {
    const gateway = new NotesGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { facade } = setup(gateway);

    facade.create(INPUT);
    facade.create({ ...INPUT });
    facade.create({ ...INPUT, body: '# Outro' });

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
  });

  it('Dado CONFLICT (trava ocupada), então também reusa a chave', () => {
    const gateway = new NotesGatewayStub();
    gateway.next = failWith(409, 'CONFLICT');
    const { facade } = setup(gateway);

    facade.create(INPUT);
    facade.create(INPUT);

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
  });

  it('Dado 422 NOTE_PATH_TAKEN, então a próxima tentativa tem chave nova e o problema fica tipado', () => {
    const gateway = new NotesGatewayStub();
    gateway.next = failWith(422, 'NOTE_PATH_TAKEN');
    const { facade } = setup(gateway);

    facade.create(INPUT);
    expect(facade.problem()?.code).toBe('NOTE_PATH_TAKEN');
    facade.create(INPUT);

    expect(gateway.createKeys[1]).not.toBe(gateway.createKeys[0]);
    facade.dismissProblem();
    expect(facade.problem()).toBeNull();
  });

  it('Dado criar com sucesso depois de falha ambígua, então a chave seguinte é nova', () => {
    const gateway = new NotesGatewayStub();
    gateway.next = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);
    facade.create(INPUT);
    gateway.next = null;
    facade.create(INPUT);
    facade.create(INPUT);

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
    expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[1]);
  });
});
