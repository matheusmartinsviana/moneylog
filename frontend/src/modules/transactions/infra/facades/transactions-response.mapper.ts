import type {
  EntrySlice,
  TransactionSlice,
} from '~/modules/transactions/core/interfaces/transactions.gateway';
import type { Entry } from '~/modules/transactions/core/types/entry';
import type { Transaction, TransactionTotals } from '~/modules/transactions/core/types/transaction';
import type {
  AdjustmentDirection,
  InvestmentDirection,
} from '~/modules/transactions/core/types/transaction-enums';
import type {
  NewDebtInput,
  TransactionInput,
} from '~/modules/transactions/core/types/transaction-input';
import type {
  EntryResponse,
  EntrySliceResponse,
  TransactionCreateRequest,
  TransactionResponse,
  TransactionSliceResponse,
  TransactionUpdateRequest,
} from '~/modules/transactions/infra/responses/transaction.response';
import { toDebtSummary } from '~/util/debt';
import type { Money } from '~/util/money';

/**
 * Resposta → tipos do core. Só copia campos: nenhum valor é somado, subtraído, arredondado nem
 * convertido para `number` (arquitetura §1).
 */
const money = (value: { amount: string; currency: string }): Money => ({
  amount: value.amount,
  currency: value.currency,
});

/**
 * Mapa **resposta → entrada** de S-90, o único lugar que o conhece. A resposta usa nomes genéricos
 * (`account`, `counterpartAccount`, `adjustmentKind`, `refundOf`); o formulário de edição precisa dos
 * nomes de entrada:
 *
 * | type | resposta | entrada |
 * |---|---|---|
 * | EXPENSE, INCOME | `account.id`, `category.id`, `method` | `accountId`, `categoryId`, `method` |
 * | TRANSFER | `account.id`, `counterpartAccount.id` | `fromAccountId`, `toAccountId` |
 * | INVESTMENT | `account.id`, `counterpartAccount.id`, `direction` | `cashAccountId`, `investmentAccountId`, `direction` |
 * | ADJUSTMENT | `account.id`, `direction`, `adjustmentKind`, `reason` | `accountId`, `direction`, `kind`, `reason` |
 * | REFUND | `account.id` ou `card.id`, `category.id`, `refundOf.id` | `accountId` ou `cardId`, `categoryId`, `refundOfTransactionId` |
 * | CARD_PURCHASE | `card.id`, `category.id`, `installments[].total`, `amount` (total) | `cardId`, `categoryId`, `installments`, `amount` |
 *
 * Devolve `null` se o tipo não é editável nesta etapa ou se falta uma referência obrigatória.
 */
export function toFormValue(response: TransactionResponse): TransactionInput | null {
  const base = {
    amount: response.amount.amount,
    date: response.date,
    description: response.description ?? '',
    notes: response.notes,
  };
  const accountId = response.account?.id ?? null;
  const cardId = response.card?.id ?? null;
  const categoryId = response.category?.id ?? null;
  const counterpartId = response.counterpartAccount?.id ?? null;

  switch (response.type) {
    case 'EXPENSE':
    case 'INCOME':
      if (!accountId) return null;
      return {
        ...base,
        type: response.type,
        accountId,
        categoryId: categoryId ?? '',
        method: response.method ?? 'OTHER',
        ...(response.type === 'INCOME'
          ? { incomeCompetence: response.incomeCompetence ?? null }
          : {}),
      };
    case 'TRANSFER':
      if (!accountId || !counterpartId) return null;
      return { ...base, type: 'TRANSFER', fromAccountId: accountId, toAccountId: counterpartId };
    case 'INVESTMENT':
      if (!accountId || !counterpartId) return null;
      if (response.direction !== 'CONTRIBUTION' && response.direction !== 'REDEMPTION') return null;
      return {
        ...base,
        type: 'INVESTMENT',
        cashAccountId: accountId,
        investmentAccountId: counterpartId,
        direction: response.direction as InvestmentDirection,
      };
    case 'ADJUSTMENT':
      if (!accountId) return null;
      if (response.direction !== 'INCREASE' && response.direction !== 'DECREASE') return null;
      return {
        ...base,
        type: 'ADJUSTMENT',
        accountId,
        direction: response.direction as AdjustmentDirection,
        kind: response.adjustmentKind ?? 'CORRECTION',
        reason: response.reason ?? '',
      };
    case 'REFUND':
      // Em conta ou no cartão: exatamente um dos dois.
      if ((accountId === null) === (cardId === null)) return null;
      return {
        ...base,
        type: 'REFUND',
        accountId,
        cardId,
        categoryId: categoryId ?? '',
        refundOfTransactionId: response.refundOf?.id ?? null,
      };
    case 'CARD_PURCHASE': {
      // `total` de cada parcela é o nº de parcelas da compra (as canceladas continuam na lista).
      const installments = response.installments[0]?.total ?? null;
      if (!cardId || installments === null) return null;
      return { ...base, type: 'CARD_PURCHASE', cardId, categoryId: categoryId ?? '', installments };
    }
    default:
      return null;
  }
}

