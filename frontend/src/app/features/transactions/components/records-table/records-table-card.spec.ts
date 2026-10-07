import { render, screen } from '@testing-library/angular';

import { EntriesTableComponent } from '~/app/features/transactions/components/entries-table/entries-table.component';
import { RecordsTableComponent } from '~/app/features/transactions/components/records-table/records-table.component';
import { brl } from '~/testing/accounts-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aTransaction, anEntry } from '~/testing/transactions-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

describe('Lista de movimentações com cartão (T70 CA1)', () => {
  it('Dado a compra 6x, então a visão Registros mostra UMA linha de 1.200,00 com o cartão no lugar da conta', async () => {
    await render(RecordsTableComponent, {
      inputs: {
        items: [
          aTransaction({
            id: 'tx-card',
            type: 'CARD_PURCHASE',
            description: 'Notebook',
            amount: brl('1200.00'),
            account: null,
            card: { id: 'card-1', name: 'Roxinho' },
            method: null,
            impact: {
              cash: brl('0.00'),
              consumption: [{ competence: '2026-10', amount: brl('200.00') }],
              netWorth: brl('-1200.00'),
              commitment: brl('1000.00'),
            },
          }),
        ],
      },
      providers: [provideI18nTesting('pt')],
    });

    expect(screen.getAllByTestId('transaction-row-tx-card')).toHaveLength(1);
    const row = screen.getByTestId('transaction-row-tx-card');
    expect(text(screen.getByTestId('transaction-amount-tx-card'))).toBe('R$ 1.200,00');
    expect(row).toHaveTextContent('Compra no cartão');
    expect(row).toHaveTextContent('Roxinho');
    // Sem efeito no caixa: nenhum sinal de entrada ou saída na linha.
    expect(text(screen.getByTestId('transaction-amount-tx-card'))).not.toMatch(/^[+−]/);
  });

  it('Dado o pagamento de fatura, então o rótulo é do tipo e o sinal vem do impact (saída do caixa)', async () => {
    await render(RecordsTableComponent, {
      inputs: {
        items: [
          aTransaction({
            id: 'tx-pay',
            type: 'INVOICE_PAYMENT',
            description: 'Pagamento da fatura',
            amount: brl('500.00'),
            category: null,
            method: null,
            card: { id: 'card-1', name: 'Roxinho' },
            impact: {
              cash: brl('-500.00'),
              consumption: [],
              netWorth: brl('0.00'),
              commitment: brl('0.00'),
            },
          }),
        ],
      },
      providers: [provideI18nTesting('pt')],
    });

    expect(screen.getByTestId('transaction-row-tx-pay')).toHaveTextContent('Pagamento de fatura');
    expect(text(screen.getByTestId('transaction-amount-tx-pay'))).toBe('−R$ 500,00');
  });

  it('Dado a visão Por competência, então "Notebook 1/6 R$ 200,00" aparece em outubro (parcela do backend)', async () => {
    await render(EntriesTableComponent, {
      inputs: {
        items: [
          anEntry({
            transactionId: 'tx-card',
            transactionType: 'CARD_PURCHASE',
            description: 'Notebook',
            competence: '2026-10',
            installment: { number: 1, total: 6 },
            via: 'CARD',
            method: null,
            cardId: 'card-1',
            accountId: null,
            amount: brl('200.00'),
          }),
        ],
      },
      providers: [provideI18nTesting('pt')],
    });

    const row = screen.getByTestId('entry-row-0');
    expect(row).toHaveTextContent('Notebook 1/6');
    expect(row).toHaveTextContent('outubro de 2026');
    expect(row).toHaveTextContent('R$ 200,00');
    expect(screen.getByTestId('entry-item-0')).toHaveTextContent('Notebook 1/6');
  });
});
