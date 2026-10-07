/**
 * Quais requisições são da API do moneylog (`/v1`, mesma origem; em dev o proxy encaminha). Lista
 * por prefixo: outra origem, `/assets` e o service worker nunca recebem o `Bearer` (FE 06).
 */
const API_PREFIX = '/v1/';
const AUTH_PREFIX = '/v1/auth/';

function pathOf(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

/** É uma chamada à API (`/v1/...`) da própria origem? */
export function isApiRequest(url: string): boolean {
  return pathOf(url).startsWith(API_PREFIX);
}

/** É uma rota pública de auth (`/v1/auth/*`): sem `Bearer`, sem refresh e sem redirecionamento no 401. */
export function isAuthRequest(url: string): boolean {
  return pathOf(url).startsWith(AUTH_PREFIX);
}
