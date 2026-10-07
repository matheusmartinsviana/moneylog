import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { TransactionDetailPage } from '~/app/features/transactions/pages/transaction-detail.page';
import { TransactionsPage } from '~/app/features/transactions/pages/transactions.page';
import type { Installment, Transaction } from '~/modules/transactions/core/types/transaction';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { CategoriesGatewayStub, provideCategoriesStub } from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

const installment = (number: number, overrides: Partial<Installment> = {}): Installment => ({
  number,
  total: 6,
  amount: brl('200.00'),
  competence: '2026-10',
  invoiceId: `inv-${number}`,
  invoiceReferenceMonth: '2026-11',
  invoiceDueDate: '2026-11-05',
  status: 'PENDING',
  lateEntry: false,
  ...overrides,
});

const purchase = (overrides: Partial<Transaction> = {}) =>
  aTransaction({
    id: 'tx-card',
    type: 'CARD_PURCHASE',
    description: 'Notebook',
    amount: brl('1200.00'),
    account: null,
    method: null,
    card: { id: 'card-1', name: 'Roxinho' },
    installments: [
      installment(1, { status: 'PAID' }),
      installment(2, { status: 'OVERDUE', lateEntry: true }),
      installment(3, { status: 'CANCELED' }),
    ],
    impact: {
      cash: brl('0.00'),
      consumption: [{ competence: '2026-10', amount: brl('200.00') }],
      netWorth: brl('-1200.00'),
      commitment: brl('1000.00'),
    },
    ...overrides,
  });

async function setup(tx: Transaction, gateway = new TransactionsGatewayStub()) {
  gateway.get$ = of(tx);
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount()];
  const result = await render(App, {
    initialRoute: `/transactions/${tx.id}`,
    providers: [
      provideRouter(
        [
          { path: 'cards/:id/invoices/:invoiceId', component: DummyComponent },
          {
            path: 'transactions',
            component: TransactionsPage,
            children: [{ path: ':id', component: TransactionDetailPage }],
          },
        ],
        withComponentInputBinding(),
      ),
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideTransactionsStub(gateway),
      provideAccountsStub(accounts),
      provideCategoriesStub(new CategoriesGatewayStub()),
    ],
  });
  await result.fixture.whenStable();
  return {
    gateway,
    ...result,
    router: TestBed.inject(Router),
    toast: TestBed.inject(ToastService),
  };
}

