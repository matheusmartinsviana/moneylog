import { Observable } from 'rxjs';

import type {
  Debt,
  DebtDirection,
  DebtInput,
  DebtStatus,
  DebtUpdate,
} from '~/modules/debts/core/types/debt';
import type { Slice } from '~/util/api/slice';

export interface DebtsQuery {
  readonly direction?: DebtDirection;
  readonly status?: DebtStatus;
  readonly personId?: string;
  /** `true` filtra as dívidas com previsão anterior a hoje e saldo em aberto (S-145). */
  readonly overdue?: boolean;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Porta de dívidas (FE 01). As implementações falham com `ProblemError` (`DEBT_HAS_SETTLEMENTS`,
 * `DEBT_CLOSED`, `DEBT_REASON_REQUIRED`, `VERSION_CONFLICT`...). As movimentações de dívida (emprestar,
 * receber, pagar) nascem em `POST /v1/transactions` (módulo de movimentações).
 */
export abstract class DebtsGateway {
  abstract list(query: DebtsQuery): Observable<Slice<Debt>>;
  abstract get(id: string): Observable<Debt>;
  /** Dívida sem movimentação: não mexe no caixa. `Idempotency-Key`: uma por tentativa (o retry reusa). */
  abstract create(input: DebtInput, idempotencyKey: string): Observable<Debt>;
  abstract update(id: string, input: DebtUpdate): Observable<Debt>;
  /** Perdoa o saldo restante (não pode ser desfeito); o motivo é obrigatório. */
  abstract cancel(id: string, reason: string): Observable<Debt>;
  /** Estorna o registro de uma dívida sem movimentação e sem quitações. */
  abstract void(id: string, reason: string): Observable<Debt>;
}
