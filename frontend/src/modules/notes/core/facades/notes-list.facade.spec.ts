import { TestBed } from '@angular/core/testing';
import { NEVER, Subject } from 'rxjs';

import {
  NotesListFacade,
  SEARCH_DEBOUNCE_MS,
  TREE_INITIAL_PAGES,
  TREE_MAX_PAGES,
  TREE_STEP_PAGES,
} from '~/modules/notes/core/facades/notes-list.facade';
import { NO_FILTERS } from '~/modules/notes/core/types/note-filters';
import { failWith } from '~/testing/accounts-testing';
import { aNote, aSummary, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

function setup(gateway = new NotesGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideNotesStub(gateway), NotesListFacade] });
  return { gateway, facade: TestBed.inject(NotesListFacade) };
}

const NOTES = [
  aSummary({ id: 'n1', path: 'reviews/2026-10.md', title: '2026-10', tags: ['revisao'] }),
  aSummary({ id: 'n2', path: 'projetos/MG Tech.md', title: 'MG Tech', tags: ['trabalho'] }),
  aSummary({ id: 'n3', path: 'MacBook.md', title: 'MacBook', tags: [] }),
];

describe('NotesListFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado o carregamento, então passa por loading e entrega as notas ativas sem corpo', () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    const { facade } = setup(gateway);

    facade.apply(NO_FILTERS);

    expect(facade.state()).toMatchObject({ status: 'ready', hasNext: false });
    expect(facade.items()).toHaveLength(3);
    expect(gateway.queries[0]).toMatchObject({ status: 'ACTIVE', page: 1 });
    expect(Object.keys(facade.items()![0]!)).not.toContain('body');
    expect(facade.filtered()).toBe(false);
  });

  it('Dado filtros de tag e pasta, então vão para o backend e marcam "filtrado"', () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    const { facade } = setup(gateway);

    facade.apply({ q: '', tag: 'trabalho', folder: 'projetos', view: 'ACTIVE' });

    expect(gateway.queries[0]).toMatchObject({ tag: 'trabalho', folder: 'projetos' });
    expect(facade.items()?.map((n) => n.id)).toEqual(['n2']);
    expect(facade.filtered()).toBe(true);
  });

  it('Dado a busca digitada, então espera 300 ms parado e cancela a requisição anterior', () => {
    vi.useFakeTimers();
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    const { facade } = setup(gateway);
    facade.apply(NO_FILTERS);
    gateway.queries.length = 0;

    facade.search('m');
    vi.advanceTimersByTime(200);
    facade.search('mac');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(gateway.queries).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(gateway.queries).toHaveLength(1);
    expect(gateway.queries[0]?.q).toBe('mac');
    expect(facade.filters().q).toBe('mac');
  });

  it('Dado a mesma busca repetida ou a que já está na URL, então não recarrega', () => {
    vi.useFakeTimers();
    const { gateway, facade } = setup();
    facade.apply({ ...NO_FILTERS, q: 'mac' });
    gateway.queries.length = 0;

    facade.search('mac');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(gateway.queries).toHaveLength(0);
  });

  it('Dado outro filtro durante a requisição, então a anterior é descartada (switchMap)', () => {
    const first = new Subject<never>();
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    const { facade } = setup(gateway);
    const original = gateway.list.bind(gateway);
    let calls = 0;
    gateway.list = (query) => (++calls === 1 ? first : original(query));

    facade.apply(NO_FILTERS);
    expect(facade.state().status).toBe('loading');
    facade.apply({ ...NO_FILTERS, tag: 'trabalho' });
    expect(facade.items()?.map((n) => n.id)).toEqual(['n2']);
    expect(first.observed).toBe(false);
  });

  it('Dado erro, então o estado é erro e "tentar de novo" recarrega', () => {
    const gateway = new NotesGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.apply(NO_FILTERS);
    expect(facade.error()?.code).toBe('INTERNAL_ERROR');

    gateway.listError = null;
    gateway.notes = NOTES;
    facade.retry();
    expect(facade.state().status).toBe('ready');
  });

  it('Dado mais de uma página, então "mostrar mais" acrescenta a próxima', () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = Array.from({ length: 60 }, (_, i) =>
      aSummary({ id: `n${i}`, path: `n${i}.md`, title: `n${i}` }),
    );
    const { facade } = setup(gateway);

    facade.apply(NO_FILTERS);
    expect(facade.items()).toHaveLength(50);
    facade.loadMore();

    expect(facade.items()).toHaveLength(60);
    expect(facade.state()).toMatchObject({ hasNext: false });
    expect(gateway.queries.at(-1)?.page).toBe(2);
  });

  it('Dado a lixeira, então pede status TRASHED', () => {
    const gateway = new NotesGatewayStub();
    gateway.trashed = [aSummary({ id: 't1', trashedAt: '2026-10-05T10:00:00Z' })];
    const { facade } = setup(gateway);

    facade.apply({ ...NO_FILTERS, view: 'TRASHED' });

    expect(gateway.queries[0]?.status).toBe('TRASHED');
    expect(facade.items()?.map((n) => n.id)).toEqual(['t1']);
  });

  it('Dado restaurar, então a nota sai da lixeira, o evento sai e a árvore recarrega', () => {
    const gateway = new NotesGatewayStub();
    gateway.trashed = [aSummary({ id: 't1', trashedAt: '2026-10-05T10:00:00Z' })];
    const { facade } = setup(gateway);
    const restored: string[] = [];
    facade.restored$.subscribe((n) => restored.push(n.id));
    facade.apply({ ...NO_FILTERS, view: 'TRASHED' });

    facade.restore('t1');

    expect(gateway.calls).toContain('restore:t1');
    expect(facade.items()).toEqual([]);
    expect(restored).toEqual(['t1']);
  });

  it('Dado restaurar com caminho ocupado (422), então a nota segue na lista e o problema fica tipado', () => {
    const gateway = new NotesGatewayStub();
    gateway.trashed = [aSummary({ id: 't1', trashedAt: '2026-10-05T10:00:00Z' })];
    const { facade } = setup(gateway);
    facade.apply({ ...NO_FILTERS, view: 'TRASHED' });
    gateway.next = failWith(422, 'NOTE_PATH_TAKEN');

    facade.restore('t1');

    expect(facade.items()).toHaveLength(1);
    expect(facade.actionProblem()?.code).toBe('NOTE_PATH_TAKEN');
    facade.dismissProblem();
    expect(facade.actionProblem()).toBeNull();
  });

  it('Dado esvaziar a lixeira, então chama o backend uma vez e a lista fica vazia', () => {
    const gateway = new NotesGatewayStub();
    gateway.trashed = [aSummary({ id: 't1' }), aSummary({ id: 't2' })];
    const { facade } = setup(gateway);
    let emptied = 0;
    facade.emptied$.subscribe(() => emptied++);
    facade.apply({ ...NO_FILTERS, view: 'TRASHED' });

    facade.emptyTrash();

    expect(gateway.calls.filter((c) => c === 'emptyTrash')).toHaveLength(1);
    expect(facade.items()).toEqual([]);
    expect(emptied).toBe(1);
  });

  it('Dado esvaziar que falha, então a lista continua e o problema aparece', () => {
    const gateway = new NotesGatewayStub();
    gateway.trashed = [aSummary({ id: 't1' })];
    gateway.emptyResult = failWith(409, 'CONFLICT');
    const { facade } = setup(gateway);
    facade.apply({ ...NO_FILTERS, view: 'TRASHED' });

    facade.emptyTrash();

    expect(facade.items()).toHaveLength(1);
    expect(facade.actionProblem()?.code).toBe('CONFLICT');
  });

  it('Dado a árvore, então deriva as pastas dos caminhos de todas as notas ativas e carrega as tags', () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = NOTES;
    gateway.tagList = [{ tag: 'revisao', count: 1 }];
    const { facade } = setup(gateway);

    facade.loadTreeAndTags();

    expect(facade.treeLoaded()).toBe(true);
    expect(facade.tree().count).toBe(3);
    expect(facade.tree().children.map((c) => c.path)).toEqual(['projetos', 'reviews']);
    expect(facade.tags()).toEqual([{ tag: 'revisao', count: 1 }]);
    expect(gateway.queries[0]).toMatchObject({ status: 'ACTIVE', sort: 'PATH' });
  });

  describe('árvore com muitas notas (F10)', () => {
    function many(count: number) {
      return Array.from({ length: count }, (_, i) =>
        aSummary({ id: `n${i}`, path: `pasta${i % 7}/nota${String(i).padStart(4, '0')}.md` }),
      );
    }

    it('Dado 1.500 notas, então a abertura faz só 2 requisições e oferece carregar mais (nada de 20 seguidas)', () => {
      const gateway = new NotesGatewayStub();
      gateway.notes = many(1500);
      const { facade } = setup(gateway);

      facade.loadTreeAndTags();

      expect(gateway.queries.filter((q) => q.sort === 'PATH')).toHaveLength(TREE_INITIAL_PAGES);
      expect(facade.treeNotes()).toBe(TREE_INITIAL_PAGES * 50);
      expect(facade.treeMore()).toBe('available');
    });

    it('Dado "carregar mais", então lê mais 4 páginas e, ao chegar a 1.000 notas, avisa que a árvore é parcial', () => {
      const gateway = new NotesGatewayStub();
      gateway.notes = many(1500);
      const { facade } = setup(gateway);
      facade.loadTreeAndTags();

      facade.loadMoreTree();
      expect(facade.treeNotes()).toBe((TREE_INITIAL_PAGES + TREE_STEP_PAGES) * 50);
      for (let i = 0; i < 10; i++) facade.loadMoreTree();

      expect(facade.treeNotes()).toBe(TREE_MAX_PAGES * 50);
      expect(facade.treeMore()).toBe('capped');
      const sorted = gateway.queries.filter((q) => q.sort === 'PATH');
      expect(sorted).toHaveLength(TREE_MAX_PAGES);
    });

    it('Dado poucas notas, então a árvore é completa e não oferece nada', () => {
      const gateway = new NotesGatewayStub();
      gateway.notes = many(30);
      const { facade } = setup(gateway);

      facade.loadTreeAndTags();

      expect(facade.treeMore()).toBe('none');
      expect(facade.tree().count).toBe(30);
    });
  });

  it('Dado erro ao montar a árvore, então a lista não é afetada', () => {
    const gateway = new NotesGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.loadTreeAndTags();

    expect(facade.treeLoaded()).toBe(true);
    expect(facade.tree().count).toBe(0);
  });

  it('Dado a página que nunca responde, então a lista fica em loading', () => {
    const gateway = new NotesGatewayStub();
    gateway.list = () => NEVER;
    const { facade } = setup(gateway);
    facade.apply(NO_FILTERS);
    expect(facade.state().status).toBe('loading');
    expect(aNote().id).toBe('note-1');
  });
});
