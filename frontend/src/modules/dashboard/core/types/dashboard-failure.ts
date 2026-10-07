/**
 * Motivo de falha que a tela sabe tratar. A infra traduz o erro técnico (HTTP) para este tipo,
 * então o core não conhece `HttpErrorResponse`.
 * - `forbidden`: sem permissão para ler o resumo (403);
 * - `unavailable`: qualquer outra falha (rede, 5xx, timeout): a tela oferece "tentar de novo".
 */
export type DashboardFailureReason = 'forbidden' | 'unavailable';

export class DashboardFailure extends Error {
  constructor(readonly reason: DashboardFailureReason) {
    super(`Dashboard indisponível: ${reason}`);
    this.name = 'DashboardFailure';
  }
}
