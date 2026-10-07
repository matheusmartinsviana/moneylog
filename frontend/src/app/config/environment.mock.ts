/**
 * Ambiente de mock (S-67): substitui `environment.ts` nas configurações `mock` (`npm run start:mock`)
 * e `production-mock` (build de produção para o projeto Playwright `prod`). As facades de requisições
 * respondem com `mock-data`, a auth devolve uma sessão falsa e nenhuma chamada a `/v1` acontece.
 * O formato precisa ser idêntico ao de `environment.ts`.
 */
export const environment = {
  apiMocks: true,
} as const;