export function toTransaction(response: TransactionResponse): Transaction {
  return {
    id: response.id,
    type: response.type,
    status: response.status,
    amount: money(response.amount),
    date: response.date,
    description: response.description ?? '',
    notes: response.notes,
    category: response.category ? { id: response.category.id, name: response.category.name } : null,
    card: response.card ? { id: response.card.id, name: response.card.name } : null,
    account: response.account ? { id: response.account.id, name: response.account.name } : null,
    counterpartAccount: response.counterpartAccount
      ? { id: response.counterpartAccount.id, name: response.counterpartAccount.name }
      : null,
    method: response.method,
    direction: response.direction,
    adjustmentKind: response.adjustmentKind,
    reason: response.reason,
    refundOf: response.refundOf
      ? { id: response.refundOf.id, description: response.refundOf.description }
      : null,
    installments: response.installments.map((installment) => ({
      number: installment.number,
      total: installment.total,
      amount: money(installment.amount),
      competence: installment.competence,
      invoiceId: installment.invoiceId,
      invoiceReferenceMonth: installment.invoiceReferenceMonth,
      invoiceDueDate: installment.invoiceDueDate,
      status: installment.status,
      lateEntry: installment.lateEntry,
    })),
    invoice: response.invoice
      ? {
          id: response.invoice.id,
          referenceMonth: response.invoice.referenceMonth,
          closingDate: response.invoice.closingDate,
          dueDate: response.invoice.dueDate,
          status: response.invoice.status,
        }
      : null,
    debt: response.debt ? toDebtSummary(response.debt) : null,
    shares: (response.shares ?? []).map(toDebtSummary),
    incomeCompetence: response.incomeCompetence ?? null,
    recurrenceId: response.recurrenceId ?? null,
    occurrenceDate: response.occurrenceDate ?? null,
    impact: {
      cash: money(response.impact.cash),
      consumption: response.impact.consumption.map((item) => ({
        competence: item.competence,
        amount: money(item.amount),
      })),
      netWorth: money(response.impact.netWorth),
      commitment: money(response.impact.commitment),
    },
    editable: response.editable,
    voidable: response.voidable,
    voidBlockedBy: response.voidBlockedBy,
    voidReason: response.voidReason,
    voidedAt: response.voidedAt,
    source: response.source,
    version: response.version,
    formValue: toFormValue(response),
  };
}

function toTotals(totals: TransactionSliceResponse['totals']): TransactionTotals {
  return {
    count: totals.count,
    cashFlow: {
      in: money(totals.cashFlow.in),
      out: money(totals.cashFlow.out),
      net: money(totals.cashFlow.net),
    },
  };
}

export function toTransactionSlice(response: TransactionSliceResponse): TransactionSlice {
  return {
    items: response.items.map(toTransaction),
    hasNext: response.hasNext,
    totals: toTotals(response.totals),
  };
}

function toEntry(response: EntryResponse): Entry {
  return {
    transactionId: response.transactionId,
    transactionType: response.transactionType,
    date: response.date,
    competence: response.competence,
    description: response.description,
    category: { id: response.category.id, name: response.category.name },
    installment: response.installment
      ? { number: response.installment.number, total: response.installment.total }
      : null,
    via: response.via,
    method: response.method,
    cardId: response.cardId,
    accountId: response.accountId,
    amount: money(response.amount),
  };
}

