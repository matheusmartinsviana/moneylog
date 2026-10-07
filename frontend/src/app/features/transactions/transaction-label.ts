import type { Transaction } from '~/modules/transactions/core/types/transaction';

/** Subconjunto da movimentação que basta para montar o rótulo de exibição. */
export type LabelledTransaction = Pick<Transaction, 'description' | 'type'> &
  Partial<Pick<Transaction, 'category' | 'account' | 'card' | 'debt'>>;

/**
 * Descrição vazia (o campo é opcional) mostra um rótulo **só para exibir**: categoria, depois pessoa ou
 * conta/cartão, depois o tipo traduzido. Nunca é gravado nem reenviado ao backend.
 */
export function transactionLabel(
  tx: LabelledTransaction,
  typeNames: Readonly<Record<string, string>>,
): string {
  const own = (tx.description ?? '').trim();
  if (own !== '') return own;
  return (
    tx.category?.name ??
    tx.debt?.person.name ??
    tx.account?.name ??
    tx.card?.name ??
    typeNames[tx.type] ??
    ''
  );
}
