import { linkRoute, routeOfLink } from '~/app/features/notes/services/link-routes';
import { anExplicitLink } from '~/testing/notes-testing';

describe('linkRoute', () => {
  it.each([
    ['TRANSACTION', 'tx-1', null, ['/transactions', 'tx-1']],
    ['GOAL', 'g-1', null, ['/goals', 'g-1']],
    ['PERSON', 'p-1', null, ['/people', 'p-1']],
    ['DEBT', 'd-1', null, ['/debts', 'd-1']],
    ['CARD', 'c-1', null, ['/cards', 'c-1']],
    ['NOTE', 'n-1', null, ['/notes', 'n-1']],
    ['MONTHLY_SUMMARY', null, '2026-10', ['/planning/summary', '2026-10']],
    ['INVOICE', 'i-1', null, null],
    ['TRANSACTION', null, null, null],
  ] as const)('Dado %s id=%s key=%s, então a rota é %j', (type, id, key, expected) => {
    expect(linkRoute(type, id, key)).toEqual(expected);
  });

  it('Dado um vínculo sem alvo (pendente), então não há rota', () => {
    expect(routeOfLink(anExplicitLink({ target: null }))).toBeNull();
    expect(routeOfLink(anExplicitLink())).toEqual(['/transactions', 'tx-1']);
  });
});
