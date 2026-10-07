import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { TransactionEditPage } from '~/app/features/transactions/pages/transaction-edit.page';
import type { CardPurchaseInput } from '~/modules/transactions/core/types/transaction-input';
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
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const FORM_VALUE: CardPurchaseInput = {
  type: 'CARD_PURCHASE',
  amount: '1200.00',
  date: '2026-10-10',
  description: 'Notebook',
  notes: 'garantia de 1 ano',
  cardId: 'card-1',
  categoryId: 'cat-tech',
  installments: 6,
};

const purchase = (overrides = {}) =>
  aTransaction({
    id: 'tx-card',
    type: 'CARD_PURCHASE',
    description: 'Notebook',
    amount: brl('1200.00'),
    date: '2026-10-10',
    notes: 'garantia de 1 ano',
    category: { id: 'cat-tech', name: 'Tecnologia' },
    card: { id: 'card-1', name: 'Roxinho' },
    account: null,
    method: null,
    editable: true,
    version: 5,
    formValue: FORM_VALUE,
    ...overrides,
  });

async function setup(tx = purchase(), gateway = new TransactionsGatewayStub()) {
  gateway.get$ = of(tx);
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount()];
  const categories = new CategoriesGatewayStub();
  categories.categories = [
    aCategory({ id: 'cat-tech', name: 'Tecnologia' }),
    aCategory({ id: 'cat-food', name: 'Alimentação' }),
  ];
  const result = await render(App, {
    initialRoute: '/transactions/tx-card/edit',
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

describe('TransactionEditPage: compra no cartão (T70 CA6, S-121)', () => {
  it('Dado a compra, então só descrição, categoria e observação ficam editáveis; cartão, valor, data e parcelas ficam em leitura', async () => {
    await setup();

    expect(field('entry-description').value).toBe('Notebook');
    expect(field('entry-description')).toBeEnabled();
    expect(field('entry-notes').value).toBe('garantia de 1 ano');
    expect(field('entry-notes')).toBeEnabled();
    expect(screen.getByTestId('entry-category')).toHaveTextContent('Tecnologia');
    expect(screen.getByTestId('entry-category')).not.toHaveAttribute('aria-disabled');

    expect(screen.getByTestId('entry-card')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('entry-card')).toHaveTextContent('Roxinho');
    expect(field('entry-amount')).toBeDisabled();
    expect(field('entry-amount').value).toBe('1.200,00');
    expect(field('entry-date')).toBeDisabled();
    expect(field('entry-installments')).toBeDisabled();
    expect(field('entry-installments').value).toBe('6');
  });

  it('Dado a edição, então mostra "para mudar valor ou parcelas, estorne ou cancele as parcelas" e nenhuma prévia', async () => {
    await setup();

    expect(screen.getByTestId('credit-locked-hint')).toHaveTextContent(
      'Para mudar valor ou parcelas, estorne a compra ou cancele as parcelas restantes.',
    );
    expect(screen.queryByTestId('purchase-preview')).not.toBeInTheDocument();
  });

  it('Dado salvar, então o PUT leva o corpo da compra com os mesmos valor, data, cartão e parcelas, a nova descrição e a version', async () => {
    const { gateway, toast, router, fixture } = await setup();

    await userEvent.clear(field('entry-description'));
    await userEvent.type(field('entry-description'), 'Notebook Pro');
    await userEvent.click(screen.getByTestId('entry-category'));
    await userEvent.click(screen.getByTestId('entry-category-option-cat-food'));
    await userEvent.click(screen.getByTestId('form-save'));
    await fixture.whenStable();

    expect(gateway.updates).toEqual([
      {
        id: 'tx-card',
        version: 5,
        input: {
          type: 'CARD_PURCHASE',
          amount: '1200.00',
          date: '2026-10-10',
          description: 'Notebook Pro',
          notes: 'garantia de 1 ano',
          cardId: 'card-1',
          categoryId: 'cat-food',
          installments: 6,
        },
      },
    ]);
    expect(gateway.creates).toHaveLength(0);
    expect(toast.toasts()[0]?.message).toBe(pt.transactions.detail.editPage.toast);
    expect(router.url).toBe('/transactions/tx-card');
  });

  it('Dado limpar a observação, então o PUT leva notes null', async () => {
    const { gateway, fixture } = await setup();

    await userEvent.clear(field('entry-notes'));
    await userEvent.click(screen.getByTestId('form-save'));
    await fixture.whenStable();

    expect(gateway.updates[0]?.input).toMatchObject({ notes: null });
  });

  it('Dado 422 REFUND_CATEGORY_LOCKED, então o erro vai ao campo da categoria', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.update$ = failWith(422, 'REFUND_CATEGORY_LOCKED');
    const { fixture } = await setup(purchase(), gateway);

    await userEvent.click(screen.getByTestId('form-save'));
    fixture.detectChanges();

    expect(screen.getByText(pt.errors.codes['REFUND_CATEGORY_LOCKED']!)).toBeInTheDocument();
  });

  it('Dado 422 TRANSACTION_NOT_EDITABLE, então mostra o aviso geral traduzido', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.update$ = failWith(422, 'TRANSACTION_NOT_EDITABLE');
    await setup(purchase(), gateway);

    await userEvent.click(screen.getByTestId('form-save'));

    expect(screen.getByTestId('form-error')).toHaveTextContent(
      pt.errors.codes['TRANSACTION_NOT_EDITABLE']!,
    );
  });

  it('Dado compra de cartão arquivado, então o nome do cartão continua aparecendo no campo em leitura', async () => {
    await setup(purchase({ card: { id: 'card-arq', name: 'Cartão antigo' } }));

    expect(screen.getByTestId('entry-card')).toHaveTextContent('Cartão antigo');
  });

  it('Dado editable false (ex.: compra estornada), então o formulário nem aparece', async () => {
    await setup(purchase({ editable: false }));

    expect(screen.queryByTestId('credit-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.transactions.detail.editPage.notEditable,
    );
  });

  it('Dado o formulário de edição, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
