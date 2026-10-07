import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

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
import { CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { aDebt, DebtsGatewayStub, provideDebtsStub } from '~/testing/debts-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';
import { todayIso } from '~/util/date';

vi.setConfig({ testTimeout: 30_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

const NUBANK = anAccount({ id: 'acc-nu', name: 'Nubank' });
const JOAO = aPerson({ id: 'person-1', name: 'João' });
const MARIA = aPerson({ id: 'person-2', name: 'Maria' });

interface Options {
  readonly url?: string;
  readonly accounts?: ReturnType<typeof anAccount>[];
  readonly people?: PeopleGatewayStub;
  readonly debts?: DebtsGatewayStub;
  readonly transactions?: TransactionsGatewayStub;
}

async function setup({
  url = '/quick-add?mode=loan',
  accounts = [NUBANK],
  people = new PeopleGatewayStub(),
  debts = new DebtsGatewayStub(),
  transactions = new TransactionsGatewayStub(),
}: Options = {}) {
  if (people.people.length === 0) people.people = [JOAO, MARIA];
  const accountsStub = new AccountsGatewayStub();
  accountsStub.accounts = accounts;
  const categories = new CategoriesGatewayStub();
  categories.categories = [aCategory({ id: 'cat-food', name: 'Alimentação' })];
  const result = await render(App, {
    initialRoute: url,
    routes: [
      { path: 'quick-add', component: QuickAddPage },
      { path: 'transactions/:id', component: DummyComponent },
      { path: 'debts/:id', component: DummyComponent },
      { path: 'accounts/new', component: DummyComponent },
    ],
    providers: [
      provideI18nTesting('pt'),
      provideTransactionsStub(transactions),
      provideAccountsStub(accountsStub),
      provideCategoriesStub(categories),
      providePeopleStub(people),
      provideDebtsStub(debts),
      provideCardsStub(new CardsGatewayStub()),
    ],
  });
  await result.fixture.whenStable();
  return {
    ...result,
    people,
    debts,
    transactions,
    router: TestBed.inject(Router),
    toast: TestBed.inject(ToastService),
  };
}

const message = (toast: ToastService) => toast.toasts()[0]?.message.replace(/\u00a0/g, ' ');
const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};

const loanTransaction = () =>
  aTransaction({
    type: 'LOAN_GIVEN',
    description: 'Empréstimo para João',
    amount: brl('300.00'),
    category: null,
    method: null,
    debt: {
      id: 'debt-9',
      person: { id: 'person-1', name: 'João' },
      direction: 'RECEIVABLE',
      status: 'OPEN',
      principal: brl('300.00'),
      settled: brl('0.00'),
      outstanding: brl('300.00'),
      date: todayIso(),
      expectedDate: null,
      overdue: false,
      description: 'Empréstimo para João',
    },
  });

describe('QuickAddPage: pessoas e dívidas (Etapa 4)', () => {
  beforeEach(() => localStorage.clear());

  describe('seletor de modos', () => {
    it('Dado o grupo "Pessoas e dívidas", então oferece Dinheiro emprestado, Dinheiro recebido e Nova dívida', async () => {
      await setup({ url: '/quick-add' });

      await userEvent.click(screen.getByTestId('quick-add-people'));

      expect(screen.getByTestId('quick-add-people')).toHaveAttribute('aria-expanded', 'true');
      for (const mode of ['loan', 'received', 'debt']) {
        expect(screen.getByTestId(`quick-add-people-mode-${mode}`)).toBeInTheDocument();
      }
    });

    it.each([
      ['loan', 'loan-form'],
      ['received', 'received-form'],
      ['debt', 'debt-form'],
    ])('Dado ?mode=%s, então abre o formulário certo e o grupo fica aberto', async (mode, form) => {
      await setup({ url: `/quick-add?mode=${mode}` });

      expect(await screen.findByTestId(form)).toBeInTheDocument();
      expect(screen.getByTestId(`quick-add-people-mode-${mode}`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  describe('Dinheiro emprestado', () => {
    it('Dado o formulário, então explica que não é despesa e pede pessoa, valor, conta, data, previsão e descrição', async () => {
      await setup();

      expect(screen.getByTestId('loan-help')).toHaveTextContent('Não é despesa');
      for (const id of [
        'loan-amount',
        'loan-person',
        'loan-account',
        'loan-date',
        'loan-expected-date',
        'loan-description',
      ]) {
        expect(screen.getByTestId(id)).toBeInTheDocument();
      }
    });

    it('Dado pessoa existente, quando salvo, então envia LOAN_GIVEN com newDebt e uma Idempotency-Key, e o aviso leva à dívida devolvida', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = of(loanTransaction());
      const { router, toast, fixture } = await setup({ transactions });

      await userEvent.type(field('loan-amount'), '300,00');
      await pick('loan-person', 'person-1');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates).toHaveLength(1);
      expect(transactions.creates[0]?.input).toEqual({
        type: 'LOAN_GIVEN',
        amount: '300.00',
        date: todayIso(),
        description: 'Empréstimo para João',
        notes: null,
        accountId: 'acc-nu',
        newDebt: { personId: 'person-1', expectedDate: null, description: null },
      });
      expect(transactions.creates[0]?.key).toBeTruthy();
      expect(message(toast)).toBe('Empréstimo de R$ 300,00 para João registrado.');
      const view = toast.toasts()[0]?.actions?.find((action) => action.id === 'view');
      expect(view?.label).toBe(pt.quickAdd.toast.viewDebt);
      view?.run();
      await waitFor(() => expect(router.url).toBe('/debts/debt-9'));
    });

    it('Dado a previsão e a descrição, então vão no corpo', async () => {
      const { transactions, fixture } = await setup();

      await userEvent.type(field('loan-amount'), '50,00');
      await pick('loan-person', 'person-2');
      await userEvent.type(field('loan-expected-date'), '20/10/2026');
      await userEvent.type(field('loan-description'), 'Carona do mês');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates[0]?.input).toMatchObject({
        description: 'Carona do mês',
        newDebt: { personId: 'person-2', expectedDate: '2026-10-20' },
      });
    });

    it('Dado ?personId=, então a pessoa já vem escolhida', async () => {
      await setup({ url: '/quick-add?mode=loan&personId=person-2' });

      expect(screen.getByTestId('loan-person')).toHaveTextContent('Maria');
    });

    it('Dado "Nova pessoa…", quando crio, então POST /v1/people sai ANTES da movimentação e a nova pessoa fica escolhida (S-138)', async () => {
      const people = new PeopleGatewayStub();
      const { transactions, fixture } = await setup({ people });

      await userEvent.type(field('loan-amount'), '80,00');
      await pick('loan-person', '__new-person__');
      expect(transactions.creates).toHaveLength(0);
      await userEvent.type(field('loan-person-new-name'), 'Ana');
      await userEvent.click(screen.getByTestId('loan-person-new-create'));
      await fixture.whenStable();

      expect(people.creates).toEqual([{ name: 'Ana', notes: null }]);
      expect(screen.getByTestId('loan-person')).toHaveTextContent('Ana');
      expect(screen.queryByTestId('loan-person-new')).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId('form-save'));
      expect(transactions.creates[0]?.input).toMatchObject({
        type: 'LOAN_GIVEN',
        newDebt: { personId: 'person-new' },
      });
    });

    it('Dado nome igual ao de uma pessoa existente, então avisa que já existe, sem bloquear', async () => {
      const people = new PeopleGatewayStub();
      await setup({ people });

      await pick('loan-person', '__new-person__');
      await userEvent.type(field('loan-person-new-name'), 'joao');

      expect(screen.getByTestId('loan-person-homonym')).toHaveTextContent(pt.people.picker.homonym);
      expect(screen.getByTestId('loan-person-new-create')).toBeEnabled();
    });

    it('Dado falha ao criar a pessoa, então mostra o erro traduzido e nenhuma movimentação sai', async () => {
      const people = new PeopleGatewayStub();
      people.next = failWith(422, 'PERSON_NAME_REQUIRED');
      const { transactions } = await setup({ people });

      await pick('loan-person', '__new-person__');
      await userEvent.type(field('loan-person-new-name'), 'Ana');
      await userEvent.click(screen.getByTestId('loan-person-new-create'));

      expect(screen.getByTestId('loan-person-new-error')).toHaveTextContent(
        pt.errors.codes['PERSON_NAME_REQUIRED']!,
      );
      expect(transactions.creates).toHaveLength(0);
    });

    it('Dado Enter no nome da nova pessoa, então cria a pessoa e não envia o formulário inteiro', async () => {
      const people = new PeopleGatewayStub();
      const { transactions } = await setup({ people });

      await pick('loan-person', '__new-person__');
      await userEvent.type(field('loan-person-new-name'), 'Ana{Enter}');

      expect(people.creates).toHaveLength(1);
      expect(transactions.creates).toHaveLength(0);
    });

    it('Dado "Escolher uma pessoa existente", então fecha o nome e volta ao seletor', async () => {
      await setup();

      await pick('loan-person', '__new-person__');
      await userEvent.click(screen.getByTestId('loan-person-new-cancel'));

      expect(screen.queryByTestId('loan-person-new')).not.toBeInTheDocument();
    });

    it('Dado erro de rede, então "tentar de novo" reenvia com a MESMA chave e a pessoa criada não é criada de novo', async () => {
      const people = new PeopleGatewayStub();
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = failWith(0, 'NETWORK');
      const { fixture } = await setup({ people, transactions });
      await userEvent.type(field('loan-amount'), '80,00');
      await pick('loan-person', '__new-person__');
      await userEvent.type(field('loan-person-new-name'), 'Ana');
      await userEvent.click(screen.getByTestId('loan-person-new-create'));
      await fixture.whenStable();

      await userEvent.click(screen.getByTestId('form-save'));
      transactions.create$ = of(loanTransaction());
      await userEvent.click(screen.getByTestId('form-retry'));

      expect(transactions.creates).toHaveLength(2);
      expect(transactions.creates[1]?.key).toBe(transactions.creates[0]?.key);
      expect(people.creates).toHaveLength(1);
    });

    it('Dado PERSON_ARCHIVED do backend, então o erro vai ao campo da pessoa', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = failWith(422, 'PERSON_ARCHIVED');
      const { fixture } = await setup({ transactions });
      await userEvent.type(field('loan-amount'), '80,00');
      await pick('loan-person', 'person-1');

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(screen.getByText(pt.errors.codes['PERSON_ARCHIVED']!)).toBeInTheDocument();
      expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
    });

    it('Dado o clique duplo, então uma requisição só', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = NEVER as never;
      await setup({ transactions });
      await userEvent.type(field('loan-amount'), '80,00');
      await pick('loan-person', 'person-1');

      await userEvent.dblClick(screen.getByTestId('form-save'));

      expect(transactions.creates).toHaveLength(1);
    });

    it('Dado nenhuma conta, então pede para cadastrar uma conta', async () => {
      await setup({ accounts: [] });

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.quickAdd.empty.noAccount.title,
      );
    });

    it('Dado a falha ao carregar as pessoas, então mostra o erro com "tentar de novo" e os demais modos seguem', async () => {
      const people = new PeopleGatewayStub();
      people.listError = failWith(0, 'NETWORK');
      await setup({ people });

      expect(screen.getByTestId('error-state')).toBeInTheDocument();
      people.listError = null;
      people.people = [JOAO];
      await userEvent.click(screen.getByTestId('empty-state-action-retry'));
      expect(await screen.findByTestId('loan-form')).toBeInTheDocument();
    });

    it('Dado o formulário, então o axe não aponta violações', async () => {
      const { container } = await setup();

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe('Dinheiro recebido', () => {
    const debts = () => {
      const stub = new DebtsGatewayStub();
      stub.debts = [
        aDebt({ id: 'debt-1', outstanding: brl('200.00') }),
        aDebt({
          id: 'debt-2',
          person: { id: 'person-2', name: 'Maria' },
          description: 'Aluguel adiantado',
          outstanding: brl('75.50'),
        }),
        aDebt({ id: 'debt-3', status: 'SETTLED', outstanding: brl('0.00') }),
        aDebt({ id: 'debt-4', direction: 'PAYABLE' }),
      ];
      return stub;
    };

    it('Dado devolução, então só oferece dívidas "me devem" em aberto, com o saldo do backend', async () => {
      await setup({ url: '/quick-add?mode=received', debts: debts() });

      expect(screen.getByTestId('received-help')).toHaveTextContent('não é receita');
      await userEvent.click(screen.getByTestId('received-debt'));
      expect(screen.getByTestId('received-debt-option-debt-1')).toHaveTextContent(
        'João · Empréstimo · falta R$ 200,00',
      );
      expect(screen.getByTestId('received-debt-option-debt-2')).toBeInTheDocument();
      expect(screen.queryByTestId('received-debt-option-debt-3')).not.toBeInTheDocument();
      expect(screen.queryByTestId('received-debt-option-debt-4')).not.toBeInTheDocument();
    });

    it('Dado escolher a dívida, então o valor sugerido é o outstanding do backend e o envio é MONEY_RECEIVED com debtId', async () => {
      const { transactions, fixture } = await setup({
        url: '/quick-add?mode=received',
        debts: debts(),
      });

      await pick('received-debt', 'debt-2');
      expect(field('received-amount').value).toBe('75,50');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates[0]?.input).toEqual({
        type: 'MONEY_RECEIVED',
        amount: '75.50',
        date: todayIso(),
        description: 'Devolução de Maria',
        notes: null,
        accountId: 'acc-nu',
        debtId: 'debt-2',
        newDebt: null,
      });
    });

    it('Dado a carga de "Receber", então o status em aberto vai ao backend (nada de baixar o histórico para filtrar no cliente)', async () => {
      const stub = debts();
      await setup({ url: '/quick-add?mode=received', debts: stub });

      expect(stub.queries.length).toBeGreaterThan(0);
      for (const query of stub.queries) {
        expect(query.direction).toBe('RECEIVABLE');
        expect(['OPEN', 'PARTIALLY_SETTLED']).toContain(query.status);
      }
      expect(stub.queries.map((q) => q.status)).toEqual(
        expect.arrayContaining(['OPEN', 'PARTIALLY_SETTLED']),
      );
    });

    it('Dado emprestar com "Receber" já carregado, então a dívida nova aparece em "Receber" (recarga silenciosa)', async () => {
      const stub = debts();
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = of(loanTransaction());
      const { fixture } = await setup({
        url: '/quick-add?mode=received',
        debts: stub,
        transactions,
      });
      const before = stub.queries.length;
      await userEvent.click(screen.getByTestId('quick-add-people'));
      await userEvent.click(screen.getByTestId('quick-add-people-mode-loan'));
      await screen.findByTestId('loan-form');
      await userEvent.type(field('loan-amount'), '300,00');
      await pick('loan-person', 'person-1');
      stub.debts = [
        aDebt({ id: 'debt-9', description: 'Empréstimo para João', outstanding: brl('300.00') }),
        ...stub.debts,
      ];

      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(stub.queries.length).toBeGreaterThan(before);
      await userEvent.click(screen.getByTestId('quick-add-people'));
      await userEvent.click(screen.getByTestId('quick-add-people-mode-received'));
      await userEvent.click(await screen.findByTestId('received-debt'));
      expect(screen.getByTestId('received-debt-option-debt-9')).toHaveTextContent(
        'falta R$ 300,00',
      );
    });

    it('Dado receber uma devolução, então o "Falta R$" e o valor sugerido da mesma dívida passam a ser os do backend', async () => {
      const stub = debts();
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = of(
        aTransaction({
          type: 'MONEY_RECEIVED',
          amount: brl('100.00'),
          debt: { ...loanTransaction().debt!, id: 'debt-1', outstanding: brl('100.00') },
        }),
      );
      const { fixture } = await setup({
        url: '/quick-add?mode=received&personId=person-1',
        debts: stub,
        transactions,
      });
      expect(field('received-amount')).toHaveAccessibleDescription(/R\$\s200,00/);
      await userEvent.clear(field('received-amount'));
      await userEvent.type(field('received-amount'), '100,00');
      // O backend, depois da devolução, devolve o saldo novo da dívida.
      stub.debts = stub.debts.map((d) =>
        d.id === 'debt-1' ? { ...d, outstanding: brl('100.00') } : d,
      );

      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(field('received-amount')).toHaveAccessibleDescription(/R\$\s100,00/);
      expect(field('received-amount').value).toBe('100,00');
    });

    it('Dado ?personId=, então só as dívidas dessa pessoa; com uma só, ela já vem escolhida e o valor sugerido', async () => {
      await setup({ url: '/quick-add?mode=received&personId=person-2', debts: debts() });

      expect(screen.getByTestId('received-debt')).toHaveTextContent('Maria');
      expect(field('received-amount').value).toBe('75,50');
    });

    it('Dado valor maior que o saldo, então o erro do backend vai ao campo do valor, sem o front calcular', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = failWith(422, 'DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING');
      const { fixture } = await setup({
        url: '/quick-add?mode=received&personId=person-1',
        debts: debts(),
        transactions,
      });
      await userEvent.clear(field('received-amount'));
      await userEvent.type(field('received-amount'), '999,00');

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(transactions.creates[0]?.input.amount).toBe('999.00');
      expect(
        screen.getByText(pt.errors.codes['DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING']!),
      ).toBeInTheDocument();
    });

    it('Dado ninguém devendo, então explica e não trava o formulário', async () => {
      await setup({ url: '/quick-add?mode=received' });

      expect(screen.getByTestId('received-no-debts')).toHaveTextContent(
        pt.lending.received.noOpenDebts,
      );
    });

    it('Dado "Empréstimo recebido", então pede a pessoa e envia MONEY_RECEIVED com newDebt (cria uma dívida minha)', async () => {
      const { transactions, fixture } = await setup({ url: '/quick-add?mode=received' });

      await userEvent.click(screen.getByTestId('received-kind-borrowed'));
      expect(screen.queryByTestId('received-debt')).not.toBeInTheDocument();
      await userEvent.type(field('received-amount'), '120,00');
      await pick('received-person', 'person-2');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates[0]?.input).toMatchObject({
        type: 'MONEY_RECEIVED',
        amount: '120.00',
        debtId: null,
        newDebt: { personId: 'person-2', expectedDate: null },
        description: 'Empréstimo de Maria',
      });
    });

    it('Dado a devolução registrada, então o aviso diz que não conta como receita e leva à dívida', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = of(
        aTransaction({
          type: 'MONEY_RECEIVED',
          amount: brl('100.00'),
          debt: { ...loanTransaction().debt!, outstanding: brl('200.00') },
        }),
      );
      const { toast, fixture } = await setup({
        url: '/quick-add?mode=received&personId=person-1',
        debts: debts(),
        transactions,
      });
      await userEvent.clear(field('received-amount'));
      await userEvent.type(field('received-amount'), '100,00');

      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(message(toast)).toBe('Devolução de R$ 100,00 registrada. Não conta como receita.');
      expect(toast.toasts()[0]?.actions?.[0]?.label).toBe(pt.quickAdd.toast.viewDebt);
    });
  });

  describe('Nova dívida (sem movimentação)', () => {
    it('Dado o formulário, então explica que não mexe no saldo das contas e funciona sem nenhuma conta', async () => {
      await setup({ url: '/quick-add?mode=debt', accounts: [] });

      expect(screen.getByTestId('debt-no-movement')).toHaveTextContent(
        'não mexe no saldo das contas',
      );
      expect(screen.queryByTestId('empty-state-title')).not.toBeInTheDocument();
    });

    it('Dado "Me devem", então não há categoria; em "Eu devo", a categoria aparece (S-137)', async () => {
      await setup({ url: '/quick-add?mode=debt' });

      expect(screen.queryByTestId('debt-category')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('debt-direction-PAYABLE'));
      expect(screen.getByTestId('debt-category')).toBeInTheDocument();
    });

    it('Dado "Me devem", quando salvo, então cria a dívida sem categoria e o aviso leva a ela', async () => {
      const debts = new DebtsGatewayStub();
      const { toast, fixture } = await setup({ url: '/quick-add?mode=debt', debts });

      await userEvent.type(field('debt-principal'), '80,00');
      await pick('debt-person', 'person-1');
      await userEvent.type(field('debt-description'), 'Ingresso');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(debts.creates).toEqual([
        {
          personId: 'person-1',
          direction: 'RECEIVABLE',
          principal: '80.00',
          date: todayIso(),
          expectedDate: null,
          description: 'Ingresso',
          categoryId: null,
        },
      ]);
      expect(message(toast)).toBe('Dívida de R$ 80,00 com João registrada.');
      expect(toast.toasts()[0]?.actions?.[0]?.label).toBe(pt.quickAdd.toast.viewDebt);
    });

    it('Dado "Eu devo" com categoria, então a categoria vai no corpo', async () => {
      const debts = new DebtsGatewayStub();
      const { fixture } = await setup({ url: '/quick-add?mode=debt', debts });

      await userEvent.click(screen.getByTestId('debt-direction-PAYABLE'));
      await userEvent.type(field('debt-principal'), '60,00');
      await pick('debt-person', 'person-2');
      await userEvent.type(field('debt-description'), 'Jantar que a Maria pagou');
      await pick('debt-category', 'cat-food');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(debts.creates[0]).toMatchObject({
        direction: 'PAYABLE',
        categoryId: 'cat-food',
        principal: '60.00',
      });
    });

    it('Dado descrição vazia, então o erro é do campo e nada é enviado', async () => {
      const debts = new DebtsGatewayStub();
      await setup({ url: '/quick-add?mode=debt', debts });
      await userEvent.type(field('debt-principal'), '80,00');
      await pick('debt-person', 'person-1');

      await userEvent.click(screen.getByTestId('form-save'));

      expect(debts.creates).toHaveLength(0);
      expect(field('debt-description')).toHaveAttribute('aria-invalid', 'true');
    });

    it('Dado DEBT_CATEGORY_NOT_ALLOWED do backend, então o erro vai ao campo da categoria', async () => {
      const debts = new DebtsGatewayStub();
      debts.next = failWith(422, 'DEBT_CATEGORY_NOT_ALLOWED');
      const { fixture } = await setup({ url: '/quick-add?mode=debt', debts });
      await userEvent.click(screen.getByTestId('debt-direction-PAYABLE'));
      await userEvent.type(field('debt-principal'), '60,00');
      await pick('debt-person', 'person-2');
      await userEvent.type(field('debt-description'), 'Jantar');
      await pick('debt-category', 'cat-food');

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(screen.getByText(pt.errors.codes['DEBT_CATEGORY_NOT_ALLOWED']!)).toBeInTheDocument();
    });

    it('Dado erro de rede, então oferece "tentar de novo" com o mesmo corpo', async () => {
      const debts = new DebtsGatewayStub();
      debts.next = failWith(0, 'NETWORK');
      await setup({ url: '/quick-add?mode=debt', debts });
      await userEvent.type(field('debt-principal'), '80,00');
      await pick('debt-person', 'person-1');
      await userEvent.type(field('debt-description'), 'Ingresso');

      await userEvent.click(screen.getByTestId('form-save'));
      debts.next = null;
      await userEvent.click(screen.getByTestId('form-retry'));

      expect(debts.creates).toHaveLength(2);
      expect(debts.creates[1]).toEqual(debts.creates[0]);
    });

    it('Dado "Nova dívida", então envia uma Idempotency-Key; "tentar de novo" e "Salvar" no mesmo corpo reusam a chave, corpo novo troca', async () => {
      const debts = new DebtsGatewayStub();
      debts.next = failWith(0, 'NETWORK');
      await setup({ url: '/quick-add?mode=debt', debts });
      await userEvent.type(field('debt-principal'), '80,00');
      await pick('debt-person', 'person-1');
      await userEvent.type(field('debt-description'), 'Ingresso');

      await userEvent.click(screen.getByTestId('form-save'));
      await userEvent.click(screen.getByTestId('form-retry'));
      await userEvent.click(screen.getByTestId('form-save'));
      await userEvent.clear(field('debt-principal'));
      await userEvent.type(field('debt-principal'), '90,00');
      await userEvent.click(screen.getByTestId('form-save'));

      expect(debts.createKeys).toHaveLength(4);
      expect(new Set(debts.createKeys.slice(0, 3)).size).toBe(1);
      expect(debts.createKeys[3]).not.toBe(debts.createKeys[0]);
    });

    it('Dado 409 CONFLICT (trava ocupada), então também oferece "tentar de novo" com a mesma chave', async () => {
      const debts = new DebtsGatewayStub();
      debts.next = failWith(409, 'CONFLICT');
      await setup({ url: '/quick-add?mode=debt', debts });
      await userEvent.type(field('debt-principal'), '80,00');
      await pick('debt-person', 'person-1');
      await userEvent.type(field('debt-description'), 'Ingresso');

      await userEvent.click(screen.getByTestId('form-save'));
      debts.next = null;
      await userEvent.click(screen.getByTestId('form-retry'));

      expect(debts.createKeys).toHaveLength(2);
      expect(debts.createKeys[1]).toBe(debts.createKeys[0]);
    });

    it('Dado uma dívida "Me devem" criada aqui, então ela aparece em "Receber" sem recarregar a página', async () => {
      const debts = new DebtsGatewayStub();
      const { fixture } = await setup({ url: '/quick-add?mode=received', debts });
      // "Receber" já carregou (lista vazia); agora crio uma dívida "Me devem" no outro modo.
      await userEvent.click(screen.getByTestId('quick-add-people'));
      await userEvent.click(screen.getByTestId('quick-add-people-mode-debt'));
      await screen.findByTestId('debt-form');
      await userEvent.type(field('debt-principal'), '80,00');
      await pick('debt-person', 'person-1');
      await userEvent.type(field('debt-description'), 'Ingresso');
      debts.debts = [aDebt({ id: 'debt-new', description: 'Ingresso', outstanding: brl('80.00') })];
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      await userEvent.click(screen.getByTestId('quick-add-people'));
      await userEvent.click(screen.getByTestId('quick-add-people-mode-received'));
      await userEvent.click(await screen.findByTestId('received-debt'));

      expect(screen.getByTestId('received-debt-option-debt-new')).toHaveTextContent(
        'falta R$ 80,00',
      );
    });

    it('Dado o formulário, então o axe não aponta violações', async () => {
      const { container } = await setup({ url: '/quick-add?mode=debt' });

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe('Dividir com alguém (despesa dividida)', () => {
    const amountOf = (index: number) => field(`entry-share-amount-${index}`);
    const splitTransaction = () =>
      aTransaction({
        id: 'tx-split',
        amount: brl('200.00'),
        description: 'Jantar',
        shares: [{ ...loanTransaction().debt!, id: 'debt-share-1', principal: brl('100.00') }],
        impact: {
          cash: brl('-200.00'),
          consumption: [{ competence: '2026-10', amount: brl('100.00') }],
          netWorth: brl('-100.00'),
          commitment: brl('0.00'),
        },
      });

    it('Dado Despesa, Pix e Débito, então oferece "Dividir com alguém"; em Receita, não', async () => {
      await setup({ url: '/quick-add' });
      expect(screen.getByTestId('entry-split')).toHaveTextContent(pt.lending.shares.toggle);

      await userEvent.click(screen.getByTestId('quick-add-mode-income'));
      await waitFor(() => expect(screen.queryByTestId('entry-split')).not.toBeInTheDocument());
    });

    it('Dado que ainda não ligou a divisão, então nenhuma pessoa é pedida ao backend', async () => {
      const people = new PeopleGatewayStub();
      await setup({ url: '/quick-add', people });

      expect(people.queries).toHaveLength(0);
    });

    it('Dado ligar a divisão, então carrega as pessoas e abre a primeira parte, sem nenhum valor calculado na tela', async () => {
      const people = new PeopleGatewayStub();
      await setup({ url: '/quick-add', people });

      await userEvent.type(field('entry-amount'), '200,00');
      await userEvent.click(screen.getByTestId('entry-split'));

      expect(people.queries).toHaveLength(1);
      expect(screen.getByTestId('entry-share-0')).toBeInTheDocument();
      // O front não mostra "seu gasto", total das partes nem o que sobra: só o que foi digitado.
      expect(screen.queryByText(/seu gasto|sobra|resto/i)).not.toBeInTheDocument();
    });

    it('Dado despesa de 200,00 dividida com João (100,00), então o corpo leva shares com o valor digitado e o aviso leva ao detalhe', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = of(splitTransaction());
      const { toast, router, fixture } = await setup({ url: '/quick-add', transactions });

      await userEvent.type(field('entry-amount'), '200,00');
      await userEvent.type(field('entry-description'), 'Jantar');
      await pick('entry-category', 'cat-food');
      await pick('entry-method', 'PIX');
      await userEvent.click(screen.getByTestId('entry-split'));
      await pick('entry-share-person-0', 'person-1');
      await userEvent.type(amountOf(0), '100,00');
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates[0]?.input).toMatchObject({
        type: 'EXPENSE',
        amount: '200.00',
        shares: [
          {
            amount: '100.00',
            newDebt: { personId: 'person-1', expectedDate: null, description: null },
          },
        ],
      });
      expect(message(toast)).toBe(pt.lending.shares.toast);
      const view = toast.toasts()[0]?.actions?.find((action) => action.id === 'view');
      expect(view?.label).toBe(pt.quickAdd.toast.viewDetails);
      view?.run();
      await waitFor(() => expect(router.url).toBe('/transactions/tx-split'));
    });

    it('Dado desligar a divisão, então as partes somem e o corpo não leva shares', async () => {
      const { transactions, fixture } = await setup({ url: '/quick-add' });

      await userEvent.type(field('entry-amount'), '35,00');
      await userEvent.type(field('entry-description'), 'Almoço');
      await pick('entry-category', 'cat-food');
      await pick('entry-method', 'PIX');
      await userEvent.click(screen.getByTestId('entry-split'));
      await userEvent.click(screen.getByTestId('entry-split'));
      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(screen.queryByTestId('entry-share-0')).not.toBeInTheDocument();
      expect(transactions.creates[0]?.input).not.toHaveProperty('shares');
    });

    it('Dado SHARES_EXCEED_AMOUNT, então o erro aparece no campo das partes, traduzido', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = failWith(422, 'SHARES_EXCEED_AMOUNT');
      const { fixture } = await setup({ url: '/quick-add', transactions });
      await userEvent.type(field('entry-amount'), '200,00');
      await userEvent.type(field('entry-description'), 'Jantar');
      await pick('entry-category', 'cat-food');
      await pick('entry-method', 'PIX');
      await userEvent.click(screen.getByTestId('entry-split'));
      await pick('entry-share-person-0', 'person-1');
      await userEvent.type(amountOf(0), '250,00');

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(screen.getByTestId('entry-shares-error')).toHaveTextContent(
        pt.errors.codes['SHARES_EXCEED_AMOUNT']!,
      );
      expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
      // O que foi digitado continua lá.
      expect(amountOf(0).value).toBe('250,00');
    });

    it('Dado SHARE_PERSON_ARCHIVED, então o erro também aparece no campo das partes', async () => {
      const transactions = new TransactionsGatewayStub();
      transactions.create$ = failWith(422, 'SHARE_PERSON_ARCHIVED');
      const { fixture } = await setup({ url: '/quick-add', transactions });
      await userEvent.type(field('entry-amount'), '200,00');
      await userEvent.type(field('entry-description'), 'Jantar');
      await pick('entry-category', 'cat-food');
      await pick('entry-method', 'PIX');
      await userEvent.click(screen.getByTestId('entry-split'));
      await pick('entry-share-person-0', 'person-1');
      await userEvent.type(amountOf(0), '50,00');

      await userEvent.click(screen.getByTestId('form-save'));
      fixture.detectChanges();

      expect(screen.getByTestId('entry-shares-error')).toHaveTextContent(
        pt.errors.codes['SHARE_PERSON_ARCHIVED']!,
      );
    });

    it('Dado pessoa nova na parte, então é criada antes (S-138) e fica escolhida na linha', async () => {
      const people = new PeopleGatewayStub();
      const { fixture } = await setup({ url: '/quick-add', people });
      await userEvent.click(screen.getByTestId('entry-split'));

      await pick('entry-share-person-0', '__new-person__');
      await userEvent.type(field('entry-share-person-0-new-name'), 'Ana');
      await userEvent.click(screen.getByTestId('entry-share-person-0-new-create'));
      await fixture.whenStable();

      expect(people.creates).toEqual([{ name: 'Ana', notes: null }]);
      expect(screen.getByTestId('entry-share-person-0')).toHaveTextContent('Ana');
    });

    it('Dado parte sem pessoa ou sem valor, então o erro é do campo e nada é enviado', async () => {
      const { transactions } = await setup({ url: '/quick-add' });
      await userEvent.type(field('entry-amount'), '200,00');
      await userEvent.type(field('entry-description'), 'Jantar');
      await pick('entry-category', 'cat-food');
      await pick('entry-method', 'PIX');
      await userEvent.click(screen.getByTestId('entry-split'));

      await userEvent.click(screen.getByTestId('form-save'));

      expect(transactions.creates).toHaveLength(0);
      expect(screen.getByTestId('entry-share-person-0')).toHaveAttribute('aria-invalid', 'true');
      expect(amountOf(0)).toHaveAttribute('aria-invalid', 'true');
    });

    it('Dado teclado e leitor de tela, então adicionar e remover têm rótulos e o foco é previsível', async () => {
      await setup({ url: '/quick-add' });
      await userEvent.click(screen.getByTestId('entry-split'));
      await pick('entry-share-person-0', 'person-1');

      expect(screen.getByTestId('entry-share-0')).toHaveAccessibleName('Parte 1');
      expect(screen.getByTestId('entry-share-remove-0')).toHaveAccessibleName(
        'Remover parte de João',
      );

      await userEvent.click(screen.getByTestId('entry-share-add'));
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByTestId('entry-share-person-1')),
      );
      expect(screen.getByTestId('entry-share-remove-1')).toHaveAccessibleName('Remover parte 2');

      await userEvent.click(screen.getByTestId('entry-share-remove-1'));
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByTestId('entry-share-add')),
      );
      expect(screen.queryByTestId('entry-share-1')).not.toBeInTheDocument();
    });

    it('Dado várias partes, então cada uma leva a sua pessoa e o seu valor', async () => {
      const { transactions, fixture } = await setup({ url: '/quick-add' });
      await userEvent.type(field('entry-amount'), '300,00');
      await userEvent.type(field('entry-description'), 'Churrasco');
      await pick('entry-category', 'cat-food');
      await pick('entry-method', 'PIX');
      await userEvent.click(screen.getByTestId('entry-split'));
      await pick('entry-share-person-0', 'person-1');
      await userEvent.type(amountOf(0), '100,00');
      await userEvent.click(screen.getByTestId('entry-share-add'));
      await pick('entry-share-person-1', 'person-2');
      await userEvent.type(amountOf(1), '100,01');

      await userEvent.click(screen.getByTestId('form-save'));
      await fixture.whenStable();

      expect(transactions.creates[0]?.input).toMatchObject({
        shares: [
          { amount: '100.00', newDebt: { personId: 'person-1' } },
          { amount: '100.01', newDebt: { personId: 'person-2' } },
        ],
      });
    });

    it('Dado a divisão aberta, então o axe não aponta violações', async () => {
      const { container } = await setup({ url: '/quick-add' });
      await userEvent.click(screen.getByTestId('entry-split'));

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
});
