import { Observable } from 'rxjs';

import type {
  ThirdPartyExpense,
  ThirdPartyExpenseInput,
  ThirdPartyReceipt,
  ThirdPartyReceiptInput,
  ThirdPartyReceivables,
} from '~/modules/third-parties/core/types/third-party';

/**
 * Porta de "dinheiro a receber de terceiros" e da marca de despesa de terceiro. Falha com `ProblemError`
 * (`THIRD_PARTY_EXPENSE_INVALID`, `THIRD_PARTY_EXPENSE_ALREADY_MARKED`, `PERSON_ARCHIVED`...).
 */
export abstract class ThirdPartiesGateway {
  /** `month` = `AAAA-MM`; sem ele, o servidor usa o mês atual. */
  abstract receivables(month: string | null): Observable<ThirdPartyReceivables>;
  /** `Idempotency-Key`: uma por tentativa (o retry reusa). */
  abstract mark(
    input: ThirdPartyExpenseInput,
    idempotencyKey: string,
  ): Observable<ThirdPartyExpense>;
  /** Registra um recebimento sem movimento de conta. `Idempotency-Key`: uma por tentativa. */
  abstract recordReceipt(
    input: ThirdPartyReceiptInput,
    idempotencyKey: string,
  ): Observable<ThirdPartyReceipt>;
  /** Remove um recebimento registrado sem movimento (`204`). */
  abstract deleteReceipt(id: string): Observable<void>;
}
