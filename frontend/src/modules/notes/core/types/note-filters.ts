import { MAX_SEARCH_LENGTH } from '~/modules/notes/core/types/note';

/** Filtros da tela de notas (espelhados na URL). */
export interface NotesFilters {
  readonly q: string;
  readonly tag: string | null;
  readonly folder: string | null;
  readonly view: 'ACTIVE' | 'TRASHED';
}

export const NO_FILTERS: NotesFilters = { q: '', tag: null, folder: null, view: 'ACTIVE' };

/** Lê os filtros da URL (`q`, `tag`, `folder`, `view=trash`); valor inválido cai no padrão. */
export function filtersFromQuery(get: (key: string) => string | null): NotesFilters {
  const q = (get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
  const tag = (get('tag') ?? '').trim().slice(0, 64);
  const folder = (get('folder') ?? '').trim().slice(0, 255);
  return {
    q,
    tag: tag === '' ? null : tag,
    folder: folder === '' ? null : folder,
    view: get('view') === 'trash' ? 'TRASHED' : 'ACTIVE',
  };
}

/** Só o que difere do padrão vai para a URL. */
export function filtersToQuery(filters: NotesFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.q !== '') query['q'] = filters.q;
  if (filters.tag !== null) query['tag'] = filters.tag;
  if (filters.folder !== null) query['folder'] = filters.folder;
  if (filters.view === 'TRASHED') query['view'] = 'trash';
  return query;
}
