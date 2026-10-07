/**
 * Configuração de ambiente, lida em um lugar só (FE 05). Tudo aqui vai para o bundle: nada de
 * segredo (FE 06).
 *
 * Este é o ambiente **real**: as facades de requisições chamam `/v1`. O modo mock entra só por
 * configuração de build, trocando este arquivo por `environment.mock.ts` (`fileReplacements` das
 * configurações `mock` e `production-mock` em `angular.json`, S-67). A tela nunca sabe qual é.
 */
export const environment = {
  apiMocks: false,
} as const;
