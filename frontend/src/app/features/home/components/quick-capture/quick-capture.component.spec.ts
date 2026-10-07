import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { QuickCaptureComponent } from '~/app/features/home/components/quick-capture/quick-capture.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { anAccount, AccountsGatewayStub, provideAccountsStub } from '~/testing/accounts-testing';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

async function setup(accountsList = [anAccount({ id: 'acc-1', name: 'Nubank' })]) {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = accountsList;
  const categories = new CategoriesGatewayStub();
  categories.categories = [
    aCategory({ id: 'cat-food', name: 'Alimentação' }),
    aCategory({ id: 'cat-salary', name: 'Salário', kind: 'INCOME' }),
  ];
  const transactions = new TransactionsGatewayStub();
  transactions.create$ = (await import('rxjs')).of(
    aTransaction({ description: 'almoço', amount: { amount: '42.90', currency: 'BRL' } }),
  );
  const people = new PeopleGatewayStub();
  people.people = [aPerson({ id: 'p-1', name: 'Irmã' })];
  const saved = vi.fn();
  const view = await render(QuickCaptureComponent, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideAccountsStub(accounts),
      ...provideCategoriesStub(categories),
      provideTransactionsStub(transactions),
      ...providePeopleStub(people),
      AccountsListFacade,
    ],
    on: { saved },
  });
  view.fixture.componentRef.injector.get(AccountsListFacade).load('ACTIVE');
  await view.fixture.whenStable();
  view.fixture.detectChanges();
  return { ...view, transactions, saved, people };
}

describe('QuickCaptureComponent (sem IA)', () => {
  it('Dado valor, descrição, categoria e conta, quando salvo, então chama POST uma vez com o payload do /quick-add e avisa o Início', async () => {
    const { transactions, saved } = await setup();

    await userEvent.type(await screen.findByTestId('capture-amount'), '42,90');
    await userEvent.type(screen.getByTestId('capture-description'), 'almoço');
    await userEvent.click(screen.getByTestId('capture-category'));
    await userEvent.click(await screen.findByTestId('capture-category-option-cat-food'));
    await userEvent.dblClick(screen.getByTestId('quick-capture-save'));

    expect(transactions.creates).toHaveLength(1);
    expect(transactions.creates[0]?.input).toMatchObject({
      type: 'EXPENSE',
      amount: '42.90',
      description: 'almoço',
      accountId: 'acc-1',
      categoryId: 'cat-food',
      method: 'OTHER',
    });
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('Dado o texto "42,90 almoço iFood" na descrição, então o valor NÃO é preenchido e nada é sugerido (sem parser)', async () => {
    await setup();

    await userEvent.type(await screen.findByTestId('capture-description'), '42,90 almoço iFood');

    expect(screen.getByTestId('capture-amount')).toHaveValue('');
    expect(screen.getByTestId('capture-category')).not.toHaveTextContent('Alimentação');
  });

  it('Dado Salvar sem categoria, então nada é enviado e o erro aparece no campo', async () => {
    const { transactions } = await setup();

    await userEvent.type(await screen.findByTestId('capture-amount'), '10');
    await userEvent.type(screen.getByTestId('capture-description'), 'x');
    await userEvent.click(screen.getByTestId('quick-capture-save'));

    expect(transactions.creates).toHaveLength(0);
    expect(screen.getByTestId('capture-category')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado o bloco de IA, então é inerte, sem número nem confiança, e leva a /ai', async () => {
    await setup();

    const ai = screen.getByTestId('home-quick-capture-ai');
    expect(ai).toHaveAttribute('aria-disabled', 'true');
    expect(ai).toHaveTextContent(pt.dashboard.quickCapture.ai.hint);
    expect(ai.textContent).not.toMatch(/\d|%/);
    expect(screen.getByTestId('home-quick-capture-ai-link')).toHaveAttribute('href', '/ai');
  });

  it('Dado nenhuma conta de saldo, então mostra "Criar conta" no lugar do formulário', async () => {
    await setup([]);

    expect(await screen.findByTestId('home-quick-capture-empty')).toBeInTheDocument();
    expect(screen.getByTestId('home-quick-capture-create')).toHaveAttribute(
      'href',
      '/accounts/new',
    );
    expect(screen.queryByTestId('quick-capture-form')).not.toBeInTheDocument();
  });

  it('Dado "Emprestei", quando informo valor e pessoa e salvo, então grava LOAN_GIVEN uma vez e avisa com ação "Ver dívida"', async () => {
    const { transactions, saved } = await setup();
    transactions.create$ = (await import('rxjs')).of(
      aTransaction({
        type: 'LOAN_GIVEN',
        amount: { amount: '50.00', currency: 'BRL' },
        debt: {
          id: 'debt-1',
          person: { id: 'p-1', name: 'Irmã' },
          direction: 'RECEIVABLE',
          status: 'OPEN',
          principal: { amount: '50.00', currency: 'BRL' },
          settled: { amount: '0.00', currency: 'BRL' },
          outstanding: { amount: '50.00', currency: 'BRL' },
          date: '2026-10-07',
          expectedDate: null,
          overdue: false,
          description: null,
        },
      }),
    );

    await userEvent.type(await screen.findByTestId('capture-amount'), '50');
    await userEvent.click(screen.getByTestId('capture-type-LOAN'));
    expect(screen.queryByTestId('capture-description')).not.toBeInTheDocument();
    expect(screen.queryByTestId('capture-category')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('capture-person'));
    await userEvent.click(await screen.findByTestId('capture-person-option-p-1'));
    await userEvent.dblClick(screen.getByTestId('quick-capture-save'));

    expect(transactions.creates).toHaveLength(1);
    expect(transactions.creates[0]?.input).toMatchObject({
      type: 'LOAN_GIVEN',
      amount: '50.00',
      accountId: 'acc-1',
      newDebt: { personId: 'p-1', expectedDate: null, description: null },
    });
    expect(transactions.creates[0]?.key).toBeTruthy();
    expect(saved).toHaveBeenCalledTimes(1);
    const toast = TestBed.inject(ToastService).toasts()[0];
    expect(toast?.message.replace(/\u00a0/g, ' ')).toBe(
      'Empréstimo de R$ 50,00 para Irmã registrado.',
    );
    expect(toast?.actions[0]?.label).toBe(pt.quickAdd.toast.viewDebt);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    toast?.actions[0]?.run();
    expect(navigate).toHaveBeenCalledWith(['/debts', 'debt-1']);
  });

  it('Dado "Emprestei" sem pessoa, então nada é enviado e o erro aparece no campo', async () => {
    const { transactions } = await setup();

    await userEvent.type(await screen.findByTestId('capture-amount'), '50');
    await userEvent.click(screen.getByTestId('capture-type-LOAN'));
    await userEvent.click(screen.getByTestId('quick-capture-save'));

    expect(transactions.creates).toHaveLength(0);
    expect(screen.getByTestId('capture-person')).toHaveAttribute('aria-invalid', 'true');
  });
});
