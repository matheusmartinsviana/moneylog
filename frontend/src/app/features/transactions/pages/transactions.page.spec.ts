import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { App } from '~/app/app';
import { pt } from '~/app/common/i18n/translations/pt';
import { TransactionsPage } from '~/app/features/transactions/pages/transactions.page';
import type { TransactionSlice } from '~/modules/transactions/core/interfaces/transactions.gateway';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  provideCategoriesStub,
  CategoriesGatewayStub,
  aCategory,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aTransaction,
  anEntry,
  provideTransactionsStub,
  someTotals,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function setup(gateway = new TransactionsGatewayStub(), url = '/transactions') {
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Nubank' })];
  const categories = new CategoriesGatewayStub();
  categories.categories = [aCategory({ id: 'cat-1', name: 'Alimentação' })];
  const result = await render(App, {
    initialRoute: url,
    routes: [
      { path: 'transactions', component: TransactionsPage },
      { path: 'transactions/:id', component: TransactionsPage },
      { path: 'quick-add', component: TransactionsPage },
    ],
    providers: [
      provideI18nTesting('pt'),
      provideTransactionsStub(gateway),
      provideAccountsStub(accounts),
      provideCategoriesStub(categories),
    ],
  });
  return { gateway, result, router: TestBed.inject(Router) };
}

const page = (ids: string[], hasNext: boolean, totals = someTotals(7)): TransactionSlice => ({
  items: ids.map((id) => aTransaction({ id, description: `Item ${id}` })),
  hasNext,
  totals,
});