describe('TransactionDetailPage: movimentações de cartão (T70)', () => {
  it('Dado a compra 6x, então lista as parcelas com situação em texto, fatura (com link) e valores do backend', async () => {
    await setup(purchase());

    expect(text(screen.getByTestId('detail-field-card'))).toContain('Roxinho');
    const list = screen.getByTestId('installments');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const first = screen.getByTestId('installment-1');
    expect(first).toHaveTextContent('1/6');
    expect(first).toHaveTextContent('Paga');
    expect(first).toHaveTextContent('Fatura de nov/2026, vence 5 de nov.');
    expect(first).toHaveTextContent('R$ 200,00');
    expect(screen.getByTestId('installment-invoice-1')).toHaveAttribute(
      'href',
      '/cards/card-1/invoices/inv-1',
    );
    expect(screen.getByTestId('installment-2')).toHaveTextContent('Atrasada');
    expect(screen.getByTestId('installment-3')).toHaveTextContent('Cancelada');
  });

  it('Dado lateEntry, então a parcela traz "lançamento tardio" com a explicação', async () => {
    await setup(purchase());

    expect(screen.getByTestId('installment-late-2')).toHaveTextContent(
      'Lançamento tardio. O banco já tinha cobrado esta parcela nesta fatura.',
    );
    expect(screen.queryByTestId('installment-late-1')).not.toBeInTheDocument();
  });

  it('Dado o impacto da compra, então usa o impact do backend: consumo da competência e o compromisso, sem soma', async () => {
    await setup(purchase());

    expect(text(screen.getByTestId('impact-consumption-2026-10'))).toBe(
      'No consumo de out/2026R$ 200,00',
    );
    expect(text(screen.getByTestId('impact-commitment'))).toBe('Em faturas futurasR$ 1.000,00');
    expect(text(screen.getByTestId('impact-cash'))).toBe('No caixaR$ 0,00');
  });

  it('Dado a edição, então a compra no cartão é editável (descrição, categoria e observação)', async () => {
    await setup(purchase({ editable: true }));

    expect(screen.getByTestId('detail-edit')).toHaveAttribute('href', '/transactions/tx-card/edit');
  });

  describe('estorno bloqueado por fatura fechada', () => {
    const blocked = (overrides: Partial<Transaction> = {}) =>
      purchase({ voidable: false, voidBlockedBy: 'TRANSACTION_IN_CLOSED_INVOICE', ...overrides });

    it('Dado TRANSACTION_IN_CLOSED_INVOICE, então o estorno fica desabilitado com a explicação e aparece "Cancelar parcelas restantes"', async () => {
      await setup(blocked());

      const void_ = screen.getByTestId('void-open');
      expect(void_).toHaveAttribute('aria-disabled', 'true');
      expect(void_).toHaveAccessibleDescription(
        pt.transactions.detail.void.blocked.TRANSACTION_IN_CLOSED_INVOICE,
      );
      expect(screen.getByTestId('cancel-installments-open')).toBeEnabled();
    });

    it('Dado a compra estornável (nenhuma fatura fechada), então só o estorno aparece', async () => {
      await setup(purchase({ voidable: true, voidBlockedBy: null }));

      expect(screen.queryByTestId('cancel-installments-open')).not.toBeInTheDocument();
      expect(screen.getByTestId('void-open')).not.toHaveAttribute('aria-disabled');
    });

    it('Dado cancelar, então a confirmação exige motivo, envia o motivo e usa a resposta (parcelas canceladas)', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.cancel$ = of(
        blocked({
          installments: [
            installment(1, { status: 'PAID' }),
            installment(2, { status: 'CANCELED' }),
            installment(3, { status: 'CANCELED' }),
          ],
          impact: {
            cash: brl('0.00'),
            consumption: [{ competence: '2026-10', amount: brl('200.00') }],
            netWorth: brl('-200.00'),
            commitment: brl('0.00'),
          },
        }),
      );
      const { toast, fixture } = await setup(blocked(), gateway);

      await userEvent.click(screen.getByTestId('cancel-installments-open'));
      expect(screen.getByTestId('confirm-dialog')).toHaveTextContent(
        pt.transactions.detail.cancel.title,
      );
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
      await userEvent.type(screen.getByTestId('confirm-dialog-reason'), ' devolvi o produto ');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      await fixture.whenStable();

      expect(gateway.cancels).toEqual([{ id: 'tx-card', reason: 'devolvi o produto' }]);
      expect(screen.getByTestId('installment-2')).toHaveTextContent('Cancelada');
      expect(screen.getByTestId('installment-3')).toHaveTextContent('Cancelada');
      expect(screen.queryByTestId('impact-commitment')).not.toBeInTheDocument();
      expect(toast.toasts()[0]?.message).toBe(pt.transactions.detail.cancel.toast);
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });

    it.each([
      ['CARD_NO_INSTALLMENTS_TO_CANCEL', 'Não há parcelas restantes para cancelar.'],
      ['TRANSACTION_NOT_CANCELABLE', 'Só uma compra no cartão ativa tem parcelas para cancelar.'],
    ])(
      'Dado 422 %s, então mostra a mensagem traduzida e a compra continua',
      async (code, message) => {
        const gateway = new TransactionsGatewayStub();
        gateway.cancel$ = failWith(422, code);
        await setup(blocked(), gateway);

        await userEvent.click(screen.getByTestId('cancel-installments-open'));
        await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'motivo');
        await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

        expect(screen.getByTestId('cancel-installments-error')).toHaveTextContent(message);
        expect(screen.getByTestId('detail-title')).toHaveTextContent('Notebook');
      },
    );

    it('Dado o estorno recusado pelo backend com TRANSACTION_IN_CLOSED_INVOICE, então mostra a mesma explicação', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.void$ = failWith(422, 'TRANSACTION_IN_CLOSED_INVOICE');
      await setup(purchase({ voidable: true }), gateway);

      await userEvent.click(screen.getByTestId('void-open'));
      await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'motivo');
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.getByTestId('void-error')).toHaveTextContent(
        pt.transactions.detail.void.blocked.TRANSACTION_IN_CLOSED_INVOICE,
      );
    });
  });

  it('Dado INVOICE_PAYMENT, então mostra o cartão e a fatura paga com link; o estorno funciona (sempre estornável)', async () => {
    const payment = aTransaction({
      id: 'tx-pay',
      type: 'INVOICE_PAYMENT',
      description: 'Pagamento da fatura',
      amount: brl('500.00'),
      category: null,
      method: null,
      card: { id: 'card-1', name: 'Roxinho' },
      invoice: {
        id: 'inv-nov',
        referenceMonth: '2026-11',
        closingDate: '2026-10-25',
        dueDate: '2026-11-05',
        status: 'CLOSED',
      },
      editable: false,
      impact: {
        cash: brl('-500.00'),
        consumption: [],
        netWorth: brl('0.00'),
        commitment: brl('0.00'),
      },
    });
    const gateway = new TransactionsGatewayStub();
    gateway.void$ = of({ ...payment, status: 'VOIDED' as const, voidable: false });
    const { toast, fixture } = await setup(payment, gateway);

    expect(text(screen.getByTestId('detail-field-type'))).toContain('Pagamento de fatura');
    expect(text(screen.getByTestId('detail-amount'))).toBe('−R$ 500,00');
    expect(screen.getByTestId('detail-invoice-link')).toHaveAttribute(
      'href',
      '/cards/card-1/invoices/inv-nov',
    );
    expect(screen.getByTestId('detail-invoice-link')).toHaveTextContent('Fatura de nov/2026');
    expect(screen.queryByTestId('detail-edit')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('void-open'));
    await userEvent.type(screen.getByTestId('confirm-dialog-reason'), 'paguei errado');
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(gateway.voids).toEqual([{ id: 'tx-pay', reason: 'paguei errado' }]);
    expect(toast.toasts()[0]?.message).toBe(pt.transactions.detail.void.toast);
  });

  it('Dado REFUND no cartão, então mostra o cartão e a fatura onde entrou o crédito', async () => {
    await setup(
      aTransaction({
        id: 'tx-ref',
        type: 'REFUND',
        description: 'Reembolso',
        account: null,
        method: null,
        card: { id: 'card-1', name: 'Roxinho' },
        invoice: {
          id: 'inv-dez',
          referenceMonth: '2026-12',
          closingDate: '2026-11-25',
          dueDate: '2026-12-05',
          status: 'OPEN',
        },
        editable: false,
      }),
    );

    expect(text(screen.getByTestId('detail-field-card'))).toContain('Roxinho');
    expect(screen.getByTestId('detail-invoice-link')).toHaveAttribute(
      'href',
      '/cards/card-1/invoices/inv-dez',
    );
  });

  it('Dado a compra e o diálogo de cancelamento, então o axe não aponta violações', async () => {
    const { container } = await setup(
      purchase({ voidable: false, voidBlockedBy: 'TRANSACTION_IN_CLOSED_INVOICE' }),
    );

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
