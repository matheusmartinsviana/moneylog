/* eslint-disable @typescript-eslint/no-explicit-any */
import { brl, todayInSaoPaulo } from '../support/api';

import {
  cy,
  cyText,
  expect,
  fillAmount,
  fmt,
  norm,
  open,
  pick,
  pickValue,
  resetDatabase,
  test,
} from './fixtures';

/**
 * Etapa 4 com o backend real, parte de dívidas e pessoas (T90 do front): emprestar → ver a dívida na
 * pessoa → receber a devolução → perdoar o resto; despesa dividida; dívida sem movimentação. O teste só
 * compara o que a tela mostra com o que a API devolveu em cada passo (saldo líquido, compromissos, Início);
 * nunca recalcula. **Escrito, não executado pelo dev-frontend** (o backend estava em teste): a QA roda
 * `npm run e2e:integration`.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(() => resetDatabase());

/** `YYYY-MM-DD` → `dd/mm/aaaa` (a máscara do campo de data em pt). */
const br = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

test('emprestar 300,00 ao João → ver a dívida nele e no Início → receber 100,00 (não é renda) → perdoar o resto', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(300_000);
  net.checkDuplicates = false;
  await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  await signIn(page);

  // 1. Cadastra o João pela tela.
  await open(page, '/people/new');
  await cy(page, 'person-name').fill('João');
  await cy(page, 'person-form-save').click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  const person = await net.body('POST', '/v1/people', 'first');
  expect(net.find('POST', '/v1/people')[0]?.idempotencyKey).toBeTruthy();
  expect(person.net.amount).toBe('0.00');
  expect(person.direction).toBe('NONE');

  // 2. Empresta 300,00 pelo /quick-add (modo "Dinheiro emprestado"), com previsão em 10 dias.
  const expected = todayInSaoPaulo(10);
  await open(page, `/quick-add?mode=loan&personId=${person.id}`);
  await expect(cy(page, 'loan-person')).toContainText('João');
  await cy(page, 'loan-amount').fill('300,00');
  await cy(page, 'loan-amount').blur();
  await cy(page, 'loan-expected-date').fill(br(expected));
  await cy(page, 'loan-expected-date').blur();
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
  const loan = await net.body('POST', '/v1/transactions', 'first');
  expect(loan.type).toBe('LOAN_GIVEN');
  expect(loan.debt.direction).toBe('RECEIVABLE');
  expect(loan.debt.principal.amount).toBe('300.00');
  expect(loan.debt.expectedDate).toBe(expected);
  expect(loan.impact.cash.amount).toBe('-300.00');
  expect(loan.impact.consumption).toEqual([]);
  expect(loan.impact.netWorth.amount).toBe('0.00');
  expect(net.find('POST', '/v1/transactions')[0]?.idempotencyKey).toBeTruthy();
  const debtId = loan.debt.id as string;

  // 3. A pessoa mostra a dívida e o saldo líquido que a API calculou.
  await open(page, `/people/${person.id}`);
  // Espera a tela da pessoa pintar o saldo: sem isso, a última resposta capturada ainda é a da
  // criação da pessoa (saldo 0,00), de antes do empréstimo.
  await expect(cy(page, 'person-balance')).toBeVisible();
  const apiPerson = await net.body('GET', `/v1/people/${person.id}`);
  expect(apiPerson.net.amount).toBe('300.00');
  expect(apiPerson.direction).toBe('RECEIVABLE');
  expect(await cyText(page, 'person-balance')).toBe(`João deve ${fmt(apiPerson.net.amount)}`);
  expect(await cyText(page, 'person-open-debts')).toBe('1 dívida em aberto');
  expect(await cyText(page, `debt-outstanding-${debtId}`)).toBe(fmt('300.00'));
  expect(await cyText(page, `debt-status-${debtId}`)).toBe('Em aberto');

  // 4. O Início mostra a cobrança como "a receber" e os totais são os do /upcoming; cobrança não soma ao a pagar.
  await open(page, '/planning/overview');
  await expect(cy(page, 'home-legacy')).toBeVisible();
  const upcoming = await net.body('GET', '/v1/dashboard/upcoming');
  const item = upcoming.items.find((i: any) => i.refId === debtId);
  expect(item.kind).toBe('DEBT_RECEIVABLE');
  expect(item.direction).toBe('IN');
  expect(upcoming.totals.out.amount).toBe('0.00');
  const row = page.locator('[data-cy="home-upcoming-item"][data-kind="DEBT_RECEIVABLE"]');
  expect(norm(await row.innerText())).toContain('A receber');
  expect(norm(await row.innerText())).toContain(fmt(item.amount.amount));
  expect(await cyText(page, 'home-upcoming-total-in')).toBe(fmt(upcoming.totals.in.amount));
  expect(await cyText(page, 'home-upcoming-total-out')).toBe(fmt(upcoming.totals.out.amount));

  // 5. Recebe 100,00 da devolução pela folha da dívida: sugestão = outstanding da API; nunca é renda.
  await open(page, `/debts/${debtId}`);
  await cy(page, 'debt-settle').click();
  await expect(cy(page, 'settle-sheet-panel')).toBeVisible();
  await expect(cy(page, 'settle-amount')).toHaveValue('300,00');
  await cy(page, 'settle-amount').fill('100,00');
  await cy(page, 'settle-amount').blur();
  await cy(page, 'settle-submit').click();
  await expect(cy(page, 'settle-sheet-panel')).toBeHidden();
  const received = await net.body('POST', '/v1/transactions', 'last');
  expect(received.type).toBe('MONEY_RECEIVED');
  expect(received.debt.settled.amount).toBe('100.00');
  expect(received.debt.outstanding.amount).toBe('200.00');
  expect(net.find('POST', '/v1/transactions').at(-1)?.idempotencyKey).toBeTruthy();
  // A tela recarrega a dívida do backend depois de quitar: espera o status novo antes de ler a resposta.
  await expect(cy(page, 'debt-status')).toHaveText('Parcialmente quitada');
  const apiDebt = await net.body('GET', `/v1/debts/${debtId}`);
  expect(apiDebt.status).toBe('PARTIALLY_SETTLED');
  expect(await cyText(page, 'debt-settled')).toBe(fmt(apiDebt.settled.amount));
  expect(await cyText(page, 'debt-outstanding')).toBe(fmt(apiDebt.outstanding.amount));
  expect(await cyText(page, 'debt-status')).toBe('Parcialmente quitada');

  await open(page, '/planning/overview');
  // Espera o Início pintar: sem isso a última resposta capturada ainda é a da visita anterior.
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  const summary = await net.body('GET', '/v1/dashboard/summary');
  expect(summary.month.income.amount).toBe('0.00');
  expect(summary.month.received.amount).toBe('100.00');
  expect(await cyText(page, 'home-month-income')).toBe(fmt(summary.month.income.amount));
  expect(await cyText(page, 'home-month-received')).toBe(fmt(summary.month.received.amount));
  const upcomingAfter = await net.body('GET', '/v1/dashboard/upcoming');
  expect(await cyText(page, 'home-upcoming-total-in')).toBe(fmt(upcomingAfter.totals.in.amount));

  // 6. Perdoa o resto (motivo obrigatório, não pode ser desfeito).
  await open(page, `/debts/${debtId}`);
  await cy(page, 'debt-forgive').click();
  await expect(cy(page, 'confirm-dialog-confirm')).toBeDisabled();
  await cy(page, 'confirm-dialog-reason').fill('combinado entre amigos');
  await cy(page, 'confirm-dialog-confirm').click();
  const forgiven = await net.body('POST', `/v1/debts/${debtId}/cancel`);
  expect(forgiven.status).toBe('CANCELED');
  expect(forgiven.outstanding.amount).toBe('0.00');
  expect(await cyText(page, 'debt-status')).toBe('Perdoada');
  await expect(cy(page, 'debt-settle')).toHaveCount(0);
  await expect(cy(page, 'debt-forgive')).toHaveCount(0);

  await open(page, `/people/${person.id}`);
  await expect(cy(page, 'person-balance')).toBeVisible();
  const finalPerson = await net.body('GET', `/v1/people/${person.id}`);
  expect(finalPerson.net.amount).toBe('0.00');
  expect(finalPerson.direction).toBe('NONE');
  expect(await cyText(page, 'person-balance')).toBe('Sem pendências com João');
});

