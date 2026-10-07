import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { defer, of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { TransactionEditPage } from '~/app/features/transactions/pages/transaction-edit.page';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aTransaction,
  anExpenseInput,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

// Fluxos longos com userEvent e axe: folga para máquinas ocupadas (CI, outros processos).
vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const NUBANK = anAccount({ id: 'acc-1', name: 'Nubank' });
const WALLET = anAccount({ id: 'acc-2', name: 'Carteira', type: 'WALLET' });
const BROKER = anAccount({
  id: 'acc-3',
  name: 'Corretora',
  type: 'INVESTMENT',
  liquidity: 'INVESTMENT',
});

function anEditable(overrides: Partial<Transaction> = {}): Transaction {
  return aTransaction({
    version: 7,
    formValue: anExpenseInput({ notes: 'sem glúten' }),
    ...overrides,
  });
}

async function setup(gateway = new TransactionsGatewayStub()) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [NUBANK, WALLET, BROKER];
  const categories = new CategoriesGatewayStub();
  categories.categories = [
    aCategory({ id: 'cat-1', name: 'Alimentação' }),
    aCategory({ id: 'cat-2', name: 'Transporte' }),
    aCategory({ id: 'cat-in', name: 'Salário', kind: 'INCOME' }),
  ];
  const result = await render(App, {
    initialRoute: '/transactions/tx-1/edit',
    providers: [
      provideRouter(
        [
          { path: 'transactions/:id/edit', component: TransactionEditPage },
          { path: 'transactions/:id', component: DummyComponent },
        ],
        withComponentInputBinding(),
      ),
      provideI18nTesting('pt'),
      provideTransactionsStub(gateway),
      provideAccountsStub(accounts),
      provideCategoriesStub(categories),
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

const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};
describe('TransactionEditPage', () => {
  it('Dado uma despesa editável, então o formulário vem preenchido pelo mapa de S-90', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(anEditable());
    await setup(gateway);

    expect(field('entry-amount').value).toBe('35,00');
    expect(field('entry-description').value).toBe('Almoço');
    expect(screen.getByTestId('entry-category')).toHaveTextContent('Alimentação');
    expect(screen.getByTestId('entry-account')).toHaveTextContent('Nubank');
    expect(screen.getByTestId('entry-method')).toHaveTextContent('Pix');
    expect(field('entry-date').value).toBe('04/10/2026');
    expect(
      screen.getByRole('dialog', { name: pt.transactions.detail.editPage.title }),
    ).toBeVisible();
  });

  it('Dado a edição do valor, quando salvo, então o PUT leva a version e as notas, e volta para o detalhe com toast', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(anEditable());
    const { router, toast, fixture } = await setup(gateway);

    await userEvent.clear(field('entry-amount'));
    await userEvent.type(field('entry-amount'), '40,50');
    await userEvent.click(screen.getByTestId('form-save'));
    await fixture.whenStable();

    expect(gateway.updates).toEqual([
      {
        id: 'tx-1',
        version: 7,
        input: anExpenseInput({ amount: '40.50', notes: 'sem glúten' }),
      },
    ]);
    expect(router.url).toBe('/transactions/tx-1');
    expect(toast.toasts()[0]?.message).toBe(pt.transactions.detail.editPage.toast);
  });

  it('Dado 409 VERSION_CONFLICT, então avisa "mudou em outro lugar" e recarrega a versão mais recente', async () => {
    const gateway = new TransactionsGatewayStub();
    let loads = 0;
    gateway.get$ = defer(() => {
      loads++;
      return of(anEditable());
    });
    gateway.update$ = failWith(409, 'VERSION_CONFLICT');
    await setup(gateway);
    expect(loads).toBe(1);

    gateway.get$ = defer(() => {
      loads++;
      return of(anEditable({ version: 8, formValue: anExpenseInput({ amount: '99.00' }) }));
    });
    await userEvent.click(screen.getByTestId('form-save'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      pt.errors.codes['VERSION_CONFLICT']!,
    );
    await waitFor(() => expect(field('entry-amount').value).toBe('99,00'));
    expect(loads).toBe(2);
    gateway.update$ = of(anEditable());
    await userEvent.click(screen.getByTestId('form-save'));
    expect(gateway.updates[1]?.version).toBe(8);
  });

  it.each([
    ['REFUND_CATEGORY_LOCKED', 'entry-category'],
    ['REFUND_EXCEEDS_ORIGINAL', 'entry-amount'],
  ])('Dado o 422 %s, então o erro aparece no campo certo e o digitado fica', async (code, id) => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(anEditable());
    gateway.update$ = failWith(422, code);
    await setup(gateway);

    await pick('entry-category', 'cat-2');
    await userEvent.clear(field('entry-amount'));
    await userEvent.type(field('entry-amount'), '10,00');
    await userEvent.click(screen.getByTestId('form-save'));

    expect(screen.getByTestId(id)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(pt.errors.codes[code]!)).toBeInTheDocument();
    expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
    expect(field('entry-amount').value).toBe('10,00');
    expect(screen.getByTestId('entry-category')).toHaveTextContent('Transporte');
  });

  it('Dado uma transferência, então edita com fromAccountId e toAccountId', async () => {
    const gateway = new TransactionsGatewayStub();
    const input: TransactionInput = {
      type: 'TRANSFER',
      amount: '100.00',
      date: '2026-10-04',
      description: 'Para a carteira',
      notes: null,
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
    };
    gateway.get$ = of(
      aTransaction({
        type: 'TRANSFER',
        amount: brl('100.00'),
        formValue: input,
        category: null,
        method: null,
      }),
    );
    await setup(gateway);

    expect(screen.getByTestId('entry-from')).toHaveTextContent('Nubank');
    expect(screen.getByTestId('entry-to')).toHaveTextContent('Carteira');
    await userEvent.click(screen.getByTestId('form-save'));

    expect(gateway.updates[0]?.input).toEqual(input);
  });

  it('Dado uma aplicação, então edita com cashAccountId, investmentAccountId e direction', async () => {
    const gateway = new TransactionsGatewayStub();
    const input: TransactionInput = {
      type: 'INVESTMENT',
      amount: '300.00',
      date: '2026-10-04',
      description: 'Aplicação',
      notes: null,
      cashAccountId: 'acc-1',
      investmentAccountId: 'acc-3',
      direction: 'CONTRIBUTION',
    };
    gateway.get$ = of(aTransaction({ type: 'INVESTMENT', formValue: input, category: null }));
    await setup(gateway);

    expect(screen.getByTestId('entry-cash-account')).toHaveTextContent('Nubank');
    expect(screen.getByTestId('entry-investment-account')).toHaveTextContent('Corretora');
    expect(screen.getByTestId('entry-direction-CONTRIBUTION')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByTestId('entry-direction-REDEMPTION'));
    await userEvent.click(screen.getByTestId('form-save'));

    expect(gateway.updates[0]).toMatchObject({
      version: 1,
      input: { ...input, direction: 'REDEMPTION' },
    });
  });

  it('Dado um ajuste, então edita com kind e reason e o texto de ajuda aparece', async () => {
    const gateway = new TransactionsGatewayStub();
    const input: TransactionInput = {
      type: 'ADJUSTMENT',
      amount: '10.00',
      date: '2026-10-04',
      description: 'Ajuste',
      notes: null,
      accountId: 'acc-3',
      direction: 'INCREASE',
      kind: 'YIELD',
      reason: 'rendimento',
    };
    gateway.get$ = of(aTransaction({ type: 'ADJUSTMENT', formValue: input, category: null }));
    await setup(gateway);

    expect(screen.getByTestId('adjustment-help')).toBeInTheDocument();
    expect(screen.getByTestId('entry-kind-YIELD')).toHaveAttribute('aria-checked', 'true');
    expect(field('entry-reason').value).toBe('rendimento');
    await userEvent.clear(field('entry-reason'));
    await userEvent.type(field('entry-reason'), 'rendimento de outubro');
    await userEvent.click(screen.getByTestId('form-save'));

    expect(gateway.updates[0]?.input).toEqual({ ...input, reason: 'rendimento de outubro' });
  });

  it('Dado um reembolso com original, então a categoria vem travada e o 422 REFUND_EXCEEDS_ORIGINAL vai para o valor', async () => {
    const gateway = new TransactionsGatewayStub();
    const input: TransactionInput = {
      type: 'REFUND',
      amount: '20.00',
      date: '2026-10-04',
      description: 'Reembolso: Jantar',
      notes: null,
      accountId: 'acc-1',
      cardId: null,
      categoryId: 'cat-1',
      refundOfTransactionId: 'orig-1',
    };
    gateway.get$ = of(
      aTransaction({
        type: 'REFUND',
        formValue: input,
        refundOf: { id: 'orig-1', description: 'Jantar' },
      }),
    );
    gateway.update$ = failWith(422, 'REFUND_EXCEEDS_ORIGINAL');
    await setup(gateway);

    expect(screen.getByTestId('entry-original-chosen')).toHaveTextContent('Jantar');
    expect(screen.getByTestId('entry-category')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(field('entry-amount'));
    await userEvent.type(field('entry-amount'), '500');
    await userEvent.click(screen.getByTestId('form-save'));

    expect(gateway.updates[0]?.input).toMatchObject({
      refundOfTransactionId: 'orig-1',
      categoryId: 'cat-1',
      amount: '500.00',
    });
    expect(field('entry-amount')).toHaveAttribute('aria-invalid', 'true');
    expect(field('entry-amount').value).toBe('500,00');
  });

  it.each([
    ['editable false', { editable: false }],
    ['estornada', { status: 'VOIDED' as const, editable: true }],
    ['sem valor de formulário', { formValue: null }],
  ])('Dado %s, então não mostra o formulário', async (_, overrides) => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(anEditable(overrides));
    await setup(gateway);

    expect(screen.queryByTestId('transaction-edit')).not.toBeInTheDocument();
    expect(screen.getByText(pt.transactions.detail.editPage.notEditable)).toBeInTheDocument();
  });

  it('Dado um id inexistente, então mostra "não encontrada" com link para a lista', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = failWith(404, 'TRANSACTION_NOT_FOUND');
    await setup(gateway);

    expect(screen.getByText(pt.transactions.detail.notFound.title)).toBeInTheDocument();
  });

  it('Dado erro ao carregar, então mostra o erro com "tentar de novo"', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.get$ = of(anEditable());
    await userEvent.click(screen.getByRole('button', { name: pt.errors.load.retry }));

    expect(await screen.findByTestId('transaction-edit')).toBeInTheDocument();
  });

  it('Dado a tela de edição, então o axe não aponta violações', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.get$ = of(anEditable());
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