export function toEntrySlice(response: EntrySliceResponse): EntrySlice {
  return {
    items: response.items.map(toEntry),
    hasNext: response.hasNext,
    debtItems: (response.debtItems ?? []).map((item) => ({
      debtId: item.debtId,
      date: item.date,
      competence: item.competence,
      description: item.description,
      category: { id: item.category.id, name: item.category.name },
      amount: money(item.amount),
    })),
    totals: {
      total: money(response.totals.total),
      byCategory: response.totals.byCategory.map((item) => ({
        category: { id: item.category.id, name: item.category.name },
        amount: money(item.amount),
      })),
    },
  };
}

/** Corpo do `POST` (e base do `PUT`): campos do tipo, sem `notes` vazio. */
export function toRequestBody(input: TransactionInput): TransactionCreateRequest {
  const notes = input.notes !== null && input.notes.trim() !== '' ? input.notes : null;
  const description = input.description.trim();
  // Opcionais (contrato 2.11): vazio é omitido; o servidor aplica o padrão.
  const common = {
    amount: input.amount,
    date: input.date,
    ...(description !== '' ? { description: input.description } : {}),
    notes,
  };
  const category = (id: string) => (id !== '' ? { categoryId: id } : {});
  switch (input.type) {
    case 'EXPENSE':
    case 'INCOME':
      return {
        ...common,
        type: input.type,
        accountId: input.accountId,
        ...category(input.categoryId),
        ...(input.method ? { method: input.method } : {}),
        // Só a receita leva a competência; vazia é omitida (no PUT, ausente limpa no servidor).
        ...(input.type === 'INCOME' && input.incomeCompetence
          ? { incomeCompetence: input.incomeCompetence }
          : {}),
        ...(input.type === 'EXPENSE' && input.shares && input.shares.length > 0
          ? {
              shares: input.shares.map((share) => ({
                amount: share.amount,
                newDebt: toNewDebt(share.newDebt),
              })),
            }
          : {}),
      };
    case 'TRANSFER':
      return {
        ...common,
        type: 'TRANSFER',
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
      };
    case 'INVESTMENT':
      return {
        ...common,
        type: 'INVESTMENT',
        cashAccountId: input.cashAccountId,
        investmentAccountId: input.investmentAccountId,
        direction: input.direction,
      };
    case 'ADJUSTMENT':
      return {
        ...common,
        type: 'ADJUSTMENT',
        accountId: input.accountId,
        direction: input.direction,
        kind: input.kind,
        reason: input.reason,
      };
    case 'REFUND':
      return {
        ...common,
        type: 'REFUND',
        // Só o destino escolhido vai no corpo: conta **ou** cartão (nunca os dois).
        ...(input.cardId !== null ? { cardId: input.cardId } : { accountId: input.accountId }),
        ...category(input.categoryId),
        refundOfTransactionId: input.refundOfTransactionId,
      };
    case 'CARD_PURCHASE':
      return {
        ...common,
        type: 'CARD_PURCHASE',
        cardId: input.cardId,
        ...category(input.categoryId),
        ...(input.installments !== 1 ? { installments: input.installments } : {}),
      };
    case 'LOAN_GIVEN':
      return {
        ...common,
        type: 'LOAN_GIVEN',
        accountId: input.accountId,
        newDebt: toNewDebt(input.newDebt),
      };
    case 'MONEY_RECEIVED':
      // Devolução (`debtId`) **ou** captação (`newDebt`): nunca os dois.
      return {
        ...common,
        type: 'MONEY_RECEIVED',
        accountId: input.accountId,
        ...(input.debtId !== null
          ? { debtId: input.debtId }
          : input.newDebt !== null
            ? { newDebt: toNewDebt(input.newDebt) }
            : {}),
      } as TransactionCreateRequest;
    case 'DEBT_PAYMENT':
      return {
        ...common,
        type: 'DEBT_PAYMENT',
        accountId: input.accountId,
        debtId: input.debtId,
      };
  }
}

function toNewDebt(debt: NewDebtInput) {
  const description =
    debt.description !== null && debt.description.trim() !== '' ? debt.description.trim() : null;
  return { personId: debt.personId, expectedDate: debt.expectedDate, description };
}

/** Corpo do `PUT`: o corpo do `POST` do tipo + `version` (S-68). */
export function toUpdateBody(input: TransactionInput, version: number): TransactionUpdateRequest {
  return { ...toRequestBody(input), version } as TransactionUpdateRequest;
}
