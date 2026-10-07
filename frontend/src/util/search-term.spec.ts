import { cleanSearchTerm, SEARCH_TERM_MAX_LENGTH, searchQueryOf } from '~/util/search-term';

describe('cleanSearchTerm', () => {
  it('Dado texto com caracteres de controle, Quando limpa, Então os remove e mantém o resto', () => {
    expect(cleanSearchTerm('caf\u0000é\n\t 12\u007F')).toBe('café 12');
  });

  it('Dado texto acima de 100 caracteres, Quando limpa, Então corta em 100', () => {
    expect(cleanSearchTerm('a'.repeat(150))).toHaveLength(SEARCH_TERM_MAX_LENGTH);
  });
});

describe('searchQueryOf', () => {
  it('Dado menos de 2 caracteres úteis, Quando monta o q, Então não há busca (null)', () => {
    expect(searchQueryOf('')).toBeNull();
    expect(searchQueryOf(' a ')).toBeNull();
    expect(searchQueryOf('\u0000\u0007 b')).toBeNull();
  });

  it('Dado espaços e caracteres de controle, Quando monta o q, Então apara e troca o controle por espaço', () => {
    expect(searchQueryOf('  mercado\u0000  ')).toBe('mercado');
    expect(searchQueryOf('pão\tde queijo')).toBe('pão de queijo');
  });

  it('Dado mais de 100 pontos de código, Quando monta o q, Então corta em 100 sem partir um emoji', () => {
    const q = searchQueryOf('😀'.repeat(150));
    expect(Array.from(q ?? '')).toHaveLength(SEARCH_TERM_MAX_LENGTH);
    expect(q).not.toMatch(/\uD83D$/);
  });
});
