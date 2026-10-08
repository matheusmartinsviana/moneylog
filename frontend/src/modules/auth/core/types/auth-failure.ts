/**
 * Motivo de falha que a tela e a sessão sabem tratar. A infra traduz o erro HTTP para este tipo,
 * então o core não conhece `HttpErrorResponse`.
 * - `invalid_credentials`: 401 do login (a mesma resposta para e-mail ou senha errados);
 * - `rate_limited`: 429, com a espera do `Retry-After` em segundos;
 * - `refresh_invalid`: 401 do refresh (cookie ausente, expirado ou revogado): a sessão acabou;
 * - `network`: sem resposta (offline); a sessão **não** é limpa (S-93);
 * - `unavailable`: qualquer outra falha (5xx, 403 de origem...);
 * - `invalid_setup_code`: 401 do primeiro acesso (e-mail ou código inválidos, sem detalhar qual);
 * - `weak_password`: 422 do primeiro acesso (o código continua válido);
 * - `validation`: 400 do primeiro acesso.
 */
export type AuthFailureReason =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'refresh_invalid'
  | 'network'
  | 'unavailable'
  | 'invalid_setup_code'
  | 'weak_password'
  | 'validation';

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
