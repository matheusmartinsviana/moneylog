import { Observable } from 'rxjs';

import type {
  ThirdPartyExpense,
  ThirdPartyExpenseInput,
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
}