test('despesa de 200,00 dividida com o João (100,00): consumo 100,00, caixa −200,00 e a devolução do João', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(300_000);
  net.checkDuplicates = false;
  await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const joao = await api.ok(api.call('POST', '/v1/people', { name: 'João', notes: null }), [201]);
  await signIn(page);

  await open(page, '/quick-add?mode=pix');
  await fillAmount(page, '200,00');
  await cy(page, 'entry-description').fill('Jantar');
  await pick(page, 'entry-category', 'Alimentação');
  await cy(page, 'entry-split').click();
  await expect(cy(page, 'entry-share-0')).toBeVisible();
  await pickValue(page, 'entry-share-person-0', joao.id);
  await cy(page, 'entry-share-amount-0').fill('100,00');
  await cy(page, 'entry-share-amount-0').blur();
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();

  // O corpo leva só o que foi digitado; o `impact` vem do backend (o front não calcula a divisão).
  const sent = net.find('POST', '/v1/transactions')[0]?.requestBody as any;
  expect(sent.amount).toBe('200.00');
  expect(sent.shares).toEqual([
    { amount: '100.00', newDebt: { personId: joao.id, expectedDate: null, description: null } },
  ]);
  const created = await net.body('POST', '/v1/transactions', 'first');
  expect(created.impact.cash.amount).toBe('-200.00');
  expect(created.impact.consumption[0].amount.amount).toBe('100.00');
  expect(created.shares).toHaveLength(1);
  const shareDebt = created.shares[0];
  expect(shareDebt.principal.amount).toBe('100.00');

  // O aviso leva ao detalhe: impacto e partes exatamente como a API devolveu.
  await cy(page, 'toast-info').getByRole('button', { name: 'Ver detalhes' }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions/${created.id}$`));
  expect(await cyText(page, 'impact-cash')).toContain(fmt(created.impact.cash.amount));
  expect(
    await cyText(page, `impact-consumption-${created.impact.consumption[0].competence}`),
  ).toContain(fmt(created.impact.consumption[0].amount.amount));
  await expect(cy(page, `detail-share-link-${shareDebt.id}`)).toBeVisible();

  // O Início e a pessoa concordam com a API.
  await open(page, '/planning/overview');
  await expect(cy(page, 'home-legacy')).toBeVisible();
  const summary = await net.body('GET', '/v1/dashboard/summary');
  expect(summary.month.consumption.amount).toBe('100.00');
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt(summary.month.consumption.amount));
  await open(page, `/people/${joao.id}`);
  await expect(cy(page, 'person-balance')).toBeVisible();
  const apiPerson = await net.body('GET', `/v1/people/${joao.id}`);
  expect(apiPerson.net.amount).toBe('100.00');
  expect(await cyText(page, 'person-balance')).toBe(`João deve ${fmt(apiPerson.net.amount)}`);

  // João paga 100,00: a dívida quita, o saldo zera e não vira receita.
  await open(page, `/debts/${shareDebt.id}`);
  await cy(page, 'debt-settle').click();
  await expect(cy(page, 'settle-amount')).toHaveValue('100,00');
  await cy(page, 'settle-submit').click();
  await expect(cy(page, 'settle-sheet-panel')).toBeHidden();
  const settled = await net.body('GET', `/v1/debts/${shareDebt.id}`);
  expect(settled.status).toBe('SETTLED');
  expect(await cyText(page, 'debt-status')).toBe('Quitada');
  const after = await api.get('/v1/dashboard/summary');
  expect(after.body.month.income.amount).toBe('0.00');
  expect(after.body.month.received.amount).toBe('100.00');
});

test('dívida sem movimentação (eu devo, com categoria): consumo de dívida no Início e na visão por competência; estornar o registro', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(300_000);
  net.checkDuplicates = false;
  await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const maria = await api.ok(api.call('POST', '/v1/people', { name: 'Maria', notes: null }), [201]);
  await signIn(page);

  await open(page, '/quick-add?mode=debt');
  await cy(page, 'debt-direction-PAYABLE').click();
  await cy(page, 'debt-principal').fill('80,00');
  await cy(page, 'debt-principal').blur();
  await pickValue(page, 'debt-person', maria.id);
  await cy(page, 'debt-description').fill('Jantar que a Maria pagou');
  await pick(page, 'debt-category', 'Alimentação');
  await cy(page, 'form-save').click();
  await expect(cy(page, 'toast-info')).toBeVisible();
  const debt = await net.body('POST', '/v1/debts', 'first');
  expect(net.find('POST', '/v1/debts')[0]?.idempotencyKey).toBeTruthy();
  expect(debt.origin).toBe('WITHOUT_MOVEMENT');
  expect(debt.direction).toBe('PAYABLE');
  expect(debt.category).not.toBeNull();

  // Não mexe no caixa; entra no consumo (e no total do mês) pela dívida.
  const accounts = await api.get('/v1/accounts');
  expect(accounts.body.items[0].currentBalance.amount).toBe('1000.00');
  await open(page, '/planning/overview');
  await expect(cy(page, 'home-legacy')).toBeVisible();
  const summary = await net.body('GET', '/v1/dashboard/summary');
  expect(summary.month.debtConsumption.amount).toBe('80.00');
  expect(await cyText(page, 'home-month-debt-consumption')).toBe(
    fmt(summary.month.debtConsumption.amount),
  );
  expect(await cyText(page, 'home-month-consumption')).toBe(fmt(summary.month.consumption.amount));

  await open(page, '/transactions?view=entries');
  const entries = await net.body('GET', '/v1/entries');
  expect(entries.debtItems).toHaveLength(1);
  expect(norm(await cy(page, 'debt-entry-row-0').innerText())).toContain(
    fmt(entries.debtItems[0].amount.amount),
  );
  expect(await cyText(page, 'totals-footer-total')).toBe(fmt(entries.totals.total.amount));

  // Sem quitações e sem movimentação de origem, o registro pode ser estornado.
  await cy(page, 'debt-entry-row-0').click();
  await expect(page).toHaveURL(new RegExp(`/debts/${debt.id}$`));
  await expect(cy(page, 'debt-void')).not.toHaveAttribute('aria-disabled', 'true');
  await cy(page, 'debt-void').click();
  await cy(page, 'confirm-dialog-reason').fill('lancei duas vezes');
  await cy(page, 'confirm-dialog-confirm').click();
  const voided = await net.body('POST', `/v1/debts/${debt.id}/void`);
  expect(voided.status).toBe('VOIDED');
  expect(await cyText(page, 'debt-status')).toBe('Estornada');
  const afterVoid = await api.get('/v1/dashboard/summary');
  expect(afterVoid.body.month.debtConsumption.amount).toBe('0.00');
  void brl;
});

test('estornar a origem de uma dívida com quitação: a ação fica desabilitada com a explicação (DEBT_HAS_SETTLEMENTS)', async ({
  page,
  api,
  signIn,
}) => {
  test.setTimeout(240_000);
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const joao = await api.ok(api.call('POST', '/v1/people', { name: 'João', notes: null }), [201]);
  const loan = await api.txOk({
    type: 'LOAN_GIVEN',
    amount: '300.00',
    date: todayInSaoPaulo(),
    description: 'Empréstimo',
    notes: null,
    accountId: nubank.id,
    newDebt: { personId: joao.id, expectedDate: null, description: null },
  });
  await api.txOk({
    type: 'MONEY_RECEIVED',
    amount: '100.00',
    date: todayInSaoPaulo(),
    description: 'Devolução',
    notes: null,
    accountId: nubank.id,
    debtId: loan.debt.id,
  });
  await signIn(page);

  await open(page, `/transactions/${loan.id}`);

  await expect(cy(page, 'void-open')).toHaveAttribute('aria-disabled', 'true');
  await expect(cy(page, 'void-blocked')).toContainText('Estorne antes os pagamentos');
});
