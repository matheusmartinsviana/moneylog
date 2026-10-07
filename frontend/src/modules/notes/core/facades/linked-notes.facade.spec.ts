import { TestBed } from '@angular/core/testing';

import { LinkedNotesFacade } from '~/modules/notes/core/facades/linked-notes.facade';
import { failWith } from '~/testing/accounts-testing';
import { aSummary, NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

function setup(gateway = new NotesGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideNotesStub(gateway), LinkedNotesFacade] });
  return { gateway, facade: TestBed.inject(LinkedNotesFacade) };
}

describe('LinkedNotesFacade', () => {
  it('Dado uma transação, então pede GET /links com o tipo e o id', () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = [aSummary()];
    const { facade } = setup(gateway);

    facade.load({ type: 'TRANSACTION', id: 'tx-1' });

    expect(gateway.linkedQueries[0]).toMatchObject({ type: 'TRANSACTION', id: 'tx-1', page: 1 });
    expect(facade.items()).toHaveLength(1);
  });

  it('Dado o resumo mensal, então pede pela key AAAA-MM', () => {
    const { facade, gateway } = setup();

    facade.load({ type: 'MONTHLY_SUMMARY', key: '2026-10' });

    expect(gateway.linkedQueries[0]).toMatchObject({ type: 'MONTHLY_SUMMARY', key: '2026-10' });
    expect(gateway.linkedQueries[0]?.id).toBeUndefined();
    expect(facade.state()).toMatchObject({ status: 'ready', items: [] });
  });

  it('Dado erro, então o estado é erro e "tentar de novo" recarrega', () => {
    const gateway = new NotesGatewayStub();
    gateway.linkedResult = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);
    facade.load({ type: 'GOAL', id: 'g1' });
    expect(facade.state().status).toBe('error');

    gateway.linkedResult = null;
    facade.retry();

    expect(facade.state().status).toBe('ready');
  });

  it('Dado mais de uma página, então "mostrar mais" acrescenta', () => {
    const gateway = new NotesGatewayStub();
    gateway.linked = Array.from({ length: 25 }, (_, i) => aSummary({ id: `n${i}` }));
    const { facade } = setup(gateway);
    facade.load({ type: 'PERSON', id: 'p1' });
    expect(facade.items()).toHaveLength(20);

    facade.loadMore();

    expect(facade.items()).toHaveLength(25);
    expect(gateway.linkedQueries.at(-1)?.page).toBe(2);
  });
});
