import {
  filtersFromQuery,
  filtersToQuery,
  NO_FILTERS,
} from '~/modules/notes/core/types/note-filters';

const from = (params: Record<string, string>) => filtersFromQuery((key) => params[key] ?? null);

describe('note-filters', () => {
  it('Dado URL sem parâmetros, então são os filtros padrão', () => {
    expect(from({})).toEqual(NO_FILTERS);
  });

  it('Dado URL com tudo, então lê busca, tag, pasta e lixeira', () => {
    expect(from({ q: ' mac ', tag: 'trabalho', folder: 'projetos', view: 'trash' })).toEqual({
      q: 'mac',
      tag: 'trabalho',
      folder: 'projetos',
      view: 'TRASHED',
    });
  });

  it('Dado valores gigantes ou view desconhecida, então corta e cai no padrão', () => {
    const result = from({ q: 'a'.repeat(500), tag: 'b'.repeat(200), view: 'xyz' });
    expect(result.q).toHaveLength(200);
    expect(result.tag).toHaveLength(64);
    expect(result.view).toBe('ACTIVE');
  });

  it('Dado filtros, então só o que difere do padrão vai para a URL e volta igual', () => {
    expect(filtersToQuery(NO_FILTERS)).toEqual({});
    const filters = { q: 'mac', tag: 'x', folder: 'a/b', view: 'TRASHED' as const };
    const query = filtersToQuery(filters);
    expect(query).toEqual({ q: 'mac', tag: 'x', folder: 'a/b', view: 'trash' });
    expect(from(query)).toEqual(filters);
  });
});
