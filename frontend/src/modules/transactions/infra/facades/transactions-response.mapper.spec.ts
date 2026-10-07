import {
  toEntrySlice,
  toFormValue,
  toRequestBody,
  toTransaction,
  toTransactionSlice,
  toUpdateBody,
} from '~/modules/transactions/infra/facades/transactions-response.mapper';
import { aResponse, brl, ref } from '~/testing/transactions-response-testing';

const common = { amount: '35.00', date: '2026-10-04', description: 'Almoço', notes: 'sem glúten' };

describe('toFormValue (mapa resposta → entrada de S-90)', () => {
  it.each([
    [
      'EXPENSE',
      aResponse(),
      { ...common, type: 'EXPENSE', accountId: 'acc-1', categoryId: 'cat-1', method: 'PIX' },
    ],
    [
      'INCOME',
      aResponse({ type: 'INCOME', method: 'TRANSFER', category: ref('cat-2') }),
      { ...common, type: 'INCOME', accountId: 'acc-1', categoryId: 'cat-2', method: 'TRANSFER' },
    ],
    [
      'TRANSFER: account → fromAccountId, counterpartAccount → toAccountId',
      aResponse({
        type: 'TRANSFER',
        category: null,
        method: null,
        counterpartAccount: ref('acc-2'),
      }),
      { ...common, type: 'TRANSFER', fromAccountId: 'acc-1', toAccountId: 'acc-2' },
    ],
    [
      'INVESTMENT: account → cashAccountId, counterpartAccount → investmentAccountId',
      aResponse({
        type: 'INVESTMENT',
        category: null,
        method: null,
        counterpartAccount: ref('inv-1'),
        direction: 'CONTRIBUTION',
      }),
      {
        ...common,
        type: 'INVESTMENT',
        cashAccountId: 'acc-1',
        investmentAccountId: 'inv-1',
        direction: 'CONTRIBUTION',
      },
    ],
    [
      'ADJUSTMENT: adjustmentKind → kind',
      aResponse({
        type: 'ADJUSTMENT',
        category: null,
        method: null,
        direction: 'DECREASE',
        adjustmentKind: 'YIELD',
        reason: 'rendimento do mês',
      }),
      {
        ...common,
        type: 'ADJUSTMENT',
        accountId: 'acc-1',
        direction: 'DECREASE',
        kind: 'YIELD',
        reason: 'rendimento do mês',
      },
    ],
    [
      'REFUND: refundOf.id → refundOfTransactionId',
      aResponse({
        type: 'REFUND',
        method: null,
        refundOf: { id: 'tx-0', description: 'Compra original' },
      }),
      {
        ...common,
        type: 'REFUND',
        accountId: 'acc-1',
        cardId: null,
        categoryId: 'cat-1',
        refundOfTransactionId: 'tx-0',
      },
    ],
    [
      'REFUND sem despesa original',
      aResponse({ type: 'REFUND', method: null }),
      {
        ...common,
        type: 'REFUND',
        accountId: 'acc-1',
        cardId: null,
        categoryId: 'cat-1',
        refundOfTransactionId: null,
      },
    ],
    [
      'ADJUSTMENT sem kind devolvido',
      aResponse({
        type: 'ADJUSTMENT',
        category: null,
        method: null,
        direction: 'INCREASE',
        reason: 'x',
      }),
      {
        ...common,
        type: 'ADJUSTMENT',
        accountId: 'acc-1',
        direction: 'INCREASE',
        kind: 'CORRECTION',
        reason: 'x',
      },
    ],
  ])('Dado %s, então monta o valor inicial do formulário', (_, response, expected) => {
    expect(toFormValue(response)).toEqual(expected);
  });

  it.each([
    ['tipo de outra etapa', aResponse({ type: 'CARD_PURCHASE' })],
    ['despesa sem conta', aResponse({ account: null })],
    ['transferência sem destino', aResponse({ type: 'TRANSFER' })],
    [
      'aplicação com direção de ajuste',
      aResponse({ type: 'INVESTMENT', counterpartAccount: ref('i'), direction: 'INCREASE' }),
    ],
    [
      'ajuste com direção de aplicação',
      aResponse({ type: 'ADJUSTMENT', direction: 'CONTRIBUTION' }),
    ],
  ])('Dado %s, então não há valor de edição (null)', (_, response) => {
    expect(toFormValue(response)).toBeNull();
  });
});

describe('toFormValue com opcionais omitidos (contrato 2.11)', () => {
  it('Dado despesa sem categoria e sem método, então o valor de edição segue com categoria vazia e método OTHER', () => {
    expect(toFormValue(aResponse({ category: null, method: null }))).toMatchObject({
      type: 'EXPENSE',
      categoryId: '',
      method: 'OTHER',
    });
  });
});

describe('toRequestBody com opcionais vazios (contrato 2.11)', () => {
  it('Dado despesa sem descrição, categoria e método, então os três ficam fora do corpo', () => {
    const body = toRequestBody({
      type: 'EXPENSE',
      amount: '10.00',
      date: '2026-10-05',
      description: '  ',
      notes: null,
      accountId: 'acc-1',
      categoryId: '',
    });
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('categoryId');
    expect(body).not.toHaveProperty('method');
  });

  it('Dado compra no cartão à vista sem categoria, então installments e categoryId ficam fora do corpo', () => {
    const body = toRequestBody({
      type: 'CARD_PURCHASE',
      amount: '10.00',
      date: '2026-10-05',
      description: 'Livro',
      notes: null,
      cardId: 'card-1',
      categoryId: '',
      installments: 1,
    });
    expect(body).toMatchObject({ description: 'Livro' });
    expect(body).not.toHaveProperty('installments');
    expect(body).not.toHaveProperty('categoryId');
  });
});

