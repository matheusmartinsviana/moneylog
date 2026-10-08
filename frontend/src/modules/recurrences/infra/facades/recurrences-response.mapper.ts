import type {
  Occurrence,
  RealizedTransaction,
  Recurrence,
  RecurrenceInput,
  RecurrenceSummary,
  RecurrenceUpdate,
} from '~/modules/recurrences/core/types/recurrence';
import type {
  OccurrenceResponse,
  RealizedTransactionResponse,
  RecurrenceCreateRequest,
  RecurrenceResponse,
  RecurrenceSummaryResponse,
  RecurrenceUpdateRequest,
} from '~/modules/recurrences/infra/responses/recurrence.response';
import type { Money } from '~/util/money';

/** Resposta → tipos do core. Só copia campos: nenhum valor é somado nem convertido para `number`. */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

export function toRecurrence(response: RecurrenceResponse): Recurrence {
  return {
    id: response.id,
    type: response.type,
    amount: money(response.amount),
    description: response.description,
    category: { id: response.category.id, name: response.category.name },
    account: response.account ? { id: response.account.id, name: response.account.name } : null,
    card: response.card ? { id: response.card.id, name: response.card.name } : null,
    method:
      response.method === 'CASH' ||
      response.method === 'DEBIT' ||
      response.method === 'PIX' ||
      response.method === 'TRANSFER' ||
      response.method === 'BOLETO' ||
      response.method === 'OTHER'
        ? response.method
        : null,
    frequency: response.frequency,
    interval: response.interval,
    unit: response.unit,
    startDate: response.startDate,
    endDate: response.endDate,
    maxOccurrences: response.maxOccurrences,
    active: response.active,
    ended: response.ended ?? false,
    nextOccurrence: response.nextOccurrence,
    monthlyEstimate: money(response.monthlyEstimate),
    version: response.version,
  };
}

export function toSummary(response: RecurrenceSummaryResponse): RecurrenceSummary {
  return {
    fixedCosts: money(response.fixedCosts),
    recurringIncome: money(response.recurringIncome),
    estimate: true,
  };
}

export function toOccurrence(response: OccurrenceResponse): Occurrence {
  return {
    recurrenceId: response.recurrenceId,
    date: response.date,
    status: response.status,
    overdue: response.overdue,
    type: response.type,
    direction: response.direction,
    amount: money(response.amount),
    description: response.description,
    categoryId: response.categoryId,
    accountId: response.accountId,
    cardId: response.cardId,
    transactionId: response.transactionId,
  };
}

/** `Transaction` devolvida por `realize`: só o que a tela usa (a fatura alvo vem da 1ª parcela). */
export function toRealized(response: RealizedTransactionResponse): RealizedTransaction {
  const first = response.installments[0];
  return {
    id: response.id,
    description: response.description,
    amount: money(response.amount),
    date: response.date,
    card: response.card ? { id: response.card.id, name: response.card.name } : null,
    invoice: first
      ? {
          id: first.invoiceId,
          referenceMonth: first.invoiceReferenceMonth,
          dueDate: first.invoiceDueDate,
        }
      : null,
  };
}

/** Descrição opcional (contrato 2.11): vazia é omitida e o servidor guarda nulo. */
function optionalText(text: string): { description?: string } {
  const value = text.trim();
  return value !== '' ? { description: value } : {};
}

/**
 * Só o destino do tipo vai no corpo: conta + meio de pagamento **ou** cartão (nunca os dois), ou nenhum
 * ("conta a definir", 2.14.0: a conta e o meio são informados ao confirmar cada ocorrência).
 */
function destination(input: {
  readonly accountId: string | null;
  readonly method: RecurrenceInput['method'];
  readonly cardId: string | null;
}) {
  if (input.cardId !== null) return { cardId: input.cardId };
  if (input.accountId === null) return {};
  return { accountId: input.accountId, ...(input.method ? { method: input.method } : {}) };
}

export function toCreateRequest(input: RecurrenceInput): RecurrenceCreateRequest {
  const custom = input.frequency === 'CUSTOM';
  return {
    type: input.type,
    amount: input.amount,
    ...optionalText(input.description),
    ...(input.categoryId !== '' ? { categoryId: input.categoryId } : {}),
    ...destination(input),
    frequency: input.frequency,
    // `interval` e `unit` só existem em CUSTOM.
    ...(custom ? { interval: input.interval, unit: input.unit } : {}),
    startDate: input.startDate,
    endDate: input.endDate,
    maxOccurrences: input.maxOccurrences,
  };
}

export function toUpdateRequest(input: RecurrenceUpdate): RecurrenceUpdateRequest {
  return {
    amount: input.amount,
    ...optionalText(input.description),
    categoryId: input.categoryId,
    ...destination(input),
    endDate: input.endDate,
    version: input.version,
  };
}
