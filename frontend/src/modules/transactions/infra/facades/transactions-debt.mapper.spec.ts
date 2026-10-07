import {
  toEntrySlice,
  toRequestBody,
  toTransaction,
} from '~/modules/transactions/infra/facades/transactions-response.mapper';
import { aDebtSummaryResponse, brl } from '~/testing/etapa4-response-testing';
import { aResponse } from '~/testing/transactions-response-testing';

const COMMON = { amount: '300.00', date: '2026-10-05', description: 'Empréstimo', notes: null };

describe('mapper de movimentações de dívida (Etapa 4)', () => {
  describe('corpos de criação', () => {
    it('Dado emprestar, então o corpo leva a conta e a newDebt (pessoa e previsão), sem despesa', () => {
      const body = toRequestBody({
        ...COMMON,
        type: 'LOAN_GIVEN',
        accountId: 'acc-1',
        newDebt: { personId: 'person-1', expectedDate: '2026-10-20', description: '  ' },
      });

      expect(body).toEqual({
        ...COMMON,
        type: 'LOAN_GIVEN',
        accountId: 'acc-1',
        newDebt: { personId: 'person-1', expectedDate: '2026-10-20', description: null },
      });
    });

    it('Dado receber a devolução, então leva debtId e não leva newDebt', () => {
      const body = toRequestBody({
        ...COMMON,
        type: 'MONEY_RECEIVED',
        accountId: 'acc-1',
        debtId: 'debt-1',
        newDebt: null,
      });

      expect(body).toMatchObject({ type: 'MONEY_RECEIVED', debtId: 'debt-1' });
      expect(body).not.toHaveProperty('newDebt');
    });

    it('Dado receber uma captação, então leva newDebt e não leva debtId', () => {
      const body = toRequestBody({
        ...COMMON,
        type: 'MONEY_RECEIVED',
        accountId: 'acc-1',
        debtId: null,
        newDebt: { personId: 'person-2', expectedDate: null, description: 'Adiantamento' },
      });

      expect(body).toMatchObject({
        type: 'MONEY_RECEIVED',
        newDebt: { personId: 'person-2', expectedDate: null, description: 'Adiantamento' },
      });
      expect(body).not.toHaveProperty('debtId');
    });

    it('Dado pagar uma dívida, então leva conta e debtId', () => {
      expect(
        toRequestBody({
          ...COMMON,
          type: 'DEBT_PAYMENT',
          accountId: 'acc-1',
          debtId: 'debt-9',
        }),
      ).toEqual({ ...COMMON, type: 'DEBT_PAYMENT', accountId: 'acc-1', debtId: 'debt-9' });
    });

    it('Dado despesa dividida, então o corpo leva shares com o valor digitado de cada parte (nada calculado)', () => {
      const body = toRequestBody({
        type: 'EXPENSE',
        amount: '200.00',
        date: '2026-10-05',
        description: 'Jantar',
        notes: null,
        accountId: 'acc-1',
        categoryId: 'cat-1',
        method: 'PIX',
        shares: [
          {
            amount: '100.00',
            newDebt: { personId: 'person-1', expectedDate: null, description: null },
          },
        ],
      });

      expect(body).toMatchObject({
        type: 'EXPENSE',
        amount: '200.00',
        shares: [
          {
            amount: '100.00',
            newDebt: { personId: 'person-1', expectedDate: null, description: null },
          },
        ],
      });
    });

    it('Dado despesa sem divisão, então o corpo não tem shares', () => {
      const body = toRequestBody({
        type: 'EXPENSE',
        amount: '35.00',
        date: '2026-10-05',
        description: 'Almoço',
        notes: null,
        accountId: 'acc-1',
        categoryId: 'cat-1',
        method: 'PIX',
        shares: [],
      });

      expect(body).not.toHaveProperty('shares');
    });
  });

  describe('resposta', () => {
    it('Dado LOAN_GIVEN, então mapeia a dívida e o impacto do backend (caixa −300,00, patrimônio 0,00)', () => {
      const tx = toTransaction(
        aResponse({
          type: 'LOAN_GIVEN',
          amount: brl('300.00'),
          category: null,
          method: null,
          debt: aDebtSummaryResponse(),
          impact: {
            cash: brl('-300.00'),
            consumption: [],
            netWorth: brl('0.00'),
            commitment: brl('0.00'),
          },
        }),
      );

      expect(tx.debt).toMatchObject({ id: 'debt-1', person: { name: 'João' } });
      expect(tx.debt?.outstanding.amount).toBe('300.00');
      expect(tx.impact.cash.amount).toBe('-300.00');
      expect(tx.impact.consumption).toEqual([]);
      expect(tx.formValue).toBeNull();
      expect(tx.shares).toEqual([]);
    });

    it('Dado EXPENSE dividida, então mapeia as partes e o consumo só da parte do usuário, como vieram', () => {
      const tx = toTransaction(
        aResponse({
          amount: brl('200.00'),
          shares: [aDebtSummaryResponse({ principal: brl('100.00'), outstanding: brl('100.00') })],
          impact: {
            cash: brl('-200.00'),
            consumption: [{ competence: '2026-10', amount: brl('100.00') }],
            netWorth: brl('-100.00'),
            commitment: brl('0.00'),
          },
        }),
      );

      expect(tx.shares).toHaveLength(1);
      expect(tx.shares[0]?.principal.amount).toBe('100.00');
      expect(tx.impact.consumption[0]?.amount.amount).toBe('100.00');
    });

    it('Dado origem em recorrência, então mapeia recurrenceId e occurrenceDate', () => {
      const tx = toTransaction(
        aResponse({ source: 'RECURRENCE', recurrenceId: 'rec-1', occurrenceDate: '2026-10-10' }),
      );

      expect(tx).toMatchObject({
        source: 'RECURRENCE',
        recurrenceId: 'rec-1',
        occurrenceDate: '2026-10-10',
      });
    });

    it('Dado resposta sem os campos opcionais (aditivos), então debt é null e shares é vazio', () => {
      const tx = toTransaction(aResponse());

      expect(tx.debt).toBeNull();
      expect(tx.shares).toEqual([]);
      expect(tx.recurrenceId).toBeNull();
    });

    it('Dado a lista por competência, então debtItems vem completo e os totais são os do backend', () => {
      const slice = toEntrySlice({
        items: [],
        hasNext: false,
        totals: { total: brl('80.00'), byCategory: [] },
        debtItems: [
          {
            debtId: 'debt-2',
            date: '2026-10-05',
            competence: '2026-10',
            description: 'Jantar pago por Maria',
            category: { id: 'cat-1', name: 'Alimentação' },
            amount: brl('80.00'),
          },
        ],
      });

      expect(slice.debtItems).toEqual([
        {
          debtId: 'debt-2',
          date: '2026-10-05',
          competence: '2026-10',
          description: 'Jantar pago por Maria',
          category: { id: 'cat-1', name: 'Alimentação' },
          amount: { amount: '80.00', currency: 'BRL' },
        },
      ]);
      expect(slice.totals.total.amount).toBe('80.00');
    });

    it('Dado a lista sem debtItems (campo opcional), então vem vazia', () => {
      const slice = toEntrySlice({
        items: [],
        hasNext: false,
        totals: { total: brl('0.00'), byCategory: [] },
      });

      expect(slice.debtItems).toEqual([]);
    });
  });
});