describe('TransactionsPage', () => {
  it('Dado a visão Registros, então a tabela traz as colunas e o rodapé mostra exatamente os totals recebidos (não a soma das linhas)', async () => {
    const gateway = new TransactionsGatewayStub();
    const totals = {
      count: 42,
      cashFlow: { in: brl('999.00'), out: brl('111.11'), net: brl('887.89') },
    };
    gateway.list$ = () => of(page(['a', 'b'], false, totals));
    await setup(gateway);

    const table = screen.getByTestId('records-table');
    expect(
      within(table)
        .getAllByRole('columnheader', { hidden: true })
        .map((h) => text(h)),
    ).toEqual(['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta', 'Método', 'Valor']);
    expect(screen.getByTestId('transaction-row-a')).toBeInTheDocument();
    expect(text(screen.getByTestId('totals-footer-count'))).toBe('42');
    expect(text(screen.getByTestId('totals-footer-in'))).toBe('R$ 999,00');
    expect(text(screen.getByTestId('totals-footer-out'))).toBe('R$ 111,11');
    expect(text(screen.getByTestId('totals-footer-net'))).toBe('R$ 887,89');
    expect(text(screen.getByTestId('totals-summary-net'))).toBe('R$ 887,89');
  });

  it('Dado o valor de uma despesa, então vai à direita, tabular e com o sinal da direção', async () => {
    await setup();

    const amount = screen.getByTestId('transaction-amount-tx-1');
    expect(amount).toHaveClass('num');
    expect(text(amount)).toBe('−R$ 35,00');
  });

  it('Dado uma estornada, então aparece com o rótulo e os totais continuam os recebidos', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () =>
      of({
        items: [aTransaction({ id: 'v', status: 'VOIDED' })],
        hasNext: false,
        totals: someTotals(0),
      });
    await setup(gateway, '/transactions?status=VOIDED');

    expect(screen.getByTestId('transaction-row-v')).toHaveClass('is-voided');
    expect(screen.getByTestId('transaction-row-v')).toHaveTextContent(pt.transactions.voided);
    expect(text(screen.getByTestId('totals-footer-count'))).toBe('0');
    expect(screen.getByTestId('totals-footer-voided-note')).toHaveTextContent(
      pt.transactions.totals.voidedNote,
    );
    expect(screen.getByTestId('filter-voided')).toHaveAttribute('aria-checked', 'true');
  });

  it('Dado a visão Por competência, então mostra o seletor de mês e lente, o reembolso negativo e o total com a quebra por categoria', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.entries$ = () =>
      of({
        items: [
          anEntry({ amount: brl('35.00') }),
          anEntry({ transactionId: 'r', amount: brl('-12.00') }),
        ],
        hasNext: false,
        totals: {
          total: brl('23.00'),
          byCategory: [{ category: { id: 'cat-1', name: 'Alimentação' }, amount: brl('23.00') }],
        },
      });
    await setup(gateway, '/transactions?view=entries');

    expect(screen.getByTestId('filter-competence')).toBeInTheDocument();
    expect(screen.getByTestId('filter-lens')).toBeInTheDocument();
    expect(screen.getByTestId('entries-table')).toBeInTheDocument();
    expect(text(screen.getByTestId('entry-row-1'))).toContain('−R$ 12,00');
    expect(text(screen.getByTestId('totals-footer-total'))).toBe('R$ 23,00');
    expect(text(screen.getByTestId('totals-footer-category-cat-1'))).toBe('R$ 23,00');
    expect(gateway.listCalls).toHaveLength(0);
  });

  it('Dado filtros na URL, então a lista os aplica e eles sobrevivem ao F5 (reabrir a URL)', async () => {
    const gateway = new TransactionsGatewayStub();
    await setup(gateway, '/transactions?method=PIX&q=cafe&from=2026-09-01&to=2026-09-30');

    expect(gateway.listCalls[0]!.filters).toMatchObject({
      method: 'PIX',
      q: 'cafe',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect((screen.getByTestId('filter-search') as HTMLInputElement).value).toBe('cafe');
    expect(screen.getByTestId('filter-method')).toHaveTextContent(pt.transactions.methods.PIX);
    expect((screen.getByTestId('filter-from') as HTMLInputElement).value).toBe('01/09/2026');
  });

  it('Dado o campo "De" apagado, então o filtro de início é removido (período aberto) e a URL guarda from vazio', async () => {
    const gateway = new TransactionsGatewayStub();
    const { router } = await setup(gateway, '/transactions?from=2026-09-01&to=2026-09-30');

    await userEvent.clear(screen.getByTestId('filter-from'));

    await vi.waitFor(() => expect(gateway.listCalls.at(-1)!.filters.from).toBeNull());
    expect(gateway.listCalls.at(-1)!.filters.to).toBe('2026-09-30');
    await vi.waitFor(() => expect(router.url).toContain('from='));
    expect(router.url).not.toContain('from=2026');
    expect(screen.getByTestId('filter-from')).toHaveValue('');
    expect(screen.queryByTestId('filter-from-error')).not.toBeInTheDocument();
  });

  it('Dado o campo "De" com texto parcial, então o filtro não muda até a data ficar completa', async () => {
    const gateway = new TransactionsGatewayStub();
    await setup(gateway, '/transactions?from=2026-09-01&to=2026-09-30');
    const calls = gateway.listCalls.length;

    await userEvent.type(screen.getByTestId('filter-from'), '{Backspace}');

    expect(gateway.listCalls).toHaveLength(calls);
  });

  it('Dado a mudança de um filtro, então a URL é atualizada e a lista recarrega', async () => {
    const { gateway, router } = await setup();

    await userEvent.click(screen.getByTestId('filter-method'));
    await userEvent.click(screen.getByTestId('filter-method-option-DEBIT'));

    expect(gateway.listCalls.at(-1)!.filters.method).toBe('DEBIT');
    await vi.waitFor(() => expect(router.url).toContain('method=DEBIT'));
  });

  it('Dado "limpar filtros", então volta aos padrões de S-71 e a URL fica limpa', async () => {
    const { gateway, router } = await setup(
      new TransactionsGatewayStub(),
      '/transactions?method=PIX&type=EXPENSE',
    );

    await userEvent.click(screen.getByTestId('filters-clear'));

    expect(gateway.listCalls.at(-1)!.filters).toMatchObject({
      method: null,
      type: null,
      status: 'ACTIVE',
    });
    await vi.waitFor(() => expect(router.url).toBe('/transactions'));
  });

  it('Dado a troca de visão, então a URL ganha view=entries e usa os lançamentos', async () => {
    const { gateway, router } = await setup();

    await userEvent.click(screen.getByTestId('view-entries'));

    expect(gateway.entryCalls).toHaveLength(1);
    await vi.waitFor(() => expect(router.url).toContain('view=entries'));
    expect(screen.getByTestId('view-entries')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Dado hasNext, quando clico em "carregar mais", então anexa a próxima página e mantém os totals recebidos', async () => {
    const gateway = new TransactionsGatewayStub();
    const totals = someTotals(7);
    gateway.list$ = (n) => of(n === 1 ? page(['a'], true, totals) : page(['b'], false, totals));
    await setup(gateway);

    await userEvent.click(screen.getByTestId('transactions-load-more'));

    expect(screen.getByTestId('transaction-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('transaction-row-b')).toBeInTheDocument();
    expect(text(screen.getByTestId('totals-footer-count'))).toBe('7');
    expect(screen.queryByTestId('transactions-load-more')).not.toBeInTheDocument();
  });

  it('Dado falha ao carregar mais, então avisa e mantém a lista', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = (n) => (n === 1 ? of(page(['a'], true)) : failWith(500, 'INTERNAL_ERROR'));
    await setup(gateway);

    await userEvent.click(screen.getByTestId('transactions-load-more'));

    expect(screen.getByTestId('transactions-load-more-error')).toBeInTheDocument();
    expect(screen.getByTestId('transaction-row-a')).toBeInTheDocument();
  });

  it('Dado o teclado, então setas movem entre as linhas e Enter abre o detalhe', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => of(page(['a', 'b'], false));
    const { router } = await setup(gateway);
    const first = screen.getByTestId('transaction-row-a');
    first.focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('transaction-row-b')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');

    await vi.waitFor(() => expect(router.url).toBe('/transactions/b'));
  });

  it('Dado nenhuma movimentação, então mostra o estado vazio com "Adicionar movimentação" habilitado levando a /quick-add', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => of(page([], false, someTotals(0)));
    await setup(gateway);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.emptyState.transactions.title,
    );
    const add = screen.getByTestId('empty-state-action-add-transaction');
    expect(add).toHaveAttribute('href', '/quick-add');
    expect(add).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('empty-state-action-import-statement')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Dado erro, então mostra "tentar de novo" que recarrega', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    gateway.list$ = () => of(page(['a'], false));
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(screen.getByTestId('transaction-row-a')).toBeInTheDocument();
  });

  it('Dado a carga pendente, então mostra o status de carregando', async () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => NEVER;
    await setup(gateway);

    expect(screen.getByRole('status')).toHaveTextContent(pt.transactions.loading);
  });

  it('Dado a visão de celular, então cada linha também existe como item de lista com descrição, categoria/conta, data e valor', async () => {
    await setup();

    const item = screen.getByTestId('transaction-item-tx-1');
    expect(item).toHaveClass('row-hover');
    expect(item).toHaveTextContent('Almoço');
    expect(item).toHaveTextContent('Alimentação');
    expect(item).toHaveTextContent('Nubank');
    expect(text(item)).toContain('R$ 35,00');
  });

  it('Dado filtro por conta, então o líquido vira "Movimento da conta"', async () => {
    await setup(
      new TransactionsGatewayStub(),
      '/transactions?accountId=3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );

    expect(screen.getByTestId('totals-footer')).toHaveTextContent(
      pt.transactions.totals.netAccount,
    );
  });

  it('Dado a página, então o axe não aponta violações', async () => {
    await setup();

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
