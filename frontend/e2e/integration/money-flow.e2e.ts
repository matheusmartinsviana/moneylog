/* eslint-disable @typescript-eslint/no-explicit-any */
import { todayInSaoPaulo } from '../support/api';

import {
  cy,
  cyText,
  expect,
  fillAmount,
  fmt,
  loginViaUi,
  norm,
  open,
  openFilters,
  pick,
  pickValue,
  resetDatabase,
  test,
  waitForApp,
} from './fixtures';

/**
 * T44 CA1 e CA2: criar conta, lançar despesa Pix, transferência, receita e estorno, sempre
 * comparando o número da tela (Início, lista, visão por competência, conta) com o da API capturada.
 */
test.describe.configure({ mode: 'serial' });

const TODAY = todayInSaoPaulo();

/** Soma, em centavos, de strings decimais da API — só para o teste conferir a conta; o front nunca soma. */
const cents = (v: string): bigint => BigInt(v.replace('.', ''));

const lastSummary = (net: any): Promise<any> => net.body('GET', '/v1/dashboard/summary');

test.beforeEach(() => resetDatabase());

test('criar conta, lançar despesa Pix e ver o mesmo número no Início, na lista, na competência e na conta', async ({
  page,
  net,
  evidence,
}) => {
  // 1. Sem sessão: vai para o login preservando o destino.
  await page.goto('/accounts/new');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccounts%2Fnew$/);
  await loginViaUi(page);
  await expect(page).toHaveURL(/\/accounts\/new$/);
  await waitForApp(page);

  // 2. Cria a conta Nubank (corrente, 1.000,00, hoje).
  await cy(page, 'account-name').fill('Nubank');
  await pick(page, 'account-type', 'Conta corrente');
  await cy(page, 'account-opening-balance').fill('1.000,00');
  await cy(page, 'account-opening-balance').blur();
  await cy(page, 'account-opening-date').fill(TODAY);
  await evidence(page, 'e2e-01-conta-formulario');
  await cy(page, 'account-form-save').click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(cy(page, 'accounts-list')).toBeVisible();
  const account = await net.body('POST', '/v1/accounts', 'first');
  expect((net.find('POST', '/v1/accounts')[0] as any).status).toBe(201);
  expect(await cyText(page, `account-balance-${account.id}`)).toContain(fmt('1000.00'));

  // 3. Lança um Pix de 100,00 "almoço" em Alimentação pelo /quick-add.
  await open(page, '/quick-add?mode=pix');
  await expect(cy(page, 'expense-form')).toBeVisible();
  await fillAmount(page, '100,00');
  await cy(page, 'entry-description').fill('almoço');
  await pick(page, 'entry-category', 'Alimentação');
  await expect(cy(page, 'entry-account')).toContainText('Nubank'); // única conta CASH: já vem escolhida
  await evidence(page, 'e2e-02-quick-add-pix');
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
  const created = await net.body('POST', '/v1/transactions', 'first');
  expect(created.type).toBe('EXPENSE');
  expect(created.amount.amount).toBe('100.00');
  expect(created.method).toBe('PIX');

  // 4. Início: contas 900, disponível 900, consumo 100, caixa saída 100, líquido -100.
  await open(page, '/');
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  const s = await lastSummary(net);
  expect(s.balances.inAccounts.amount).toBe('900.00');
  expect(s.balances.available.amount).toBe('900.00');
  expect(s.month.consumption.amount).toBe('100.00');
  expect(s.month.cashFlow.out.amount).toBe('100.00');
  expect(s.month.cashFlow.in.amount).toBe('0.00');
  expect(s.month.cashFlow.net.amount).toBe('-100.00');
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('900.00'));
  expect(await cyText(page, 'home-available')).toBe(fmt('900.00'));
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('100.00'));
  expect(await cyText(page, 'home-month-cash-out')).toBe(fmt('100.00'));
  expect(await cyText(page, 'home-month-cash-net')).toBe(fmt('-100.00'));
  await evidence(page, 'e2e-03-inicio-apos-despesa');

  // 5. Lista (Registros, mês corrente): linha de 100,00 e rodapé iguais ao fluxo de caixa do Início.
  await open(page, '/transactions');
  await expect(cy(page, `transaction-row-${created.id}`)).toBeVisible();
  expect(await cyText(page, `transaction-amount-${created.id}`)).toContain(fmt('100.00'));
  expect(await cyText(page, 'totals-footer-count')).toBe('1');
  expect(await cyText(page, 'totals-footer-out')).toBe(
    await cyText(page, 'home-month-cash-out').catch(() => fmt('100.00')),
  );
  expect(await cyText(page, 'totals-footer-out')).toBe(fmt('100.00'));
  expect(await cyText(page, 'totals-footer-in')).toBe(fmt('0.00'));
  expect(await cyText(page, 'totals-footer-net')).toBe(fmt('-100.00'));
  const list = await net.body('GET', '/v1/transactions');
  expect(list.totals.count).toBe(1);
  expect(list.totals.cashFlow.out.amount).toBe(s.month.cashFlow.out.amount);
  expect(list.totals.cashFlow.net.amount).toBe(s.month.cashFlow.net.amount);
  await evidence(page, 'e2e-04-lista-registros');

  // 6. Por competência: total 100 e Alimentação 100, iguais ao consumo do Início.
  await cy(page, 'view-entries').click();
  await expect(cy(page, 'totals-footer-total')).toBeVisible();
  expect(await cyText(page, 'totals-footer-total')).toBe(fmt(s.month.consumption.amount));
  const food = await page.locator('[data-cy^="totals-footer-category-"]').first().innerText();
  expect(norm(food)).toBe(fmt('100.00'));
  const entries = await net.body('GET', '/v1/entries');
  expect(entries.totals.total.amount).toBe(s.month.consumption.amount);
  expect(entries.totals.byCategory[0].amount.amount).toBe('100.00');
  await evidence(page, 'e2e-05-lista-competencia');

  // 7. A conta mostra 900,00.
  await open(page, '/accounts');
  expect(await cyText(page, `account-balance-${account.id}`)).toContain(fmt('900.00'));
  const acc = await net.body('GET', '/v1/accounts');
  expect(acc.items.find((a: any) => a.id === account.id).currentBalance.amount).toBe('900.00');
});

