import type { Transaction } from '~/modules/transactions/core/types/transaction';

/** Para onde o dinheiro vai, do ponto de vista de quem olha a lista. */
export type Flow = 'in' | 'out' | 'neutral';

/**
 * Sentido de uma movimentação **só para a apresentação** (sinal e cor do valor). Deriva de
 * `impact.cash`, que o backend calcula (efeito nas contas de caixa), então o front não repete a regra
 * por tipo: o ajuste de rendimento em conta de investimento (`impact.cash` zero) não ganha `+`, e a
 * movimentação estornada (tudo zero) fica sem sinal. Só olha o sinal do texto decimal; nenhum valor é
 * calculado nem alterado.
 *
 * Quando `impact.cash` é zero e há filtro de conta, a transferência ativa mostra o sentido na conta
 * filtrada (saída na origem, entrada no destino, S-63); sem filtro, é neutra. Na aplicação/resgate,
 * o `impact.cash` é do lado da conta de caixa; filtrando pela conta de investimento o sentido
 * inverte, porque o dinheiro entra (ou sai) dela.
 */
export function flowOf(transaction: Transaction, accountId: string | null): Flow {
  const cash = transaction.impact.cash.amount;
  if (/[1-9]/.test(cash)) {
    const flow: Flow = cash.startsWith('-') ? 'out' : 'in';
    const onInvestmentSide =
      transaction.type === 'INVESTMENT' &&
      accountId !== null &&
      transaction.counterpartAccount?.id === accountId;
    return onInvestmentSide ? (flow === 'in' ? 'out' : 'in') : flow;
  }
  if (transaction.type === 'TRANSFER' && transaction.status === 'ACTIVE' && accountId !== null) {
    if (transaction.account?.id === accountId) return 'out';
    if (transaction.counterpartAccount?.id === accountId) return 'in';
  }
  return 'neutral';
}

/** Prefixo visual do valor: `+` para entrada, `−` (U+2212) para saída, nada para neutro. */
export function flowSign(flow: Flow): string {
  return flow === 'in' ? '+' : flow === 'out' ? '−' : '';
}
