import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { defer, NEVER, of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { QuickAddPage } from '~/app/features/quick-add/pages/quick-add.page';
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
  aPurchasePreview,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aTransaction,
  provideTransactionsStub,
  someTotals,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';
import { todayIso } from '~/util/date';

// Fluxos longos com userEvent e axe: folga para máquinas ocupadas (CI, outros processos).
vi.setConfig({ testTimeout: 20_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const NUBANK = anAccount({ id: 'acc-nu', name: 'Nubank' });
const WALLET = anAccount({ id: 'acc-wallet', name: 'Carteira', type: 'WALLET' });
const BROKER = anAccount({
  id: 'acc-broker',
  name: 'Corretora',
  type: 'INVESTMENT',
  liquidity: 'INVESTMENT',
});

interface Options {
  readonly accounts?: ReturnType<typeof anAccount>[];
  readonly url?: string;
  readonly gateway?: TransactionsGatewayStub;
  readonly cards?: ReturnType<typeof aCard>[];
  readonly cardsGateway?: CardsGatewayStub;
}

async function setup({
  accounts = [NUBANK],
  url = '/quick-add',
  gateway,
  cards = [],
  cardsGateway = new CardsGatewayStub(),
}: Options = {}) {
  cardsGateway.cards = cards;
  const transactions = gateway ?? new TransactionsGatewayStub();
  const accountsStub = new AccountsGatewayStub();
  accountsStub.accounts = accounts;
  const categories = new CategoriesGatewayStub();
  categories.categories = [
    aCategory({ id: 'cat-food', name: 'Alimentação' }),
    aCategory({ id: 'cat-salary', name: 'Salário', kind: 'INCOME' }),
  ];
  const result = await render(App, {
    initialRoute: url,
    routes: [
      { path: 'quick-add', component: QuickAddPage },
      { path: 'transactions', component: DummyComponent },
      { path: 'accounts/new', component: DummyComponent },
      { path: 'cards/new', component: DummyComponent },
      { path: 'cards/:id/invoices/:invoiceId', component: DummyComponent },
    ],
    providers: [
      provideI18nTesting('pt'),
      provideTransactionsStub(transactions),
      provideAccountsStub(accountsStub),
      provideCategoriesStub(categories),
      provideCardsStub(cardsGateway),
    ],
  });
  await result.fixture.whenStable();
  return {
    ...result,
    cardsGateway,
    transactions,
    accountsStub,
    router: TestBed.inject(Router),
    toast: TestBed.inject(ToastService),
  };
}

const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};
/** O "Tipo de registro" é um seletor só: abre a lista e escolhe o tipo. */
const pickMode = (mode: string) => pick('quick-add-mode', mode);
const expectMode = (mode: keyof typeof pt.quickAdd.modes.titles) =>
  expect(screen.getByTestId('quick-add-mode')).toHaveTextContent(pt.quickAdd.modes[mode]);
const fillAmountAndDescription = async (amount: string, description: string) => {
  await userEvent.type(field('entry-amount'), amount);
  await userEvent.type(field('entry-description'), description);
};

describe('QuickAddPage', () => {
  beforeEach(() => localStorage.clear());

  describe('abertura', () => {
    it('Dado /quick-add, então o foco vai para o valor e o modo padrão é Despesa', async () => {
      await setup();

      expect(document.activeElement).toBe(field('entry-amount'));
      expectMode('expense');
      expect(screen.getByTestId('expense-form')).toBeInTheDocument();
    });

    it('Dado Despesa, então a ordem é valor, descrição, categoria, conta, data e método', async () => {
      await setup();

      const ids = Array.from(
        screen.getByTestId('expense-form').querySelectorAll('[data-cy^="entry-"]'),
      )
        .map((el) => el.getAttribute('data-cy'))
        .filter((id) => id && !id.includes('-option-') && !id.endsWith('-listbox'));
      expect(ids).toEqual([
        'entry-amount',
        'entry-description',
        'entry-category',
        'entry-account',
        'entry-date',
        'entry-date-calendar',
        'entry-method',
        'entry-split',
      ]);
    });

    it.each(['pix', 'debit', 'income', 'transfer', 'expense'] as const)(
      'Dado ?mode=%s, então abre o modo indicado',
      async (mode) => {
        await setup({ accounts: [NUBANK, WALLET], url: `/quick-add?mode=${mode}` });

        expectMode(mode);
      },
    );

    it('Dado um modo desconhecido na URL, então cai em Despesa', async () => {
      await setup({ url: '/quick-add?mode=lixo' });

      expectMode('expense');
    });

    it('Dado "Crédito", então aparece habilitado, sem "em breve", e abre a compra no cartão', async () => {
      await setup({ cards: [aCard()] });

      await userEvent.click(screen.getByTestId('quick-add-mode'));
      const credit = screen.getByTestId('quick-add-mode-option-credit');
      expect(credit).not.toHaveAttribute('aria-disabled');
      expect(credit).not.toHaveAccessibleDescription(/breve/i);
      await userEvent.click(credit);

      expect(await screen.findByTestId('credit-form')).toBeInTheDocument();
    });

    it('Dado a troca de modo, então a URL passa a levar ?mode e o formulário muda', async () => {
      const { router } = await setup({ accounts: [NUBANK, WALLET] });

      await pickMode('transfer');

      expect(router.url).toBe('/quick-add?mode=transfer');
      expect(await screen.findByTestId('transfer-form')).toBeInTheDocument();
    });
  });

  describe('Pix e Débito', () => {
    it('Dado Pix, quando preencho 35,00, "almoço" e Alimentação, então o POST leva EXPENSE, PIX, "35.00" e a data de hoje', async () => {
      const { transactions } = await setup({ url: '/quick-add?mode=pix' });

      expect(screen.queryByTestId('entry-method')).not.toBeInTheDocument();
      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(transactions.creates).toHaveLength(1);
      expect(transactions.creates[0]?.input).toEqual({
        type: 'EXPENSE',
        amount: '35.00',
        date: todayIso(),
        description: 'almoço',
        notes: null,
        accountId: 'acc-nu',
        categoryId: 'cat-food',
        method: 'PIX',
      });
      expect(transactions.creates[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('Dado o salvar, então o toast mostra o registro devolvido com as duas ações e o formulário limpa valor e descrição mas mantém conta e modo', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = of(aTransaction({ description: 'Almoço', amount: brl('35.00') }));
      const { toast } = await setup({ url: '/quick-add?mode=pix', gateway });

      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));

      const shown = toast.toasts()[0];
      expect(shown?.message).toBe('Registrado: Almoço, R$\u00a035,00.');
      expect(shown?.actions.map((a) => a.label)).toEqual([
        pt.quickAdd.toast.viewTransactions,
        pt.quickAdd.toast.newEntry,
      ]);
      expect(field('entry-amount').value).toBe('');
      expect(field('entry-description').value).toBe('');
      expect(screen.getByTestId('entry-account')).toHaveTextContent('Nubank');
      expectMode('pix');
      expect(document.activeElement).toBe(field('entry-amount'));
    });

    it('Dado o toast, então "Ver movimentações" navega e "Novo registro" devolve o foco ao valor', async () => {
      const { toast, router, fixture } = await setup({ url: '/quick-add?mode=pix' });
      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));
      field('entry-description').focus();

      toast.toasts()[0]?.actions[1]?.run();
      fixture.detectChanges();
      expect(document.activeElement).toBe(field('entry-amount'));

      toast.toasts()[0]?.actions[0]?.run();
      await fixture.whenStable();
      expect(router.url).toBe('/transactions');
    });

    it('Dado Débito, então o POST leva method DEBIT', async () => {
      const { transactions } = await setup({ url: '/quick-add?mode=debit' });

      await fillAmountAndDescription('12,50', 'café');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(transactions.creates[0]?.input).toMatchObject({ method: 'DEBIT', amount: '12.50' });
    });
  });

  describe('Despesa e Receita', () => {
    it('Dado Despesa, então o método é opcional (omitido), tem os 6 métodos e nenhuma opção de crédito', async () => {
      const { transactions } = await setup();

      await fillAmountAndDescription('10,00', 'mercado');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));
      expect(transactions.creates).toHaveLength(1);
      expect(transactions.creates[0]?.input).not.toHaveProperty('method');
      expect(screen.getByTestId('entry-method')).not.toHaveAttribute('aria-invalid', 'true');

      await userEvent.click(screen.getByTestId('entry-method'));
      const labels = screen
        .getAllByRole('option', { hidden: true })
        .filter((o) => o.getAttribute('data-cy')?.startsWith('entry-method-option-'))
        .map((o) => o.textContent?.trim());
      // A primeira é a opção vazia (omite o método; o servidor usa OTHER), rotulada como "Outro".
      expect(labels).toEqual(
        ['OTHER', 'CASH', 'DEBIT', 'PIX', 'TRANSFER', 'BOLETO', 'OTHER'].map(
          (m) => pt.transactions.methods[m as keyof typeof pt.transactions.methods],
        ),
      );
      await userEvent.click(screen.getByTestId('entry-method-option-BOLETO'));
      await fillAmountAndDescription('10,00', 'mercado');
      await userEvent.click(screen.getByTestId('form-save'));
      expect(transactions.creates[1]?.input).toMatchObject({ type: 'EXPENSE', method: 'BOLETO' });
    });

    it('Dado Despesa, então o select de conta mostra só contas CASH ativas e as categorias são só de despesa', async () => {
      const { accountsStub } = await setup({
        accounts: [
          NUBANK,
          WALLET,
          BROKER,
          anAccount({ id: 'acc-old', name: 'Antiga', status: 'ARCHIVED' }),
        ],
      });

      await userEvent.click(screen.getByTestId('entry-account'));
      expect(screen.getByTestId('entry-account-option-acc-nu')).toBeInTheDocument();
      expect(screen.getByTestId('entry-account-option-acc-wallet')).toBeInTheDocument();
      expect(screen.queryByTestId('entry-account-option-acc-broker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('entry-account-option-acc-old')).not.toBeInTheDocument();
      expect(accountsStub.queries[0]).toMatchObject({ status: 'ACTIVE', pageSize: 50 });

      await userEvent.click(screen.getByTestId('entry-category'));
      expect(screen.getByTestId('entry-category-option-cat-food')).toBeInTheDocument();
      expect(screen.queryByTestId('entry-category-option-cat-salary')).not.toBeInTheDocument();
    });

    it('Dado Receita, então só aparecem categorias INCOME e o método é opcional', async () => {
      const { transactions } = await setup({ url: '/quick-add?mode=income' });

      await userEvent.click(screen.getByTestId('entry-category'));
      expect(screen.getByTestId('entry-category-option-cat-salary')).toBeInTheDocument();
      expect(screen.queryByTestId('entry-category-option-cat-food')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('entry-category-option-cat-salary'));
      await fillAmountAndDescription('5.000,00', 'salário');
      await pick('entry-method', 'TRANSFER');
      await userEvent.click(screen.getByTestId('form-save'));
      expect(transactions.creates[0]?.input).toMatchObject({
        type: 'INCOME',
        amount: '5000.00',
        categoryId: 'cat-salary',
        method: 'TRANSFER',
      });
    });
  });

  describe('Transferência', () => {
    it('Dado Transferência, então os campos são valor, de, para, data e descrição e o destino exclui a origem e só traz a mesma liquidez', async () => {
      const { transactions } = await setup({
        accounts: [NUBANK, WALLET, BROKER],
        url: '/quick-add?mode=transfer',
      });

      await userEvent.type(field('entry-amount'), '200');
      await pick('entry-from', 'acc-nu');
      await userEvent.click(screen.getByTestId('entry-to'));
      expect(screen.queryByTestId('entry-to-option-acc-nu')).not.toBeInTheDocument();
      expect(screen.queryByTestId('entry-to-option-acc-broker')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('entry-to-option-acc-wallet'));
      await userEvent.type(field('entry-description'), 'para a carteira');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(transactions.creates[0]?.input).toEqual({
        type: 'TRANSFER',
        amount: '200.00',
        date: todayIso(),
        description: 'para a carteira',
        notes: null,
        fromAccountId: 'acc-nu',
        toAccountId: 'acc-wallet',
      });
    });

    it('Dado uma única conta, então a transferência explica que precisa de duas contas', async () => {
      await setup({ url: '/quick-add?mode=transfer' });

      expect(screen.getByText(pt.quickAdd.empty.needTwoAccounts.title)).toBeInTheDocument();
    });
  });

  describe('contas padrão', () => {
    it('Dado a última conta usada, então ela vem selecionada; depois de salvar, a conta usada é lembrada', async () => {
      localStorage.setItem('moneylog.quickAdd.lastAccountId', 'acc-wallet');
      await setup({ accounts: [NUBANK, WALLET] });

      expect(screen.getByTestId('entry-account')).toHaveTextContent('Carteira');

      await fillAmountAndDescription('5,00', 'bala');
      await pick('entry-category', 'cat-food');
      await pick('entry-account', 'acc-nu');
      await pick('entry-method', 'CASH');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(localStorage.getItem('moneylog.quickAdd.lastAccountId')).toBe('acc-nu');
    });

    it('Dado duas contas e nenhuma última usada, então nada vem selecionado', async () => {
      await setup({ accounts: [NUBANK, WALLET] });

      expect(screen.getByTestId('entry-account')).toHaveTextContent(pt.form.selectPlaceholder);
    });

    it('Dado a última conta que não serve mais (investimento), então é ignorada', async () => {
      localStorage.setItem('moneylog.quickAdd.lastAccountId', 'acc-broker');
      await setup({ accounts: [NUBANK, BROKER] });

      expect(screen.getByTestId('entry-account')).toHaveTextContent('Nubank');
    });
  });

  describe('estados', () => {
    it('Dado nenhuma conta ativa, então mostra o estado vazio com ação para /accounts/new', async () => {
      await setup({ accounts: [] });

      expect(screen.getByText(pt.quickAdd.empty.noAccount.title)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: pt.quickAdd.empty.noAccount.action }),
      ).toHaveAttribute('href', '/accounts/new');
      expect(screen.queryByTestId('expense-form')).not.toBeInTheDocument();
    });

    it('Dado só contas de investimento, então os modos de caixa pedem uma conta', async () => {
      await setup({ accounts: [BROKER] });

      expect(screen.getByText(pt.quickAdd.empty.noAccount.title)).toBeInTheDocument();
    });

    it('Dado carregando, então avisa por role status', async () => {
      const accounts = new AccountsGatewayStub();
      accounts.listError = null;
      accounts.list = () => NEVER;
      await render(App, {
        initialRoute: '/quick-add',
        routes: [{ path: 'quick-add', component: QuickAddPage }],
        providers: [
          provideI18nTesting('pt'),
          provideTransactionsStub(),
          provideAccountsStub(accounts),
          provideCategoriesStub(),
          provideCardsStub(),
        ],
      });

      expect(await screen.findByText(pt.quickAdd.loading)).toHaveAttribute('role', 'status');
    });

    it('Dado erro ao carregar, então mostra o erro com "tentar de novo" que recarrega', async () => {
      const accounts = new AccountsGatewayStub();
      accounts.listError = failWith(500, 'INTERNAL_ERROR');
      await render(App, {
        initialRoute: '/quick-add',
        routes: [{ path: 'quick-add', component: QuickAddPage }],
        providers: [
          provideI18nTesting('pt'),
          provideTransactionsStub(),
          provideAccountsStub(accounts),
          provideCategoriesStub(),
          provideCardsStub(),
        ],
      });

      expect(await screen.findByTestId('error-state')).toBeInTheDocument();
      accounts.listError = null;
      accounts.accounts = [NUBANK];
      await userEvent.click(screen.getByRole('button', { name: pt.errors.load.retry }));
      expect(await screen.findByTestId('expense-form')).toBeInTheDocument();
    });
  });

  describe('falhas do salvar', () => {
    it('Dado 422 por campo, então o erro aparece no campo e o que foi digitado fica', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = failWith(422, 'REFUND_EXCEEDS_ORIGINAL');
      await setup({ url: '/quick-add?mode=pix', gateway });

      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(field('entry-amount')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(pt.errors.codes['REFUND_EXCEEDS_ORIGINAL']!)).toBeInTheDocument();
      expect(field('entry-amount').value).toBe('35,00');
      expect(field('entry-description').value).toBe('almoço');
    });

    it('Dado 400 com errors[], então o erro vai para o campo apontado', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = failWith(400, 'VALIDATION_FAILED', [
        { field: 'description', code: 'NOT_BLANK', message: 'x' },
      ]);
      await setup({ url: '/quick-add?mode=pix', gateway });

      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(field('entry-description')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
    });

    it('Dado um code sem campo, então vira o aviso geral', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = failWith(422, 'ACCOUNT_ARCHIVED');
      await setup({ url: '/quick-add?mode=pix', gateway });

      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(screen.getByTestId('form-error')).toHaveTextContent(
        pt.errors.codes['ACCOUNT_ARCHIVED']!,
      );
    });

    it('Dado erro de rede, então mantém os dados e "tentar de novo" reenvia com a mesma Idempotency-Key', async () => {
      const gateway = new TransactionsGatewayStub();
      let calls = 0;
      gateway.create$ = defer(() => (++calls === 1 ? failWith(0, 'NETWORK') : of(aTransaction())));
      await setup({ url: '/quick-add?mode=pix', gateway });

      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));
      expect(screen.getByTestId('form-error')).toHaveTextContent(pt.errors.network);
      expect(field('entry-description').value).toBe('almoço');

      await userEvent.click(screen.getByTestId('form-retry'));

      expect(gateway.creates).toHaveLength(2);
      expect(gateway.creates[1]?.key).toBe(gateway.creates[0]?.key);
      expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
    });

    it('Dado clique duplo no salvar, então sai uma requisição só', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = NEVER;
      await setup({ url: '/quick-add?mode=pix', gateway });
      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');

      await userEvent.dblClick(screen.getByTestId('form-save'));

      expect(gateway.creates).toHaveLength(1);
    });

    it('Dado a troca de modo depois de uma falha, então o aviso da falha some', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = failWith(422, 'ACCOUNT_ARCHIVED');
      await setup({ url: '/quick-add?mode=pix', gateway });
      await fillAmountAndDescription('35,00', 'almoço');
      await pick('entry-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));
      expect(screen.getByTestId('form-error')).toBeInTheDocument();

      await pickMode('income');

      await waitFor(() => expect(screen.queryByTestId('form-error')).not.toBeInTheDocument());
    });
  });

  describe('Mais tipos (T41)', () => {
    it('Dado o seletor, então os tipos vêm agrupados e escolher um troca o formulário', async () => {
      await setup({ accounts: [NUBANK, BROKER] });

      await userEvent.click(screen.getByTestId('quick-add-mode'));
      const groups = pt.quickAdd.modes.groups;
      for (const label of Object.values(groups)) {
        expect(screen.getByRole('group', { name: label })).toBeVisible();
      }
      expect(screen.getByTestId('quick-add-mode-option-investment')).toBeVisible();
      expect(screen.getByTestId('quick-add-mode-option-refund')).toBeVisible();

      await userEvent.click(screen.getByTestId('quick-add-mode-option-adjustment'));
      expect(await screen.findByTestId('adjustment-form')).toBeInTheDocument();
      expectMode('adjustment');
    });

    it('Dado ?mode=refund, então abre o reembolso com o tipo escolhido no seletor', async () => {
      await setup({ url: '/quick-add?mode=refund' });

      expect(screen.getByTestId('refund-form')).toBeInTheDocument();
      expectMode('refund');
      expect(screen.getByRole('dialog', { name: pt.quickAdd.modes.titles.refund })).toBeVisible();
    });

    describe('aplicação e resgate', () => {
      it('Dado o formulário, então a conta é só CASH e a de investimento só INVESTMENT, e o POST leva cashAccountId e investmentAccountId', async () => {
        const { transactions } = await setup({
          accounts: [NUBANK, WALLET, BROKER],
          url: '/quick-add?mode=investment',
        });

        await userEvent.type(field('entry-amount'), '500');
        await userEvent.click(screen.getByTestId('entry-cash-account'));
        expect(screen.getByTestId('entry-cash-account-option-acc-nu')).toBeInTheDocument();
        expect(
          screen.queryByTestId('entry-cash-account-option-acc-broker'),
        ).not.toBeInTheDocument();
        await userEvent.click(screen.getByTestId('entry-cash-account-option-acc-nu'));
        await userEvent.click(screen.getByTestId('entry-investment-account'));
        expect(
          screen.queryByTestId('entry-investment-account-option-acc-nu'),
        ).not.toBeInTheDocument();
        expect(
          screen.getByTestId('entry-investment-account-option-acc-broker'),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByTestId('entry-investment-account-option-acc-broker'));
        await userEvent.click(screen.getByTestId('form-save'));
        expect(transactions.creates).toHaveLength(0);
        expect(screen.getByTestId('entry-direction')).toHaveAttribute('aria-invalid', 'true');

        await userEvent.click(screen.getByTestId('entry-direction-REDEMPTION'));
        await userEvent.click(screen.getByTestId('form-save'));

        expect(transactions.creates[0]?.input).toEqual({
          type: 'INVESTMENT',
          amount: '500.00',
          date: todayIso(),
          description: 'Resgate',
          notes: null,
          cashAccountId: 'acc-nu',
          investmentAccountId: 'acc-broker',
          direction: 'REDEMPTION',
        });
      });

      it('Dado uma conta de cada tipo, então vêm preenchidas por padrão', async () => {
        await setup({ accounts: [NUBANK, BROKER], url: '/quick-add?mode=investment' });

        expect(screen.getByTestId('entry-cash-account')).toHaveTextContent('Nubank');
        expect(screen.getByTestId('entry-investment-account')).toHaveTextContent('Corretora');
      });

      it('Dado nenhuma conta de investimento, então o modo mostra a ação "cadastrar conta de investimento"', async () => {
        await setup({ accounts: [NUBANK], url: '/quick-add?mode=investment' });

        expect(screen.getByText(pt.quickAdd.empty.noInvestmentAccount.title)).toBeInTheDocument();
        expect(
          screen.getByRole('link', { name: pt.quickAdd.empty.noInvestmentAccount.action }),
        ).toHaveAttribute('href', '/accounts/new');
        expect(screen.queryByTestId('investment-form')).not.toBeInTheDocument();
      });
    });

    describe('ajuste', () => {
      it('Dado o formulário, então explica que ajuste não é receita nem despesa e o motivo é obrigatório', async () => {
        const { transactions } = await setup({ url: '/quick-add?mode=adjustment' });

        expect(screen.getByTestId('adjustment-help')).toHaveTextContent(
          pt.entryForm.adjustment.help,
        );
        await userEvent.type(field('entry-amount'), '12,34');
        await userEvent.click(screen.getByTestId('entry-direction-DECREASE'));
        await userEvent.click(screen.getByTestId('form-save'));
        expect(transactions.creates).toHaveLength(0);
        expect(field('entry-reason')).toHaveAttribute('aria-invalid', 'true');

        await userEvent.type(field('entry-reason'), 'taxa não lançada');
        await userEvent.click(screen.getByTestId('form-save'));

        expect(transactions.creates[0]?.input).toEqual({
          type: 'ADJUSTMENT',
          amount: '12.34',
          date: todayIso(),
          description: 'Ajuste',
          notes: null,
          accountId: 'acc-nu',
          direction: 'DECREASE',
          kind: 'CORRECTION',
          reason: 'taxa não lançada',
        });
      });

      it('Dado uma conta de caixa, então "rendimento" fica desabilitado; com conta de investimento, habilita', async () => {
        const { transactions } = await setup({
          accounts: [NUBANK, BROKER],
          url: '/quick-add?mode=adjustment',
        });

        const yieldOption = screen.getByTestId('entry-kind-YIELD');
        expect(yieldOption).toHaveAttribute('aria-disabled', 'true');
        expect(yieldOption).toHaveAccessibleDescription(
          pt.entryForm.adjustment.yieldNeedsInvestment,
        );

        await pick('entry-account', 'acc-broker');
        expect(screen.getByTestId('entry-kind-YIELD')).not.toHaveAttribute('aria-disabled');
        await userEvent.click(screen.getByTestId('entry-kind-YIELD'));
        await userEvent.type(field('entry-amount'), '20');
        await userEvent.click(screen.getByTestId('entry-direction-INCREASE'));
        await userEvent.type(field('entry-reason'), 'rendimento do mês');
        await userEvent.click(screen.getByTestId('form-save'));

        expect(transactions.creates[0]?.input).toMatchObject({
          accountId: 'acc-broker',
          kind: 'YIELD',
          direction: 'INCREASE',
        });
      });

      it('Dado rendimento marcado, quando troco para uma conta de caixa, então volta para correção', async () => {
        await setup({ accounts: [NUBANK, BROKER], url: '/quick-add?mode=adjustment' });
        await pick('entry-account', 'acc-broker');
        await userEvent.click(screen.getByTestId('entry-kind-YIELD'));

        await pick('entry-account', 'acc-nu');

        expect(screen.getByTestId('entry-kind-CORRECTION')).toHaveAttribute('aria-checked', 'true');
      });
    });

    describe('reembolso', () => {
      const ORIGINAL = aTransaction({
        id: 'orig-1',
        description: 'Jantar fora',
        amount: brl('80.00'),
        date: '2026-10-02',
        category: { id: 'cat-food', name: 'Alimentação' },
      });

      async function setupRefund(gateway = new TransactionsGatewayStub()) {
        gateway.list$ = () => of({ items: [ORIGINAL], hasNext: false, totals: someTotals(1) });
        return setup({ url: '/quick-add?mode=refund', gateway, accounts: [NUBANK, BROKER] });
      }

      it('Dado a busca por descrição, então lista despesas do período e escolher a original trava a categoria na dela', async () => {
        const gateway = new TransactionsGatewayStub();
        await setupRefund(gateway);

        await userEvent.type(field('entry-original-search'), 'jantar');
        const option = await screen.findByTestId('entry-original-option-orig-1');
        expect(option).toHaveTextContent('Jantar fora');
        expect(option).toHaveTextContent('R$');
        expect(gateway.listCalls.at(-1)?.filters).toMatchObject({ type: 'EXPENSE', q: 'jantar' });
        await userEvent.click(option);

        expect(screen.getByTestId('entry-original-chosen')).toHaveTextContent('Jantar fora');
        expect(screen.getByTestId('entry-category')).toHaveTextContent('Alimentação');
        expect(screen.getByTestId('entry-category')).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText(pt.entryForm.refund.categoryLocked)).toBeInTheDocument();
      });

      it('Dado a original escolhida, quando salvo, então o POST leva REFUND com a categoria dela e refundOfTransactionId', async () => {
        const gateway = new TransactionsGatewayStub();
        await setupRefund(gateway);
        await userEvent.type(field('entry-original-search'), 'jantar');
        await userEvent.click(await screen.findByTestId('entry-original-option-orig-1'));

        await userEvent.type(field('entry-amount'), '30');
        await userEvent.click(screen.getByTestId('form-save'));

        expect(gateway.creates[0]?.input).toEqual({
          type: 'REFUND',
          amount: '30.00',
          date: todayIso(),
          description: 'Reembolso: Jantar fora',
          notes: null,
          accountId: 'acc-nu',
          cardId: null,
          categoryId: 'cat-food',
          refundOfTransactionId: 'orig-1',
        });
      });

      it('Dado sem original, então a categoria é escolhida, a conta é só CASH e refundOfTransactionId vai null', async () => {
        const gateway = new TransactionsGatewayStub();
        await setupRefund(gateway);

        await userEvent.click(screen.getByTestId('entry-account'));
        expect(screen.queryByTestId('entry-account-option-acc-broker')).not.toBeInTheDocument();
        await userEvent.click(screen.getByTestId('entry-account'));
        await userEvent.type(field('entry-amount'), '10');
        await pick('entry-category', 'cat-food');
        await userEvent.click(screen.getByTestId('form-save'));

        expect(gateway.creates[0]?.input).toMatchObject({
          type: 'REFUND',
          refundOfTransactionId: null,
          categoryId: 'cat-food',
          description: 'Reembolso',
        });
      });

      it('Dado a original removida, então a categoria volta a ser editável', async () => {
        await setupRefund();
        await userEvent.type(field('entry-original-search'), 'jantar');
        await userEvent.click(await screen.findByTestId('entry-original-option-orig-1'));

        await userEvent.click(screen.getByTestId('entry-original-remove'));

        expect(screen.getByTestId('entry-category')).not.toHaveAttribute('aria-disabled');
        expect(screen.getByTestId('entry-original-search')).toBeInTheDocument();
      });

      it('Dado uma busca sem resultado, então avisa', async () => {
        const gateway = new TransactionsGatewayStub();
        gateway.list$ = () => of({ items: [], hasNext: false, totals: someTotals(0) });
        await setup({ url: '/quick-add?mode=refund', gateway });

        await userEvent.type(field('entry-original-search'), 'xyz');

        expect(await screen.findByTestId('entry-original-empty')).toBeInTheDocument();
      });

      it('Dado 422 REFUND_EXCEEDS_ORIGINAL, então o erro aparece no campo valor', async () => {
        const gateway = new TransactionsGatewayStub();
        gateway.create$ = failWith(422, 'REFUND_EXCEEDS_ORIGINAL');
        await setupRefund(gateway);
        await userEvent.type(field('entry-original-search'), 'jantar');
        await userEvent.click(await screen.findByTestId('entry-original-option-orig-1'));
        await userEvent.type(field('entry-amount'), '999');
        await userEvent.click(screen.getByTestId('form-save'));

        expect(field('entry-amount')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText(pt.errors.codes['REFUND_EXCEEDS_ORIGINAL']!)).toBeInTheDocument();
        expect(field('entry-amount').value).toBe('999,00');
        expect(screen.getByTestId('entry-original-chosen')).toBeInTheDocument();
      });
    });
  });

  it('Dado a tela pronta, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe('QuickAddPage: Crédito, compra no cartão (T67)', () => {
  beforeEach(() => localStorage.clear());

  const ROXINHO = aCard({ id: 'card-1', name: 'Roxinho' });
  const OUTRO = aCard({ id: 'card-2', name: 'Outro' });
  const typeAmount = async (value: string) => {
    await userEvent.clear(field('entry-amount'));
    await userEvent.type(field('entry-amount'), value);
  };

  it('Dado o único cartão ativo, então vem escolhido e o foco inicial é o valor', async () => {
    await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO] });

    expect(screen.getByTestId('entry-card')).toHaveTextContent('Roxinho');
    expect(field('entry-amount')).toHaveFocus();
  });

  it('Dado o último cartão usado (preferência local), então vem escolhido; ?cardId= da URL tem prioridade', async () => {
    localStorage.setItem('moneylog.quickAdd.lastCardId', 'card-2');
    await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO, OUTRO] });
    expect(screen.getByTestId('entry-card')).toHaveTextContent('Outro');
  });

  it('Dado ?cardId= na URL (botão "Nova compra" do cartão), então esse cartão vem escolhido', async () => {
    localStorage.setItem('moneylog.quickAdd.lastCardId', 'card-2');
    await setup({ url: '/quick-add?mode=credit&cardId=card-1', cards: [ROXINHO, OUTRO] });

    expect(screen.getByTestId('entry-card')).toHaveTextContent('Roxinho');
  });

  it('Dado dois cartões e nenhum último usado, então nenhum vem escolhido', async () => {
    await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO, OUTRO] });

    expect(screen.getByTestId('entry-card')).not.toHaveTextContent('Roxinho');
  });

  it('Dado nenhum cartão ativo, então o estado vazio leva a "Adicionar cartão" (mesmo sem conta)', async () => {
    await setup({ url: '/quick-add?mode=credit', cards: [], accounts: [] });

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.quickAdd.empty.noCard.title,
    );
    expect(screen.getByTestId('empty-state-action-add-card')).toHaveAttribute('href', '/cards/new');
  });

  it('Dado GET /v1/cards falhando, então despesa abre normal e nem pede os cartões', async () => {
    const cardsGateway = new CardsGatewayStub();
    cardsGateway.listError = failWith(500, 'INTERNAL_ERROR');
    await setup({ cardsGateway });

    expect(screen.getByTestId('expense-form')).toBeInTheDocument();
    expect(cardsGateway.queries).toHaveLength(0);
  });

  it('Dado GET /v1/cards falhando, então Crédito mostra o erro com "tentar de novo" e recupera', async () => {
    const cardsGateway = new CardsGatewayStub();
    cardsGateway.listError = failWith(500, 'INTERNAL_ERROR');
    await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO], cardsGateway });

    expect(await screen.findByTestId('error-state')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-card')).not.toBeInTheDocument();
    cardsGateway.listError = null;
    await userEvent.click(screen.getByRole('button', { name: pt.errors.load.retry }));

    expect(await screen.findByTestId('entry-card')).toHaveTextContent('Roxinho');
  });

  it('Dado trocar de despesa para Crédito, então os cartões são pedidos só então', async () => {
    const cardsGateway = new CardsGatewayStub();
    const { router, fixture } = await setup({ cards: [ROXINHO], cardsGateway });
    expect(cardsGateway.queries).toHaveLength(0);

    await router.navigate([], { queryParams: { mode: 'credit' } });
    await fixture.whenStable();

    expect(cardsGateway.queries.length).toBeGreaterThan(0);
    expect(await screen.findByTestId('entry-card')).toHaveTextContent('Roxinho');
  });

  it('Dado GET /v1/cards falhando, então o Reembolso continua abrindo (sem opção de cartão)', async () => {
    const cardsGateway = new CardsGatewayStub();
    cardsGateway.listError = failWith(500, 'INTERNAL_ERROR');
    await setup({ url: '/quick-add?mode=refund', cardsGateway });

    expect(screen.getByTestId('refund-form')).toBeInTheDocument();
  });

  it('Dado o formulário, então a ordem é cartão, valor, descrição, categoria, data e parcelas, e só há categorias de despesa', async () => {
    await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO] });

    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('[data-cy="credit-form"] [data-cy]'),
    )
      .map((el) => el.getAttribute('data-cy'))
      .filter((id) =>
        [
          'entry-card',
          'entry-amount',
          'entry-description',
          'entry-category',
          'entry-date',
          'entry-installments',
        ].includes(id ?? ''),
      );
    expect(ids).toEqual([
      'entry-card',
      'entry-amount',
      'entry-description',
      'entry-category',
      'entry-date',
      'entry-installments',
    ]);
    await userEvent.click(screen.getByTestId('entry-category'));
    expect(screen.getByTestId('entry-category-option-cat-food')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-category-option-cat-salary')).not.toBeInTheDocument();
  });

  describe('prévia do backend', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('Dado valor 1.200,00 e 6 parcelas, então mostra as parcelas EXATAMENTE como a resposta (valores diferentes, sem recalcular)', async () => {
      const cardsGateway = new CardsGatewayStub();
      const invoice = (id: string, month: string, due: string) => ({
        id,
        referenceMonth: month,
        closingDate: '2026-10-25',
        dueDate: due,
        status: 'OPEN' as const,
      });
      cardsGateway.purchasePreview$ = of(
        aPurchasePreview({
          total: brl('1200.00'),
          availableLimitAfter: brl('6517.00'),
          installments: [
            {
              number: 1,
              total: 6,
              amount: brl('200.07'),
              competence: '2026-10',
              invoice: invoice('i1', '2026-11', '2026-11-05'),
              lateEntry: false,
            },
            {
              number: 2,
              total: 6,
              amount: brl('199.99'),
              competence: '2026-11',
              invoice: invoice('i2', '2026-12', '2026-12-05'),
              lateEntry: false,
            },
            {
              number: 3,
              total: 6,
              amount: brl('199.98'),
              competence: '2026-12',
              invoice: invoice('i3', '2027-01', '2027-01-05'),
              lateEntry: false,
            },
            {
              number: 4,
              total: 6,
              amount: brl('200.01'),
              competence: '2027-01',
              invoice: invoice('i4', '2027-02', '2027-02-05'),
              lateEntry: false,
            },
            {
              number: 5,
              total: 6,
              amount: brl('199.97'),
              competence: '2027-02',
              invoice: invoice('i5', '2027-03', '2027-03-05'),
              lateEntry: false,
            },
            {
              number: 6,
              total: 6,
              amount: brl('199.98'),
              competence: '2027-03',
              invoice: invoice('i6', '2027-04', '2027-04-05'),
              lateEntry: false,
            },
          ],
        }),
      );
      const { fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
        cardsGateway,
      });

      await typeAmount('1.200,00');
      // Parcelas: o stepper "+" 5 vezes (1 → 6).
      for (let i = 0; i < 5; i++)
        await userEvent.click(screen.getByTestId('entry-installments-increase'));
      expect(screen.getByTestId('purchase-preview-loading')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      const last = cardsGateway.purchaseRequests.at(-1)!;
      expect(last).toEqual({
        cardId: 'card-1',
        request: { amount: '1200.00', installments: 6, date: todayIso() },
      });
      expect(screen.getByTestId('purchase-preview-summary')).toHaveTextContent(
        '6 parcelas, a primeira na fatura de nov/2026 (vence 5 de nov.)',
      );
      const rows = screen.getAllByTestId('purchase-preview-installment');
      expect(
        rows.map((row) =>
          Array.from(row.children)
            .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim())
            .join(' '),
        ),
      ).toEqual([
        '1/6 Fatura de nov/2026, vence 5 de nov. R$ 200,07',
        '2/6 Fatura de dez/2026, vence 5 de dez. R$ 199,99',
        '3/6 Fatura de jan/2027, vence 5 de jan. R$ 199,98',
        '4/6 Fatura de fev/2027, vence 5 de fev. R$ 200,01',
        '5/6 Fatura de mar/2027, vence 5 de mar. R$ 199,97',
        '6/6 Fatura de abr/2027, vence 5 de abr. R$ 199,98',
      ]);
      expect(screen.getByTestId('purchase-preview-available-after')).toHaveTextContent(
        'R$ 6.517,00',
      );
    });

    it('Dado campos incompletos, então nenhuma prévia é pedida', async () => {
      const cardsGateway = new CardsGatewayStub();
      await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO], cardsGateway });

      await vi.advanceTimersByTimeAsync(1000);

      expect(cardsGateway.purchaseRequests).toHaveLength(0);
      expect(screen.queryByTestId('purchase-preview')).not.toBeInTheDocument();
    });

    it('Dado digitar mais no meio da espera, então só a última combinação é pedida (cancela a anterior)', async () => {
      const cardsGateway = new CardsGatewayStub();
      await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO], cardsGateway });

      await typeAmount('10');
      await vi.advanceTimersByTimeAsync(100);
      await typeAmount('1.000,00');
      await vi.advanceTimersByTimeAsync(300);

      expect(cardsGateway.purchaseRequests.map((r) => r.request.amount)).toEqual(['1000.00']);
    });

    it('Dado a prévia pronta, quando digito descrição e escolho categoria, então ela não é refeita nem pisca "calculando"', async () => {
      const cardsGateway = new CardsGatewayStub();
      const { fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
        cardsGateway,
      });
      await typeAmount('100,00');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();
      expect(cardsGateway.purchaseRequests).toHaveLength(1);
      expect(screen.getByTestId('purchase-preview-summary')).toBeInTheDocument();

      await userEvent.type(field('entry-description'), 'Fone');
      await pick('entry-category', 'cat-food');
      fixture.detectChanges();
      expect(screen.queryByTestId('purchase-preview-loading')).not.toBeInTheDocument();
      expect(screen.getByTestId('purchase-preview-summary')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(1000);

      expect(cardsGateway.purchaseRequests).toHaveLength(1);

      await userEvent.click(screen.getByTestId('entry-installments-increase'));
      await vi.advanceTimersByTimeAsync(300);
      expect(cardsGateway.purchaseRequests).toHaveLength(2);
    });

    it('Dado OVER_LIMIT, então avisa "esta compra passa do limite" sem bloquear o salvar', async () => {
      const cardsGateway = new CardsGatewayStub();
      cardsGateway.purchasePreview$ = of(
        aPurchasePreview({
          overLimit: true,
          availableLimitAfter: brl('-100.00'),
          warnings: ['OVER_LIMIT'],
        }),
      );
      const { transactions, fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
        cardsGateway,
      });

      await typeAmount('9.000,00');
      await userEvent.type(field('entry-description'), 'Moto');
      await pick('entry-category', 'cat-food');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(screen.getByTestId('purchase-warning-OVER_LIMIT')).toHaveTextContent(
        'Esta compra passa do limite do cartão.',
      );
      expect(screen.getByTestId('purchase-preview-available-after')).toHaveTextContent(
        '−R$ 100,00',
      );
      expect(screen.getByTestId('form-save')).toBeEnabled();
      await userEvent.click(screen.getByTestId('form-save'));
      expect(transactions.creates).toHaveLength(1);
    });

    it('Dado LATE_ENTRY, então avisa "entra numa fatura já fechada" com a explicação', async () => {
      const cardsGateway = new CardsGatewayStub();
      cardsGateway.purchasePreview$ = of(aPurchasePreview({ warnings: ['LATE_ENTRY'] }));
      const { fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
        cardsGateway,
      });

      await typeAmount('50,00');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(screen.getByTestId('purchase-warning-LATE_ENTRY')).toHaveTextContent(
        'Entra numa fatura já fechada.',
      );
      expect(screen.getByTestId('purchase-warning-LATE_ENTRY')).toHaveTextContent(
        'o banco já tinha cobrado esta compra nessa fatura.',
      );
    });

    it('Dado erro na prévia, então avisa que ainda dá para salvar', async () => {
      const cardsGateway = new CardsGatewayStub();
      cardsGateway.purchasePreview$ = failWith(500, 'INTERNAL_ERROR');
      const { fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
        cardsGateway,
      });

      await typeAmount('50,00');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(screen.getByTestId('purchase-preview-unavailable')).toHaveTextContent(
        pt.cards.purchase.preview.unavailable,
      );
    });
  });

  describe('salvar', () => {
    const fillPurchase = async () => {
      await typeAmount('1.200,00');
      await userEvent.type(field('entry-description'), 'Notebook');
      await pick('entry-category', 'cat-food');
      for (let i = 0; i < 5; i++)
        await userEvent.click(screen.getByTestId('entry-installments-increase'));
    };

    it('Dado o salvar, então o POST leva CARD_PURCHASE com cardId e parcelas, sem accountId, e uma Idempotency-Key', async () => {
      const { transactions, fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
      });
      await fillPurchase();

      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates).toHaveLength(1);
      expect(transactions.creates[0]?.input).toEqual({
        type: 'CARD_PURCHASE',
        amount: '1200.00',
        date: todayIso(),
        description: 'Notebook',
        notes: null,
        cardId: 'card-1',
        categoryId: 'cat-food',
        installments: 6,
      });
      expect(transactions.creates[0]?.input).not.toHaveProperty('accountId');
      expect(transactions.creates[0]?.key).toBeTruthy();
    });

    it('Dado sucesso, então o aviso oferece "Ver fatura" (a da 1ª parcela), lembra o cartão e limpa valor e descrição', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = of(
        aTransaction({
          type: 'CARD_PURCHASE',
          description: 'Notebook',
          amount: brl('1200.00'),
          card: { id: 'card-1', name: 'Roxinho' },
          account: null,
          installments: [
            {
              number: 1,
              total: 6,
              amount: brl('200.00'),
              competence: '2026-10',
              invoiceId: 'inv-nov',
              invoiceReferenceMonth: '2026-11',
              invoiceDueDate: '2026-11-05',
              status: 'PENDING',
              lateEntry: false,
            },
          ],
        }),
      );
      const { router, toast, fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO, OUTRO],
        gateway,
      });
      await pick('entry-card', 'card-1');
      await fillPurchase();

      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      const message = toast.toasts()[0]!;
      expect(message.message.replace(/\s/g, ' ')).toBe('Registrado: Notebook, R$ 1.200,00.');
      expect(message.actions.map((a) => a.label)).toEqual(['Ver fatura', 'Novo registro']);

      expect(localStorage.getItem('moneylog.quickAdd.lastCardId')).toBe('card-1');
      expect(field('entry-amount').value).toBe('');
      expect(field('entry-description').value).toBe('');
      message.actions[0]!.run();
      await fixture.whenStable();
      expect(router.url).toBe('/cards/card-1/invoices/inv-nov');
    });

    it('Dado 422 por campo, então o erro vai ao campo e o digitado fica', async () => {
      const gateway = new TransactionsGatewayStub();
      gateway.create$ = failWith(422, 'CARD_INVALID_INSTALLMENT_COUNT');
      const { fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
        gateway,
      });
      await fillPurchase();

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(
        screen.getByText(pt.errors.codes['CARD_INVALID_INSTALLMENT_COUNT']!),
      ).toBeInTheDocument();
      expect(field('entry-description').value).toBe('Notebook');
      expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
    });

    it('Dado campos vazios, então os erros de UX aparecem e nada é enviado', async () => {
      const { transactions, fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO, OUTRO],
      });

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(transactions.creates).toHaveLength(0);
      expect(field('entry-amount')).toHaveAttribute('aria-invalid', 'true');
      expect(field('entry-description')).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('Dado o teclado, então Tab segue cartão → valor → descrição → categoria → data → parcelas e Enter na última salva', async () => {
      const { transactions, fixture } = await setup({
        url: '/quick-add?mode=credit',
        cards: [ROXINHO],
      });
      await userEvent.type(field('entry-amount'), '300,00');
      await userEvent.tab();
      expect(field('entry-description')).toHaveFocus();
      await userEvent.type(field('entry-description'), 'Fone');
      await pick('entry-category', 'cat-food');
      field('entry-installments').focus();

      await userEvent.keyboard('{Enter}');
      await fixture.whenStable();

      expect(transactions.creates).toHaveLength(1);
      expect(transactions.creates[0]?.input).toMatchObject({ installments: 1, amount: '300.00' });
    });
  });

  it('Dado o formulário de crédito, então os campos têm fonte de pelo menos 16 px (sem zoom do Safari)', async () => {
    await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO] });

    // A regra `.input` do tema fixa 1rem; o stepper usa a mesma classe.
    for (const id of ['entry-amount', 'entry-description', 'entry-installments']) {
      expect(field(id).className).toMatch(/input|stepper/);
    }
  });

  it('Dado o formulário, então o axe não aponta violações', async () => {
    const { container } = await setup({ url: '/quick-add?mode=credit', cards: [ROXINHO] });

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe('QuickAddPage: reembolso no cartão (T70 CA4)', () => {
  beforeEach(() => localStorage.clear());

  const ROXINHO = aCard({ id: 'card-1', name: 'Roxinho' });
  const typeAmount = async (value: string) => {
    await userEvent.clear(field('entry-amount'));
    await userEvent.type(field('entry-amount'), value);
  };

  it('Dado cartões ativos, então o reembolso oferece conta OU cartão (segmentado) e começa na conta', async () => {
    await setup({ url: '/quick-add?mode=refund', cards: [ROXINHO] });

    expect(screen.getByTestId('entry-refund-target-account')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('entry-refund-target-card')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('entry-account')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-card')).not.toBeInTheDocument();
  });

  it('Dado nenhum cartão, então a escolha não aparece e o reembolso é sempre em conta', async () => {
    await setup({ url: '/quick-add?mode=refund', cards: [] });

    expect(screen.queryByTestId('entry-refund-target')).not.toBeInTheDocument();
    expect(screen.getByTestId('entry-account')).toBeInTheDocument();
  });

  it('Dado "Cartão", então o campo de conta some e o de cartão aparece (nunca os dois)', async () => {
    await setup({ url: '/quick-add?mode=refund', cards: [ROXINHO] });

    await userEvent.click(screen.getByTestId('entry-refund-target-card'));

    expect(screen.getByTestId('entry-card')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-account')).not.toBeInTheDocument();
  });

  it('Dado reembolso no cartão, quando salvo, então o POST leva cardId e accountId null (crédito na fatura)', async () => {
    const { transactions, fixture } = await setup({
      url: '/quick-add?mode=refund',
      cards: [ROXINHO],
    });
    await typeAmount('30,00');
    await pick('entry-category', 'cat-food');
    await userEvent.click(screen.getByTestId('entry-refund-target-card'));

    await userEvent.click(screen.getByTestId('form-save'));
    await fixture.whenStable();

    expect(transactions.creates[0]?.input).toMatchObject({
      type: 'REFUND',
      amount: '30.00',
      cardId: 'card-1',
      accountId: null,
      categoryId: 'cat-food',
    });
  });

  it('Dado reembolso em conta, então o POST leva accountId e cardId null', async () => {
    const { transactions, fixture } = await setup({
      url: '/quick-add?mode=refund',
      cards: [ROXINHO],
    });
    await typeAmount('30,00');
    await pick('entry-category', 'cat-food');

    await userEvent.click(screen.getByTestId('form-save'));
    await fixture.whenStable();

    expect(transactions.creates[0]?.input).toMatchObject({
      type: 'REFUND',
      accountId: 'acc-nu',
      cardId: null,
    });
  });
});
