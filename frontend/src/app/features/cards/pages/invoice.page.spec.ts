import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { InvoicePage } from '~/app/features/cards/pages/invoice.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCard,
  anInvoice,
  anInvoiceItem,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

/** A fatura fechada do cenário: 1.283,00 com a parcela do notebook e uma compra à vista. */
const closedInvoice = (overrides = {}) =>
  anInvoice({
    id: 'inv-nov',
    status: 'CLOSED',
    total: brl('1283.00'),
    outstanding: brl('1283.00'),
    items: [
      anInvoiceItem({
        transactionId: 'tx-cafe',
        description: 'Supermercado',
        number: null,
        totalInstallments: null,
        amount: brl('1083.00'),
        date: '2026-10-20',
      }),
      anInvoiceItem({
        transactionId: 'tx-nb',
        description: 'Notebook',
        number: 1,
        totalInstallments: 6,
        amount: brl('200.00'),
        date: '2026-10-10',
      }),
    ],
    ...overrides,
  });

async function setup(invoice = closedInvoice(), url = '/cards/card-1/invoices/inv-nov') {
  const gateway = new CardsGatewayStub();
  gateway.cards = [aCard({ id: 'card-1', defaultPaymentAccountId: 'acc-1' })];
  gateway.invoice$ = of(invoice);
  return run(gateway, url);
}

