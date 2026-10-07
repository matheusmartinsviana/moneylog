import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { QuickCaptureComponent } from '~/app/features/home/components/quick-capture/quick-capture.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { anAccount, AccountsGatewayStub, provideAccountsStub } from '~/testing/accounts-testing';
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
  const saved = vi.fn();
  const view = await render(QuickCaptureComponent, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideAccountsStub(accounts),
      ...provideCategoriesStub(categories),
      provideTransactionsStub(transactions),
      AccountsListFacade,
    ],
    on: { saved },
  });
  view.fixture.componentRef.injector.get(AccountsListFacade).load('ACTIVE');
  await view.fixture.whenStable();
  view.fixture.detectChanges();
  return { ...view, transactions, saved };
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
});
