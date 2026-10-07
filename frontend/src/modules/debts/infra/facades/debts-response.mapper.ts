import type { Debt, DebtInput, DebtUpdate } from '~/modules/debts/core/types/debt';
import type {
  DebtCreateRequest,
  DebtResponse,
  DebtUpdateRequest,
} from '~/modules/debts/infra/responses/debt.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toDebt(response: DebtResponse): Debt {
  return {
    id: response.id,
    person: { id: response.person.id, name: response.person.name },
    direction: response.direction,
    origin: response.origin,
    originTransactionId: response.originTransactionId,
    principal: money(response.principal),
    settled: money(response.settled),
    outstanding: money(response.outstanding),
    status: response.status,
    date: response.date,
    expectedDate: response.expectedDate,
    overdue: response.overdue,
    description: response.description,
    category: response.category ? { id: response.category.id, name: response.category.name } : null,
    closureDate: response.closureDate,
    closureReason: response.closureReason,
    settlements: response.settlements.map((settlement) => ({
      transactionId: settlement.transactionId,
      amount: money(settlement.amount),
      date: settlement.date,
      active: settlement.active,
    })),
    cancelable: response.cancelable,
    voidable: response.voidable,
    voidBlockedBy: response.voidBlockedBy,
    version: response.version,
  };
}

/** Corpo do `POST /v1/debts`: `categoryId` só vai em `PAYABLE` (S-137). */
export function toCreateRequest(input: DebtInput): DebtCreateRequest {
  return {
    personId: input.personId,
    direction: input.direction,
    principal: input.principal,
    date: input.date,
    expectedDate: input.expectedDate,
    description: input.description.trim(),
    ...(input.direction === 'PAYABLE' && input.categoryId ? { categoryId: input.categoryId } : {}),
  };
}

export function toUpdateRequest(input: DebtUpdate): DebtUpdateRequest {
  return {
    description: input.description.trim(),
    expectedDate: input.expectedDate,
    version: input.version,
  };
}