async function run(gateway: CardsGatewayStub, url = '/cards/card-1/invoices/inv-nov') {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
  const result = await render(App, {
    initialRoute: url,
    providers: [
      provideRouter(
        [
          { path: 'cards/:id/invoices/:invoiceId', component: InvoicePage },
          { path: 'cards/:id', component: DummyComponent },
          { path: 'transactions/:id', component: DummyComponent },
        ],
        withComponentInputBinding(),
      ),
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideCardsStub(gateway),
      provideAccountsStub(accounts),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, router: TestBed.inject(Router) };
}

describe('InvoicePage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    // As notas ligadas moram em "Mais" (recolhido e montado só ao abrir).
    await userEvent.click(await screen.findByTestId('invoice-more-toggle'));
    expect(await screen.findByTestId('invoice-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('invoice-notes-new')).toBeInTheDocument();
  });

  it('Dado a fatura fechada de 1.283,00, então mostra total, pago, saldo transportado, em aberto e vencimento', async () => {
    await setup(
      closedInvoice({ carryIn: brl('5.00'), paid: brl('0.00'), outstanding: brl('1283.00') }),
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fatura de nov/2026');
    expect(text(screen.getByTestId('invoice-total'))).toBe('R$ 1.283,00');
    expect(text(screen.getByTestId('invoice-carry-in'))).toBe('R$ 5,00');
    expect(text(screen.getByTestId('invoice-paid'))).toBe('R$ 0,00');
    expect(text(screen.getByTestId('invoice-outstanding'))).toBe('R$ 1.283,00');
    expect(screen.getByTestId('invoice-due')).toHaveTextContent('5 de novembro de 2026');
    expect(screen.getByTestId('invoice-totals')).toHaveTextContent('Fechada');
  });

  it('Dado os valores que não fecham, então a tela mostra o que veio (não recalcula o em aberto)', async () => {
    await setup(
      closedInvoice({ total: brl('10.00'), paid: brl('3.00'), outstanding: brl('99.00') }),
    );

    expect(text(screen.getByTestId('invoice-outstanding'))).toBe('R$ 99,00');
  });

  it('Dado os itens, então "Notebook 1/6 — R$ 200,00" e a compra à vista aparecem ordenados por data e levam à movimentação', async () => {
    await setup();

    const items = screen.getByTestId('invoice-items');
    const rows = within(items).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Notebook 1/6');
    expect(rows[0]).toHaveTextContent('R$ 200,00');
    expect(rows[1]).toHaveTextContent('Supermercado');
    expect(rows[1]).toHaveTextContent('R$ 1.083,00');
    expect(screen.getByTestId('invoice-item-open-tx-nb')).toHaveAttribute(
      'href',
      '/transactions/tx-nb',
    );
  });

  it('Dado lateEntry, então o item traz o rótulo "lançamento tardio" e a explicação visível', async () => {
    await setup(
      closedInvoice({
        items: [anInvoiceItem({ transactionId: 'tx-nb', lateEntry: true })],
      }),
    );

    expect(screen.getByTestId('invoice-item-late')).toHaveTextContent(
      'Lançamento tardio. O banco já tinha cobrado este item nesta fatura.',
    );
  });

  it('Dado um crédito, então aparece com o rótulo "Crédito" e o sinal de menos', async () => {
    await setup(
      closedInvoice({
        items: [
          anInvoiceItem({
            kind: 'CREDIT',
            transactionId: 'tx-ref',
            description: 'Reembolso',
            number: null,
            totalInstallments: null,
            amount: brl('30.00'),
          }),
        ],
      }),
    );

    expect(screen.getByTestId('invoice-item-credit')).toHaveTextContent('Crédito');
    expect(text(screen.getByTestId('invoice-items'))).toContain('−');
  });

  it('Dado pagamento parcial feito, então payments lista data, conta e valor com link para o pagamento', async () => {
    await setup(
      closedInvoice({
        paid: brl('500.00'),
        outstanding: brl('783.00'),
        payments: [
          { transactionId: 'pay-1', accountId: 'acc-1', amount: brl('500.00'), date: '2026-10-26' },
        ],
      }),
    );

    const payment = screen.getByTestId('invoice-payment-pay-1');
    expect(payment).toHaveTextContent('26 de out.');
    expect(screen.getByTestId('invoice-payment-account-pay-1')).toHaveTextContent('Nubank');
    expect(payment).toHaveTextContent('R$ 500,00');
    expect(screen.getByTestId('invoice-payment-open-pay-1')).toHaveAttribute(
      'href',
      '/transactions/pay-1',
    );
  });

  it('Dado OVERDUE, então mostra o aviso de risco sem juros calculados', async () => {
    await setup(closedInvoice({ status: 'OVERDUE' }));

    expect(screen.getByTestId('invoice-overdue')).toHaveTextContent(
      'O app não calcula juros, multa nem encargos.',
    );
    expect(screen.getByTestId('invoice-totals')).toHaveTextContent('Atrasada');
  });

  it('Dado creditCarry maior que zero, então mostra "Crédito para a próxima fatura R$ 17,00"', async () => {
    await setup(
      closedInvoice({ status: 'PAID', creditCarry: brl('17.00'), outstanding: brl('0.00') }),
    );

    expect(text(screen.getByTestId('invoice-credit-carry'))).toBe('R$ 17,00');
    expect(screen.getByTestId('invoice-totals')).toHaveTextContent(
      pt.cards.invoice.summary.creditCarry,
    );
  });

  it('Dado creditCarry zero, então a linha não aparece', async () => {
    await setup();

    expect(screen.queryByTestId('invoice-credit-carry')).not.toBeInTheDocument();
  });

  it.each([
    ['PAID', pt.cards.invoice.payBlocked.PAID],
    ['FUTURE', pt.cards.invoice.payBlocked.FUTURE],
  ] as const)(
    'Dado %s, então "Pagar" fica desabilitado com a razão e não abre a folha',
    async (status, reason) => {
      await setup(closedInvoice({ status }));

      const pay = screen.getByTestId('invoice-pay');
      expect(pay).toHaveAttribute('aria-disabled', 'true');
      expect(pay).toHaveAccessibleDescription(reason);
      await userEvent.click(pay);
      expect(screen.queryByTestId('pay-sheet-panel')).not.toBeInTheDocument();
    },
  );

  it.each(['CLOSED', 'OVERDUE', 'OPEN'] as const)(
    'Dado %s, então "Pagar" fica habilitado',
    async (status) => {
      await setup(closedInvoice({ status }));

      expect(screen.getByTestId('invoice-pay')).not.toHaveAttribute('aria-disabled');
      expect(screen.queryByTestId('invoice-pay-blocked')).not.toBeInTheDocument();
    },
  );

  it('Dado fatura sem item, então estado vazio "Nenhum lançamento nesta fatura"', async () => {
    await setup(closedInvoice({ items: [], total: brl('0.00'), outstanding: brl('0.00') }));

    expect(screen.getByTestId('invoice-items-empty')).toHaveTextContent(
      pt.cards.invoice.itemsEmpty,
    );
    expect(screen.getByTestId('invoice-payments-empty')).toBeInTheDocument();
  });

  it('Dado pagar a fatura, então a resposta substitui a fatura na tela', async () => {
    const { gateway, fixture } = await setup();
    gateway.pay$ = of(
      closedInvoice({
        status: 'PAID',
        paid: brl('1283.00'),
        outstanding: brl('0.00'),
        payments: [
          {
            transactionId: 'pay-1',
            accountId: 'acc-1',
            amount: brl('1283.00'),
            date: '2026-10-26',
          },
        ],
      }),
    );

    await userEvent.click(screen.getByTestId('invoice-pay'));
    expect((screen.getByTestId('pay-amount') as HTMLInputElement).value).toBe('1.283,00');
    await userEvent.click(screen.getByTestId('pay-submit'));
    await fixture.whenStable();

    expect(text(screen.getByTestId('invoice-outstanding'))).toBe('R$ 0,00');
    expect(screen.getByTestId('invoice-totals')).toHaveTextContent('Paga');
    expect(screen.getByTestId('invoice-payment-pay-1')).toBeInTheDocument();
    expect(screen.queryByTestId('pay-sheet-panel')).not.toBeInTheDocument();
  });

  it('Dado fatura de outro usuário ou fora da janela (404), então "não encontrada" com voltar ao cartão', async () => {
    const gateway = new CardsGatewayStub();
    gateway.invoice$ = failWith(404, 'INVOICE_NOT_FOUND');
    await run(gateway);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.cards.invoice.notFound.title,
    );
    expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/cards/card-1');
  });

  it('Dado erro de rede, então "tentar de novo" recarrega a fatura', async () => {
    const gateway = new CardsGatewayStub();
    gateway.invoice$ = failWith(0, 'NETWORK');
    await run(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.invoice$ = of(closedInvoice());
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('invoice-totals')).toBeInTheDocument();
  });

  it('Dado a carga, então mostra o esqueleto', async () => {
    const gateway = new CardsGatewayStub();
    gateway.invoice$ = NEVER;
    await run(gateway);

    expect(screen.getByTestId('invoice-loading')).toHaveTextContent(pt.cards.invoice.loading);
  });

  it('Dado a tela, então o axe não aponta violações', async () => {
    const { container } = await setup(
      closedInvoice({
        status: 'OVERDUE',
        payments: [
          { transactionId: 'pay-1', accountId: 'acc-1', amount: brl('1.00'), date: '2026-10-26' },
        ],
        items: [anInvoiceItem({ lateEntry: true })],
      }),
    );

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
