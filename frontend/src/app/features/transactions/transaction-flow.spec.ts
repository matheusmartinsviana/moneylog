import { flowOf, flowSign } from '~/app/features/transactions/transaction-flow';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import { brl } from '~/testing/accounts-testing';
import { aTransaction } from '~/testing/transactions-testing';

const cash = (amount: string): Partial<Transaction> => ({
  impact: { cash: brl(amount), consumption: [], netWorth: brl(amount), commitment: brl('0.00') },
});

describe('flowOf (sinal e cor derivados de impact.cash)', () => {
  it.each([
    ['EXPENSE', '-35.00', 'out'],
    ['INCOME', '100.00', 'in'],
    ['REFUND', '20.00', 'in'],
    ['ADJUSTMENT', '-5.00', 'out'],
    ['ADJUSTMENT', '5.00', 'in'],
  ] as const)('Dado %s com impact.cash %s, então o sentido é %s', (type, amount, expected) => {
    expect(flowOf(aTransaction({ type, ...cash(amount) }), null)).toBe(expected);
  });

  it('Dado um ajuste de rendimento em conta de investimento (impact.cash 0,00), então não há sinal', () => {
    const tx = aTransaction({ type: 'ADJUSTMENT', direction: 'INCREASE', ...cash('0.00') });
    expect(flowOf(tx, null)).toBe('neutral');
    expect(flowSign(flowOf(tx, null))).toBe('');
  });

  it('Dado uma movimentação estornada (impacto zerado), então não há sinal', () => {
    expect(flowOf(aTransaction({ status: 'VOIDED', ...cash('0.00') }), null)).toBe('neutral');
  });

  it('Dado um zero com casas (0.00) e um valor pequeno (0.01), então só o segundo tem sentido', () => {
    expect(flowOf(aTransaction(cash('0.00')), null)).toBe('neutral');
    expect(flowOf(aTransaction(cash('-0.01')), null)).toBe('out');
  });

  describe('Transferência (impact.cash 0,00)', () => {
    const transfer = aTransaction({
      type: 'TRANSFER',
      account: { id: 'a', name: 'A' },
      counterpartAccount: { id: 'b', name: 'B' },
      ...cash('0.00'),
    });
    it('Dado sem filtro de conta, então é neutra', () => {
      expect(flowOf(transfer, null)).toBe('neutral');
    });
    it('Dado o filtro na origem, então é saída; no destino, entrada; em outra, neutra', () => {
      expect(flowOf(transfer, 'a')).toBe('out');
      expect(flowOf(transfer, 'b')).toBe('in');
      expect(flowOf(transfer, 'c')).toBe('neutral');
    });
    it('Dado uma transferência estornada, então fica neutra mesmo com filtro', () => {
      expect(flowOf({ ...transfer, status: 'VOIDED' }, 'a')).toBe('neutral');
    });
  });

  describe('Aplicação e resgate (impact.cash do lado da conta de caixa)', () => {
    const base = {
      type: 'INVESTMENT',
      account: { id: 'cash', name: 'Corrente' },
      counterpartAccount: { id: 'inv', name: 'CDB' },
    } as const;
    it('Dado aplicação, então é saída no caixa e entrada na conta de investimento', () => {
      const tx = aTransaction({ ...base, direction: 'CONTRIBUTION', ...cash('-100.00') });
      expect(flowOf(tx, null)).toBe('out');
      expect(flowOf(tx, 'cash')).toBe('out');
      expect(flowOf(tx, 'inv')).toBe('in');
    });
    it('Dado resgate, então é entrada no caixa e saída na conta de investimento', () => {
      const tx = aTransaction({ ...base, direction: 'REDEMPTION', ...cash('100.00') });
      expect(flowOf(tx, null)).toBe('in');
      expect(flowOf(tx, 'inv')).toBe('out');
    });
  });
});

describe('flowSign', () => {
  it('Dado cada sentido, então devolve +, − (U+2212) ou nada', () => {
    expect(flowSign('in')).toBe('+');
    expect(flowSign('out')).toBe('−');
    expect(flowSign('neutral')).toBe('');
  });
});