describe('toTransaction', () => {
  it('Dado a resposta, então copia todos os campos, inclusive voidReason, voidedAt e voidBlockedBy', () => {
    const response = aResponse({
      status: 'VOIDED',
      voidReason: 'duplicada',
      voidedAt: '2026-10-05T10:00:00Z',
      voidable: false,
      voidBlockedBy: 'HAS_ACTIVE_REFUNDS',
      editable: false,
    });

    const transaction = toTransaction(response);

    expect(transaction).toMatchObject({
      id: 'tx-1',
      status: 'VOIDED',
      amount: { amount: '35.00', currency: 'BRL' },
      voidReason: 'duplicada',
      voidedAt: '2026-10-05T10:00:00Z',
      voidBlockedBy: 'HAS_ACTIVE_REFUNDS',
      editable: false,
      version: 4,
      impact: {
        cash: { amount: '-35.00', currency: 'BRL' },
        consumption: [{ competence: '2026-10', amount: { amount: '35.00', currency: 'BRL' } }],
      },
    });
    expect(transaction.formValue).not.toBeNull();
  });
});

describe('slices', () => {
  it('Dado a página de movimentações, então os totais passam exatamente como vieram', () => {
    const totals = {
      count: 3,
      cashFlow: { in: brl('10.00'), out: brl('99.99'), net: brl('-89.99') },
    };

    const slice = toTransactionSlice({ items: [aResponse()], hasNext: true, totals });

    expect(slice.hasNext).toBe(true);
    expect(slice.items).toHaveLength(1);
    expect(slice.totals).toEqual(totals);
  });

  it('Dado a página de lançamentos, então copia itens e totais por categoria', () => {
    const slice = toEntrySlice({
      items: [
        {
          transactionId: 't',
          transactionType: 'REFUND',
          date: '2026-10-02',
          competence: '2026-10',
          description: 'Estorno',
          category: ref('c', 'Lazer'),
          installment: null,
          via: 'ACCOUNT',
          method: null,
          cardId: null,
          accountId: 'acc-1',
          amount: brl('-12.00'),
        },
      ],
      hasNext: false,
      totals: {
        total: brl('-12.00'),
        byCategory: [{ category: ref('c', 'Lazer'), amount: brl('-12.00') }],
      },
    });

    expect(slice.items[0]).toMatchObject({
      transactionType: 'REFUND',
      amount: { amount: '-12.00' },
    });
    expect(slice.totals.byCategory[0]).toEqual({
      category: { id: 'c', name: 'Lazer' },
      amount: { amount: '-12.00', currency: 'BRL' },
    });
  });
});

describe('corpos de requisição', () => {
  it('Dado uma despesa, então o POST leva os campos do tipo e notes null quando vazio', () => {
    const body = toRequestBody({
      type: 'EXPENSE',
      amount: '35.00',
      date: '2026-10-04',
      description: 'Almoço',
      notes: '  ',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      method: 'PIX',
    });

    expect(body).toEqual({
      type: 'EXPENSE',
      amount: '35.00',
      date: '2026-10-04',
      description: 'Almoço',
      notes: null,
      accountId: 'acc-1',
      categoryId: 'cat-1',
      method: 'PIX',
    });
  });

  it('Dado cada tipo, então o corpo tem exatamente os campos do contrato', () => {
    const base = { amount: '1.00', date: '2026-10-04', description: 'x', notes: null };
    expect(
      Object.keys(
        toRequestBody({ ...base, type: 'TRANSFER', fromAccountId: 'a', toAccountId: 'b' }),
      ).sort(),
    ).toEqual(['amount', 'date', 'description', 'fromAccountId', 'notes', 'toAccountId', 'type']);
    expect(
      Object.keys(
        toRequestBody({
          ...base,
          type: 'INVESTMENT',
          cashAccountId: 'a',
          investmentAccountId: 'b',
          direction: 'REDEMPTION',
        }),
      ).sort(),
    ).toEqual([
      'amount',
      'cashAccountId',
      'date',
      'description',
      'direction',
      'investmentAccountId',
      'notes',
      'type',
    ]);
    expect(
      Object.keys(
        toRequestBody({
          ...base,
          type: 'ADJUSTMENT',
          accountId: 'a',
          direction: 'INCREASE',
          kind: 'CORRECTION',
          reason: 'r',
        }),
      ).sort(),
    ).toEqual([
      'accountId',
      'amount',
      'date',
      'description',
      'direction',
      'kind',
      'notes',
      'reason',
      'type',
    ]);
    expect(
      Object.keys(
        toRequestBody({
          ...base,
          type: 'REFUND',
          accountId: 'a',
          cardId: null,
          categoryId: 'c',
          refundOfTransactionId: null,
        }),
      ).sort(),
    ).toEqual([
      'accountId',
      'amount',
      'categoryId',
      'date',
      'description',
      'notes',
      'refundOfTransactionId',
      'type',
    ]);
    expect(
      Object.keys(
        toRequestBody({ ...base, type: 'INCOME', accountId: 'a', categoryId: 'c', method: 'PIX' }),
      ).sort(),
    ).toEqual([
      'accountId',
      'amount',
      'categoryId',
      'date',
      'description',
      'method',
      'notes',
      'type',
    ]);
  });

  it('Dado a edição, então o PUT leva o corpo do tipo + version', () => {
    const body = toUpdateBody(
      {
        type: 'TRANSFER',
        amount: '5.00',
        date: '2026-10-04',
        description: 't',
        notes: null,
        fromAccountId: 'a',
        toAccountId: 'b',
      },
      9,
    );

    expect(body).toMatchObject({
      type: 'TRANSFER',
      version: 9,
      fromAccountId: 'a',
      toAccountId: 'b',
    });
  });
});
