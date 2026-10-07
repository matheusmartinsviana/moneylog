import type { AuthTokenResponse } from '~/modules/auth/infra/responses/auth-token.response';

/**
 * Sessão falsa do ambiente mock (S-67): a suíte E2E do shell roda sem backend e sem passar pela
 * tela de login. O valor não é segredo e nunca sai do navegador (nenhuma requisição é feita).
 */
export const FAKE_SESSION: AuthTokenResponse = {
  accessToken: 'mock-access-token',
  expiresAt: '2099-12-31T00:00:00Z',
};
