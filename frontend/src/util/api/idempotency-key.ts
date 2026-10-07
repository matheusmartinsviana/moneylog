import type { Problem } from '~/util/api/problem';

/**
 * Chave de idempotência (UUID v4) do `POST /v1/transactions` (S-72, S-87): uma por **tentativa de
 * envio**. Quem chama a guarda e a reenvia no "tentar de novo" depois de um erro de rede.
 *
 * `crypto.randomUUID` só existe em contexto seguro; em `http://<IP da LAN>` (dev no celular) cai
 * para `getRandomValues`, que existe em qualquer contexto.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/** Falha em que o servidor pode ter gravado: sem resposta (rede), 5xx ou `CONFLICT` (trava ocupada). */
export function isAmbiguousFailure(problem: Problem | null): boolean {
  return (
    problem !== null &&
    (problem.status === 0 || problem.status >= 500 || problem.code === 'CONFLICT')
  );
}

/**
 * Guarda a chave de idempotência de uma criação: uma chave por tentativa, **reaproveitada** quando a
 * tentativa anterior falhou de forma ambígua e a entrada é a mesma (o backend devolve o que já gravou
 * em vez de duplicar); entrada diferente gera chave nova. Uso: `key = begin(input)`; ao terminar,
 * `succeeded()` ou `failed(problem)`.
 */
export class IdempotencyTracker<T> {
  private pending: { readonly fingerprint: string; readonly key: string } | null = null;
  private current: { readonly fingerprint: string; readonly key: string } | null = null;

  begin(input: T): string {
    const fingerprint = JSON.stringify(input);
    const key =
      this.pending !== null && this.pending.fingerprint === fingerprint
        ? this.pending.key
        : newIdempotencyKey();
    this.current = { fingerprint, key };
    return key;
  }

  succeeded(): void {
    this.pending = null;
    this.current = null;
  }

  failed(problem: Problem | null): void {
    this.pending = isAmbiguousFailure(problem) ? this.current : null;
  }
}