test('transferência, receita e estorno: os números continuam batendo em todas as visões', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const xp = await api.createAccount({ name: 'XP', openingBalance: '0.00' });
  const food = await api.categoryId('Alimentação');
  const salary = await api.categoryId('Salário', 'INCOME');
  await signIn(page);

  // Despesa Pix 100,00 (pela tela).
  await open(page, '/quick-add?mode=pix');
  await fillAmount(page, '100,00');
  await cy(page, 'entry-description').fill('almoço');
  await pick(page, 'entry-category', 'Alimentação');
  await pick(page, 'entry-account', 'Nubank');
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
  const expenseTx = await net.body('POST', '/v1/transactions', 'first');

  // Transferência 200,00 Nubank -> XP.
  await open(page, '/quick-add?mode=transfer');
  await fillAmount(page, '200,00');
  await pick(page, 'entry-from', 'Nubank');
  await pick(page, 'entry-to', 'XP');
  await cy(page, 'entry-description').fill('reserva');
  await evidence(page, 'e2e-06-quick-add-transferencia');
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();

  // Receita 3.000,00 (salário) no Nubank.
  await open(page, '/quick-add?mode=income');
  await fillAmount(page, '3.000,00');
  await cy(page, 'entry-description').fill('salário');
  await pick(page, 'entry-category', 'Salário');
  await pick(page, 'entry-account', 'Nubank');
  await pickValue(page, 'entry-method', 'TRANSFER');
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();

  // Início: em contas 3.900; consumo 100; fluxo entradas 3.000 / saídas 100; líquido 2.900.
  await open(page, '/');
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  const s = await lastSummary(net);
  expect(s.balances.inAccounts.amount).toBe('3900.00');
  expect(s.month.consumption.amount).toBe('100.00');
  expect(s.month.cashFlow.in.amount).toBe('3000.00');
  expect(s.month.cashFlow.out.amount).toBe('100.00');
  expect(s.month.cashFlow.net.amount).toBe('2900.00');
  expect(s.month.income.amount).toBe('3000.00');
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('3900.00'));
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('100.00'));
  expect(await cyText(page, 'home-month-cash-in')).toBe(fmt('3000.00'));
  expect(await cyText(page, 'home-month-cash-out')).toBe(fmt('100.00'));
  expect(await cyText(page, 'home-month-cash-net')).toBe(fmt('2900.00'));
  await evidence(page, 'e2e-07-inicio-apos-transferencia-e-receita');

  // Lista: 3 registros; transferência não entra em saídas nem no líquido.
  await open(page, '/transactions');
  expect(await cyText(page, 'totals-footer-count')).toBe('3');
  expect(await cyText(page, 'totals-footer-in')).toBe(fmt('3000.00'));
  expect(await cyText(page, 'totals-footer-out')).toBe(fmt('100.00'));
  expect(await cyText(page, 'totals-footer-net')).toBe(fmt('2900.00'));
  const list = await net.body('GET', '/v1/transactions');
  expect(list.items).toHaveLength(3);
  expect(cents(list.totals.cashFlow.in.amount) - cents(list.totals.cashFlow.out.amount)).toBe(
    cents(list.totals.cashFlow.net.amount),
  );

  // Competência (consumo) continua igual ao Início; receita é outra lente.
  await cy(page, 'view-entries').click();
  expect(await cyText(page, 'totals-footer-total')).toBe(fmt('100.00'));
  await page.locator('[data-cy="filter-lens"]').click();
  await page.locator('[data-cy="filter-lens-option-INCOME"]').click();
  await expect(cy(page, 'totals-footer-total')).toHaveText(/3\.000,00/);
  expect(await cyText(page, 'totals-footer-total')).toBe(fmt('3000.00'));

  // Contas: Nubank 2.700 (1.000 - 100 - 200 + 3.000 = 3.700?) conferido contra a API.
  await open(page, '/accounts');
  const accounts = (await net.body('GET', '/v1/accounts')).items;
  const byName = (n: string) => accounts.find((a: any) => a.name === n);
  expect(byName('Nubank').currentBalance.amount).toBe('3700.00');
  expect(byName('XP').currentBalance.amount).toBe('200.00');
  expect(await cyText(page, `account-balance-${byName('Nubank').id}`)).toContain(fmt('3700.00'));
  expect(await cyText(page, `account-balance-${byName('XP').id}`)).toContain(fmt('200.00'));
  void nubank;
  void xp;
  void food;
  void salary;

  // Estorna a despesa: consumo 0,00; a linha só aparece (riscada) com "mostrar estornadas".
  await open(page, `/transactions/${expenseTx.id}`);
  await cy(page, 'void-open').click();
  await cy(page, 'confirm-dialog-reason').fill('lançado por engano');
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'detail-voided')).toBeVisible();
  await evidence(page, 'e2e-08-detalhe-estornada');

  await open(page, '/');
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt('0.00'));
  expect(await cyText(page, 'home-month-cash-out')).toBe(fmt('0.00'));
  expect(await cyText(page, 'home-in-accounts')).toBe(fmt('4000.00'));

  await open(page, '/transactions');
  await expect(cy(page, `transaction-row-${expenseTx.id}`)).toHaveCount(0);
  expect(await cyText(page, 'totals-footer-count')).toBe('2');
  await openFilters(page);
  await page.locator('[data-cy="filter-voided"]').click();
  const row = cy(page, `transaction-row-${expenseTx.id}`);
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/is-voided/);
  await evidence(page, 'e2e-09-lista-com-estornadas');
});
