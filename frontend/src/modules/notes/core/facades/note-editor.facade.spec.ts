import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { NoteEditorFacade } from '~/modules/notes/core/facades/note-editor.facade';
import { failWith } from '~/testing/accounts-testing';
import { aNote, anExplicitLink, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

function setup(gateway = new NotesGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideNotesStub(gateway), NoteEditorFacade] });
  const facade = TestBed.inject(NoteEditorFacade);
  return { gateway, facade };
}

describe('NoteEditorFacade', () => {
  it('Dado carregar, então a nota (com corpo) e o baseline ficam disponíveis e os backlinks carregam', () => {
    const gateway = new NotesGatewayStub();
    gateway.backlinkItems = [
      { noteId: 'n9', path: 'x.md', title: 'x', context: 'veja [[2026-10]]' },
    ];
    const { facade } = setup(gateway);

    facade.load('note-1');

    expect(facade.note()?.id).toBe('note-1');
    expect(facade.baseline()).toBe(aNote().body);
    expect(facade.backlinks()).toMatchObject({ status: 'ready' });
    expect(gateway.calls).toContain('backlinks:note-1:1');
  });

  it('Dado 404, então a nota some e o estado é erro', () => {
    const gateway = new NotesGatewayStub();
    gateway.getResult = failWith(404, 'NOTE_NOT_FOUND');
    const { facade } = setup(gateway);

    facade.load('x');

    expect(facade.note()).toBeNull();
    expect(facade.loadStatus()).toMatchObject({ status: 'error' });
  });

  it('Dado salvar, então envia a version da nota e a resposta vira o estado', () => {
    const { facade, gateway } = setup();
    facade.load('note-1');
    const saved: string[] = [];
    facade.saved$.subscribe(({ sentBody }) => saved.push(sentBody));

    facade.save('novo texto');

    expect(gateway.updates).toEqual([{ id: 'note-1', body: 'novo texto', version: 3 }]);
    expect(facade.note()?.version).toBe(4);
    expect(facade.baseline()).toBe('novo texto');
    expect(saved).toEqual(['novo texto']);
    expect(facade.busy()).toBe(false);
  });

  it('Dado VERSION_CONFLICT, então NÃO sobrescreve: guarda a versão do servidor e mantém o baseline', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    const remote = aNote({ version: 7, body: 'texto de outro lugar' });
    gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
    gateway.getResult = of(remote);

    facade.save('o que eu digitei');

    expect(facade.problem()?.code).toBe('VERSION_CONFLICT');
    expect(facade.conflict()?.remote.version).toBe(7);
    expect(facade.conflict()?.during).toBe('save');
    // o texto local não é tocado: o baseline e a nota continuam os de antes
    expect(facade.baseline()).toBe(aNote().body);
    expect(facade.note()?.version).toBe(3);
    expect(gateway.updates).toHaveLength(1);
  });

  it('Dado conflito e "usar o meu texto", então reenvia o texto dele com a version do servidor', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
    gateway.getResult = of(aNote({ version: 7 }));
    facade.save('meu texto');

    facade.saveOverConflict('meu texto');

    expect(gateway.updates.at(-1)).toEqual({ id: 'note-1', body: 'meu texto', version: 7 });
    expect(facade.conflict()).toBeNull();
    expect(facade.note()?.version).toBe(8);
    expect(facade.baseline()).toBe('meu texto');
  });

  it('Dado conflito e "usar a do servidor", então troca a nota e avisa a tela', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
    gateway.getResult = of(aNote({ version: 7, body: 'do servidor' }));
    const replaced: string[] = [];
    facade.replaced$.subscribe((note) => replaced.push(note.body));
    facade.save('meu texto');

    facade.acceptRemote();

    expect(facade.note()?.body).toBe('do servidor');
    expect(facade.baseline()).toBe('do servidor');
    expect(facade.conflict()).toBeNull();
    expect(replaced).toEqual(['do servidor']);
  });

  describe('conflito em renomear/vincular (F4)', () => {
    it('Dado conflito ao renomear, então guarda `during: move` e a ação a refazer', () => {
      const gateway = new NotesGatewayStub();
      const { facade } = setup(gateway);
      facade.load('note-1');
      gateway.moveQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'edição em outra aba' }));

      facade.move('novo/caminho.md');

      expect(facade.conflict()?.during).toBe('move');
      expect(facade.conflict()?.redo).toEqual({ kind: 'move', newPath: 'novo/caminho.md' });
    });

    it('Dado conflito ao renomear e rascunho limpo, então adota o servidor e refaz o renomear na versão nova', () => {
      const gateway = new NotesGatewayStub();
      const { facade } = setup(gateway);
      facade.load('note-1');
      gateway.moveQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'edição em outra aba' }));
      facade.move('novo/caminho.md');
      const replaced: string[] = [];
      facade.replaced$.subscribe((note) => replaced.push(note.body));

      const redone = facade.adoptRemoteAndRedo();

      expect(redone).toBe(true);
      expect(replaced).toEqual(['edição em outra aba']);
      expect(gateway.moves.at(-1)).toEqual({
        id: 'note-1',
        newPath: 'novo/caminho.md',
        version: 7,
      });
      expect(facade.conflict()).toBeNull();
      expect(facade.note()?.path).toBe('novo/caminho.md');
      // nenhum salvar do corpo foi enviado: a edição de outra aba nunca é sobrescrita
      expect(gateway.updates).toEqual([]);
    });

    it('Dado conflito ao vincular, então refaz a mudança sobre os vínculos da versão nova (sem perder os do servidor)', () => {
      const gateway = new NotesGatewayStub();
      const { facade } = setup(gateway);
      facade.load('note-1');
      const remoteLink = anExplicitLink({
        type: 'GOAL',
        target: { id: 'goal-9', key: null, label: 'Meta', status: 'ACTIVE' },
      });
      gateway.setLinksQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, links: [remoteLink] }));
      const added = { type: 'TRANSACTION' as const, id: 'tx-1' };

      facade.setLinks([added], { add: added });
      facade.adoptRemoteAndRedo();

      expect(gateway.linkSets.at(-1)).toEqual({
        id: 'note-1',
        links: [{ type: 'GOAL', id: 'goal-9' }, added],
        version: 7,
      });
    });

    it('Dado conflito ao salvar, então não há o que refazer sozinho (a escolha é do usuário)', () => {
      const gateway = new NotesGatewayStub();
      const { facade } = setup(gateway);
      facade.load('note-1');
      gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7 }));
      facade.save('meu texto');

      expect(facade.conflict()?.redo).toBeNull();
      expect(facade.adoptRemoteAndRedo()).toBe(false);
    });

    it('Dado conflitos repetidos, então para de refazer sozinho depois de duas tentativas', () => {
      const gateway = new NotesGatewayStub();
      const { facade } = setup(gateway);
      facade.load('note-1');
      gateway.getResult = of(aNote({ version: 7 }));
      gateway.moveQueue.push(
        failWith(409, 'VERSION_CONFLICT'),
        failWith(409, 'VERSION_CONFLICT'),
        failWith(409, 'VERSION_CONFLICT'),
      );

      facade.move('a.md');
      expect(facade.adoptRemoteAndRedo()).toBe(true);
      expect(facade.adoptRemoteAndRedo()).toBe(true);
      expect(facade.adoptRemoteAndRedo()).toBe(false);
      expect(facade.conflict()).not.toBeNull();
    });

    it('Dado salvar cuja resposta se perdeu (o servidor já tem o mesmo texto), então resolve sozinho, sem painel', () => {
      const gateway = new NotesGatewayStub();
      const { facade } = setup(gateway);
      facade.load('note-1');
      const saved: string[] = [];
      facade.saved$.subscribe(({ sentBody }) => saved.push(sentBody));
      gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
      gateway.getResult = of(aNote({ version: 7, body: 'meu texto' }));

      facade.save('meu texto');

      expect(facade.conflict()).toBeNull();
      expect(facade.problem()).toBeNull();
      expect(facade.note()?.version).toBe(7);
      expect(facade.baseline()).toBe('meu texto');
      expect(saved).toEqual(['meu texto']);
    });
  });

  it('Dado conflito cuja recarga também falha, então só o problema aparece (sem conflito)', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    gateway.updateQueue.push(failWith(409, 'VERSION_CONFLICT'));
    gateway.getResult = failWith(0, 'NETWORK');

    facade.save('x');

    expect(facade.problem()?.code).toBe('VERSION_CONFLICT');
    expect(facade.conflict()).toBeNull();
  });

  it('Dado 422 NOTE_TOO_LARGE, então o problema fica tipado e o baseline não muda', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    gateway.updateQueue.push(failWith(422, 'NOTE_TOO_LARGE'));

    facade.save('x');

    expect(facade.problem()?.code).toBe('NOTE_TOO_LARGE');
    expect(facade.baseline()).toBe(aNote().body);
    facade.dismissProblem();
    expect(facade.problem()).toBeNull();
  });

  it('Dado mover, então envia o novo caminho com a version e mostra as notas reescritas', () => {
    const gateway = new NotesGatewayStub();
    gateway.moveResult = of({
      note: aNote({ path: 'reviews/outubro.md', version: 4 }),
      rewrittenNotes: [{ id: 'n2', path: 'a.md', title: 'a' }],
    });
    const { facade } = setup(gateway);
    facade.load('note-1');
    const rewritten: number[] = [];
    facade.moved$.subscribe((moved) => rewritten.push(moved.rewrittenNotes.length));

    facade.move('reviews/outubro.md');

    expect(gateway.calls).toContain('move:note-1:reviews/outubro.md:3');
    expect(facade.note()?.path).toBe('reviews/outubro.md');
    expect(rewritten).toEqual([1]);
  });

  it('Dado lixeira e restaurar, então a nota da resposta vira o estado', () => {
    const { facade } = setup();
    facade.load('note-1');
    const events: string[] = [];
    facade.trashed$.subscribe(() => events.push('trashed'));
    facade.restored$.subscribe(() => events.push('restored'));

    facade.trash();
    expect(facade.trashed()).toBe(true);
    facade.restore();

    expect(facade.trashed()).toBe(false);
    expect(events).toEqual(['trashed', 'restored']);
  });

  it('Dado vínculos, então PUT /links leva a version e a nota da resposta fica; o baseline do texto não muda', () => {
    const { facade, gateway } = setup();
    facade.load('note-1');

    facade.setLinks([{ type: 'MONTHLY_SUMMARY', key: '2026-10' }]);

    expect(gateway.linkSets).toEqual([
      { id: 'note-1', links: [{ type: 'MONTHLY_SUMMARY', key: '2026-10' }], version: 3 },
    ]);
    expect(facade.note()?.version).toBe(4);
    expect(facade.baseline()).toBe(aNote().body);
  });

  it('Dado NOTE_LINK_TARGET_NOT_FOUND ao vincular, então o problema fica tipado', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    gateway.next = failWith(422, 'NOTE_LINK_TARGET_NOT_FOUND');

    facade.setLinks([{ type: 'GOAL', id: 'g' }]);

    expect(facade.problem()?.code).toBe('NOTE_LINK_TARGET_NOT_FOUND');
  });

  it('Dado erro nos backlinks, então o estado é erro e a nota continua', () => {
    const gateway = new NotesGatewayStub();
    gateway.backlinksResult = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load('note-1');

    expect(facade.backlinks()).toMatchObject({ status: 'error' });
    expect(facade.note()).not.toBeNull();
  });

  it('Dado refresh, então atualiza a nota (vínculos e versão) sem tocar no baseline do texto', () => {
    const gateway = new NotesGatewayStub();
    const { facade } = setup(gateway);
    facade.load('note-1');
    gateway.getResult = of(aNote({ version: 5, body: 'texto novo no servidor', links: [] }));

    facade.refresh();

    expect(facade.note()?.version).toBe(5);
    expect(facade.baseline()).toBe(aNote().body);
  });

  it('Dado salvar sem nota carregada, então nada é enviado', () => {
    const { facade, gateway } = setup();

    facade.save('x');

    expect(gateway.updates).toEqual([]);
  });
});
