/**
 * Motivo de falha que a tela e a sessão sabem tratar. A infra traduz o erro HTTP para este tipo,
 * então o core não conhece `HttpErrorResponse`.
 * - `invalid_credentials`: 401 do login (a mesma resposta para e-mail ou senha errados);
 * - `rate_limited`: 429, com a espera do `Retry-After` em segundos;
 * - `refresh_invalid`: 401 do refresh (cookie ausente, expirado ou revogado): a sessão acabou;
 * - `network`: sem resposta (offline); a sessão **não** é limpa (S-93);
 * - `unavailable`: qualquer outra falha (5xx, 403 de origem...).
 */
export type AuthFailureReason =
  'invalid_credentials' | 'rate_limited' | 'refresh_invalid' | 'network' | 'unavailable';

export class AuthFailure extends Error {
  constructor(
    readonly reason: AuthFailureReason,
    /** Só em `rate_limited`: segundos até poder tentar de novo. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`Autenticação: ${reason}`);
    this.name = 'AuthFailure';
  }
}
