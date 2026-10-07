/** Limite do `q` do backend (acima disso é 400). */
export const SEARCH_TERM_MAX_LENGTH = 100;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Texto de busca pronto para o `q` da API: sem caracteres de controle (o backend responde 400) e com no
 * máximo 100 caracteres (FE-S-176). Não apara espaços: quem monta a query decide.
 */
export function cleanSearchTerm(text: string): string {
  return text.replace(CONTROL_CHARS, '').slice(0, SEARCH_TERM_MAX_LENGTH);
}

/** Mínimo de caracteres do `q` da busca global (contrato 2.6.0: 2 a 100). */
export const SEARCH_QUERY_MIN_LENGTH = 2;

/**
 * `q` da busca global (`GET /v1/search`): sem caracteres de controle (o backend responde `400
 * SEARCH_QUERY_INVALID`), aparado e com no máximo 100 **pontos de código**. `null` quando sobram menos de 2: nesse
 * caso o front nem chama a API.
 */
export function searchQueryOf(text: string): string | null {
  const cleaned = Array.from(text.replace(CONTROL_CHARS, ' ').trim())
    .slice(0, SEARCH_TERM_MAX_LENGTH)
    .join('')
    .trim();
  return Array.from(cleaned).length >= SEARCH_QUERY_MIN_LENGTH ? cleaned : null;
}
