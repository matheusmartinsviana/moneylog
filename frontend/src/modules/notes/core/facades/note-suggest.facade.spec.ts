import { TestBed } from '@angular/core/testing';

import { NoteSuggestFacade } from '~/modules/notes/core/facades/note-suggest.facade';
import { failWith } from '~/testing/accounts-testing';
import { aSummary, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

function setup(gateway = new NotesGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({ providers: [provideNotesStub(gateway), NoteSuggestFacade] });
  return { gateway, facade: TestBed.inject(NoteSuggestFacade) };
}

describe('NoteSuggestFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado digitar, então busca notas ativas depois do debounce e só a última vale', () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = [aSummary({ id: 'a', title: 'MacBook', path: 'MacBook.md' })];
    const { facade } = setup(gateway);

    facade.search('m');
    facade.search('mac');
    vi.advanceTimersByTime(200);

    expect(gateway.queries).toHaveLength(1);
    expect(gateway.queries[0]).toMatchObject({ q: 'mac', status: 'ACTIVE' });
    expect(facade.suggestions().map((n) => n.id)).toEqual(['a']);
  });

  it('Dado falha, então a lista vem vazia (nunca bloqueia a escrita)', () => {
    const gateway = new NotesGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.search('x');
    vi.advanceTimersByTime(200);

    expect(facade.suggestions()).toEqual([]);
    expect(facade.loading()).toBe(false);
  });

  it('Dado clear, então esvazia', () => {
    const gateway = new NotesGatewayStub();
    gateway.notes = [aSummary()];
    const { facade } = setup(gateway);
    facade.search('');
    vi.advanceTimersByTime(200);
    expect(facade.suggestions()).toHaveLength(1);

    facade.clear();

    expect(facade.suggestions()).toEqual([]);
  });
});
