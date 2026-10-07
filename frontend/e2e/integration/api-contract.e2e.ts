/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto';

import { Api, brl, expense, income, todayInSaoPaulo } from '../support/api';
import { findOperation, OPERATIONS_IN_CONTRACT } from '../support/contract';

import { expect, resetDatabase, test } from './fixtures';

/**
 * T44 CA5: a API real contra o contrato, sem navegador. Cada requisição e resposta passa pelo ajv
 * (o fixture `api` falha o teste listando operação e caminho). Cobre os pontos que o front deixou sem
 * confirmar: replay de idempotência, 409 de versão, validação, 404, 401 e a consistência entre as visões.
 */
test.beforeEach(() => resetDatabase());

const cents = (v: string): bigint => BigInt(v.replace('.', ''));

test('idempotência: mesma chave+comando devolve o mesmo recurso; comando diferente é 409; erro não é memorizado', async ({
  api,
}) => {
  const acc = await api.createAccount({ name: 'Conta', openingBalance: '100.00' });
  const food = await api.categoryId('Alimentação');
  const key = randomUUID();
  const body = expense({
    amount: '10.00',
    accountId: acc.id,
    categoryId: food,
    description: 'idem',
  });

  const first = await api.tx(body, key);
  expect(first.status).toBe(201);
  expect(first.headers['location']).toContain(`/v1/transactions/${first.body.id}`);
  const replay = await api.tx(body, key);
  expect(replay.status).toBe(201);
  expect(replay.body.id).toBe(first.body.id);
  expect((await api.get('/v1/transactions?pageSize=50')).body.items).toHaveLength(1);

  // Replay devolve o ESTADO ATUAL: depois de uma edição, a mesma chave mostra a versão nova.
  const put = await api.call('PUT', `/v1/transactions/${first.body.id}`, {
    ...body,
    amount: '12.00',
    version: first.body.version,
  });
  expect(put.status).toBe(200);
  const replay2 = await api.tx(body, key);
  expect(replay2.status).toBe(201);
  expect(replay2.body.amount.amount).toBe('12.00');

  const other = await api.tx({ ...body, amount: '11.00' }, key);
  expect(other.status).toBe(409);
  expect(other.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

  // Erro não é memorizado: a mesma chave, depois de um 422, aceita o comando corrigido.
  const key2 = randomUUID();
  const bad = await api.tx({ ...body, amount: '0.00' }, key2);
  expect(bad.status).toBe(422);
  expect(bad.body.code).toBe('TRANSACTION_AMOUNT_NOT_POSITIVE');
  const fixed = await api.tx({ ...body, description: 'corrigida' }, key2);
  expect(fixed.status).toBe(201);

  // Sem a chave: 400.
  const noKey = await api.call('POST', '/v1/transactions', body);
  expect(noKey.status).toBe(400);
  expect(noKey.body.code).toBe('VALIDATION_FAILED');

  // Execuções concorrentes com a mesma chave: uma só criação.
  const key3 = randomUUID();
  const racers = await Promise.all(
    Array.from({ length: 5 }, () => api.tx({ ...body, description: 'corrida' }, key3)),
  );
  const ids = new Set(racers.filter((r) => r.status === 201).map((r) => r.body.id));
  expect(ids.size).toBe(1);
  expect(racers.every((r) => [201, 409].includes(r.status))).toBe(true);
  const all = (await api.get('/v1/transactions?q=corrida&pageSize=50')).body.items;
  expect(all).toHaveLength(1);
});

test('Idempotency-Key opcional em POST /v1/people, /v1/debts e /v1/recurrences: replay não duplica; corpo diferente é 409', async ({
  api,
}) => {
  const acc = await api.createAccount({ name: 'Conta', openingBalance: '0.00' });
  const food = await api.categoryId('Alimentação');
  const person = await api.ok(api.call('POST', '/v1/people', { name: 'Chave', notes: null }));
  const today = todayInSaoPaulo();
  const cases: { path: string; body: Record<string, unknown>; changed: Record<string, unknown> }[] =
    [
      {
        path: '/v1/people',
        body: { name: 'Maria', notes: null },
        changed: { name: 'Maria Souza', notes: null },
      },
      {
        path: '/v1/debts',
        body: {
          personId: person.id,
          direction: 'RECEIVABLE',
          principal: '10.00',
          date: today,
          expectedDate: null,
          description: 'chave',
        },
        changed: {
          personId: person.id,
          direction: 'RECEIVABLE',
          principal: '11.00',
          date: today,
          expectedDate: null,
          description: 'chave',
        },
      },
      {
        path: '/v1/recurrences',
        body: {
          type: 'EXPENSE',
          amount: '19.00',
          description: 'chave',
          categoryId: food,
          accountId: acc.id,
          method: 'PIX',
          frequency: 'MONTHLY',
          startDate: today,
          endDate: null,
          maxOccurrences: null,
        },
        changed: {
          type: 'EXPENSE',
          amount: '20.00',
          description: 'chave',
          categoryId: food,
          accountId: acc.id,
          method: 'PIX',
          frequency: 'MONTHLY',
          startDate: today,
          endDate: null,
          maxOccurrences: null,
        },
      },
    ];
  for (const { path, body, changed } of cases) {
    const key = randomUUID();
    const first = await api.call('POST', path, body, { headers: { 'Idempotency-Key': key } });
    expect(first.status, path).toBe(201);
    const replay = await api.call('POST', path, body, { headers: { 'Idempotency-Key': key } });
    expect(replay.status, path).toBe(201);
    expect(replay.body.id, path).toBe(first.body.id);
    const other = await api.call('POST', path, changed, { headers: { 'Idempotency-Key': key } });
    expect(other.status, path).toBe(409);
    expect(other.body.code, path).toBe('IDEMPOTENCY_KEY_REUSED');
    // Sem a chave, cada chamada cria um recurso novo (a chave é opcional).
    const a = await api.call('POST', path, body);
    const b = await api.call('POST', path, body);
    expect(a.status, path).toBe(201);
    expect(b.body.id, path).not.toBe(a.body.id);
  }
  expect((await api.get('/v1/recurrences?pageSize=50')).body.items).toHaveLength(3);
});

test('409 de versão em conta, categoria e movimentação; 404 e 400 de caminho', async ({ api }) => {
  const acc = await api.createAccount({ name: 'Conta', openingBalance: '10.00' });
  const food = await api.categoryId('Alimentação');
  const cat = await api.ok(api.call('POST', '/v1/categories', { name: 'Temp', kind: 'EXPENSE' }));
  const tx = await api.txOk(expense({ amount: '1.00', accountId: acc.id, categoryId: food }));

  const accPut = await api.call('PUT', `/v1/accounts/${acc.id}`, {
    name: 'N1',
    version: acc.version,
  });
  expect(accPut.status).toBe(200);
  const accStale = await api.call('PUT', `/v1/accounts/${acc.id}`, {
    name: 'N2',
    version: acc.version,
  });
  expect(accStale.status).toBe(409);
  expect(accStale.body.code).toBe('VERSION_CONFLICT');

  expect(
    (await api.call('PUT', `/v1/categories/${cat.id}`, { name: 'Temp2', version: cat.version }))
      .status,
  ).toBe(200);
  const catStale = await api.call('PUT', `/v1/categories/${cat.id}`, {
    name: 'Temp3',
    version: cat.version,
  });
  expect(catStale.status).toBe(409);

  const txBody = { ...expense({ amount: '2.00', accountId: acc.id, categoryId: food }) };
  expect(
    (await api.call('PUT', `/v1/transactions/${tx.id}`, { ...txBody, version: tx.version })).status,
  ).toBe(200);
  const txStale = await api.call('PUT', `/v1/transactions/${tx.id}`, {
    ...txBody,
    version: tx.version,
  });
  expect(txStale.status).toBe(409);
  expect(txStale.body.code).toBe('VERSION_CONFLICT');

  const ghost = randomUUID();
  expect((await api.get(`/v1/accounts/${ghost}`)).body.code).toBe('ACCOUNT_NOT_FOUND');
  expect(
    (await api.call('PUT', `/v1/categories/${ghost}`, { name: 'x', version: 0 })).body.code,
  ).toBe('CATEGORY_NOT_FOUND');
  expect((await api.get(`/v1/transactions/${ghost}`)).body.code).toBe('TRANSACTION_NOT_FOUND');
  expect((await api.call('POST', `/v1/transactions/${ghost}/void`, { reason: 'x' })).status).toBe(
    404,
  );
  const malformed = await api.get('/v1/transactions/nao-e-uuid');
  expect(malformed.status).toBe(400);
});

test('validação, paginação e autenticação', async ({ api, playwright, baseURL }) => {
  const acc = await api.createAccount({ name: 'Conta', openingBalance: '10.00' });
  const food = await api.categoryId('Alimentação');
  const good = expense({ amount: '1.00', accountId: acc.id, categoryId: food });

  expect((await api.get('/v1/transactions?page=0')).status).toBe(400);
  expect((await api.get('/v1/transactions?pageSize=51')).status).toBe(400);
  expect((await api.get('/v1/accounts?pageSize=51')).status).toBe(400);
  expect((await api.get('/v1/entries')).status).toBe(400); // competence obrigatória

  const noValidate = { validate: false, headers: { 'Idempotency-Key': randomUUID() } };
  const num = await api.call('POST', '/v1/transactions', { ...good, amount: 10.5 }, noValidate);
  expect(num.status).toBe(400);
  const three = await api.call(
    'POST',
    '/v1/transactions',
    { ...good, amount: '10.005' },
    { ...noValidate, headers: { 'Idempotency-Key': randomUUID() } },
  );
  expect(three.status).toBe(400);
  const huge = await api.tx({ ...good, amount: '9999999999999.00' });
  expect(huge.status).toBe(422);
  expect(huge.body.code).toBe('AMOUNT_ABOVE_LIMIT');
  const extra = await api.call(
    'POST',
    '/v1/transactions',
    { ...good, surprise: 1 },
    { validate: false, headers: { 'Idempotency-Key': randomUUID() } },
  );
  // O contrato declara `additionalProperties: false`: campo desconhecido é 400 VALIDATION_FAILED / UNKNOWN_FIELD.
  expect(extra.status).toBe(400);
  expect(extra.body.code).toBe('VALIDATION_FAILED');
  expect(extra.body.errors[0].code).toBe('UNKNOWN_FIELD');
  const card = await api.call(
    'POST',
    '/v1/transactions',
    { type: 'CARD_PURCHASE', amount: '1.00', date: good.date, description: 'x' },
    { validate: false, headers: { 'Idempotency-Key': randomUUID() } },
  );
  expect([400, 422]).toContain(card.status);
  const wrongFormat = await api.call(
    'POST',
    '/v1/accounts',
    { name: '', type: 'CHECKING', openingBalance: brl('1.00'), openingDate: todayInSaoPaulo() },
    { validate: false },
  );
  expect(wrongFormat.status).toBe(400);

  // Sem token / token inválido: 401 UNAUTHENTICATED (corpo do contrato).
  const anon = await playwright.request.newContext({ baseURL });
  const res = await anon.get('/v1/accounts');
  expect(res.status()).toBe(401);
  expect((await res.json()).code).toBe('UNAUTHENTICATED');
  const garbage = await anon.get('/v1/accounts', {
    headers: { Authorization: 'Bearer lixo.lixo.lixo' },
  });
  expect(garbage.status()).toBe(401);
  // Refresh sem cookie e sem Origin válida.
  const noOrigin = await anon.post('/v1/auth/refresh', {
    headers: { Origin: 'https://evil.example' },
  });
  expect(noOrigin.status()).toBe(403);
  expect((await noOrigin.json()).code).toBe('ORIGIN_NOT_ALLOWED');
  const noCookie = await anon.post('/v1/auth/refresh', { headers: { Origin: baseURL ?? '' } });
  expect(noCookie.status()).toBe(401);
  await anon.dispose();
});

test('consistência (PR 01 regra 10): dashboard, lista, entries e saldos das contas batem exatamente', async ({
  api,
}) => {
  const a = await api.createAccount({ name: 'A', openingBalance: '1000.00' });
  const b = await api.createAccount({ name: 'B', type: 'SAVINGS', openingBalance: '200.00' });
  const inv = await api.createAccount({
    name: 'Inv',
    type: 'INVESTMENT',
    openingBalance: '300.00',
  });
  const food = await api.categoryId('Alimentação');
  const fun = await api.categoryId('Lazer');
  const salary = await api.categoryId('Salário', 'INCOME');
  const today = todayInSaoPaulo();

  const meal = await api.txOk(
    expense({ amount: '123.45', accountId: a.id, categoryId: food, description: 'jantar' }),
  );
  await api.txOk(expense({ amount: '10.10', accountId: b.id, categoryId: fun, method: 'DEBIT' }));
  await api.txOk(income({ amount: '3000.00', accountId: a.id, categoryId: salary }));
  await api.txOk({
    type: 'TRANSFER',
    amount: '77.77',
    date: today,
    description: 't',
    notes: null,
    fromAccountId: a.id,
    toAccountId: b.id,
  });
  await api.txOk({
    type: 'INVESTMENT',
    amount: '500.00',
    date: today,
    description: 'aporte',
    notes: null,
    cashAccountId: a.id,
    investmentAccountId: inv.id,
    direction: 'CONTRIBUTION',
  });
  await api.txOk({
    type: 'INVESTMENT',
    amount: '50.00',
    date: today,
    description: 'resgate',
    notes: null,
    cashAccountId: a.id,
    investmentAccountId: inv.id,
    direction: 'REDEMPTION',
  });
  await api.txOk({
    type: 'ADJUSTMENT',
    amount: '3.33',
    date: today,
    description: 'aj',
    notes: null,
    accountId: b.id,
    direction: 'DECREASE',
    kind: 'CORRECTION',
    reason: 'extrato',
  });
  const refund = await api.txOk({
    type: 'REFUND',
    amount: '23.45',
    date: today,
    description: 'r',
    notes: null,
    accountId: a.id,
    categoryId: food,
    refundOfTransactionId: meal.id,
  });
  const voided = await api.txOk(
    expense({ amount: '999.00', accountId: a.id, categoryId: food, description: 'estornada' }),
  );
  expect(
    (await api.call('POST', `/v1/transactions/${voided.id}/void`, { reason: 'erro' })).status,
  ).toBe(200);

  const s = (await api.get('/v1/dashboard/summary')).body;
  const list = (await api.get('/v1/transactions?pageSize=50')).body;
  const entries = (await api.get(`/v1/entries?competence=${today.slice(0, 7)}&pageSize=50`)).body;
  const entriesIncome = (
    await api.get(`/v1/entries?competence=${today.slice(0, 7)}&lens=INCOME&pageSize=50`)
  ).body;
  const accounts = (await api.get('/v1/accounts?pageSize=50')).body.items;

  // consumo: despesas - reembolso; igual em dashboard e entries
  expect(s.month.consumption.amount).toBe('110.10'); // 123.45 + 10.10 - 23.45
  expect(entries.totals.total.amount).toBe(s.month.consumption.amount);
  expect(s.month.refunds.amount).toBe('23.45');
  // receita
  expect(s.month.income.amount).toBe('3000.00');
  expect(entriesIncome.totals.total.amount).toBe(s.month.income.amount);
  // fluxo de caixa do mês = totais da lista no mês inteiro
  expect(list.totals.cashFlow.in.amount).toBe(s.month.cashFlow.in.amount);
  expect(list.totals.cashFlow.out.amount).toBe(s.month.cashFlow.out.amount);
  expect(list.totals.cashFlow.net.amount).toBe(s.month.cashFlow.net.amount);
  expect(cents(s.month.cashFlow.in.amount) - cents(s.month.cashFlow.out.amount)).toBe(
    cents(s.month.cashFlow.net.amount),
  );
  // transferência CASH->CASH não aparece em consumo nem altera o total em contas
  // total em contas = soma dos saldos CASH; investimentos = saldo da conta de investimento
  const cash = accounts
    .filter((x: any) => x.liquidity === 'CASH')
    .reduce((sum: bigint, x: any) => sum + cents(x.currentBalance.amount), 0n);
  const invested = accounts
    .filter((x: any) => x.liquidity === 'INVESTMENT')
    .reduce((sum: bigint, x: any) => sum + cents(x.currentBalance.amount), 0n);
  expect(cents(s.balances.inAccounts.amount)).toBe(cash);
  expect(cents(s.balances.investments.amount)).toBe(invested);
  // saldos esperados, conta a conta
  const bal = (id: string) => accounts.find((x: any) => x.id === id).currentBalance.amount;
  expect(bal(a.id)).toBe('3372.23'); // 1000 - 123.45 + 3000 - 77.77 - 500 + 50 + 23.45
  expect(bal(b.id)).toBe('264.34'); // 200 - 10.10 + 77.77 - 3.33
  expect(bal(inv.id)).toBe('750.00'); // 300 + 500 - 50
  // estornada não entra em nada e só aparece com status=VOIDED
  expect(list.items.some((i: any) => i.id === voided.id)).toBe(false);
  expect(
    (await api.get('/v1/transactions?status=VOIDED&pageSize=50')).body.items.map((i: any) => i.id),
  ).toContain(voided.id);
  expect((await api.get('/v1/transactions?status=VOIDED')).body.totals.count).toBe(0);
  void refund;
});

/**
 * Operações da Etapa 3 (cartões, faturas, parcelas). Elas receberam uma chamada de fumaça (id nulo,
 * corpo vazio): respondem, validam contra o contrato e não dão 5xx. Os fluxos de negócio da Etapa 3 são
 * testados na própria etapa. (Enquanto o backend as entregava, uma lista explícita de pendentes e uma
 * sentinela as deixavam fora da cobertura; quando a última passou a ter handler, a lista foi esvaziada
 * e apagada.)
 */
const STAGE_3_OPERATIONS = [
  'POST /v1/transactions/{id}/cancel-installments',
  'GET /v1/cards',
  'POST /v1/cards',
  'GET /v1/cards/{id}',
  'PUT /v1/cards/{id}',
  'POST /v1/cards/{id}/archive',
  'POST /v1/cards/{id}/unarchive',
  'GET /v1/cards/{id}/invoices',
  'GET /v1/cards/{id}/future-installments',
  'POST /v1/cards/{id}/purchase-preview',
  'GET /v1/cards/{id}/billing-change-preview',
  'GET /v1/invoices/{id}',
  'GET /v1/invoices/{id}/payment-preview',
  'POST /v1/invoices/{id}/payments',
];

/**
 * Operações da Etapa 5 (metas, resumo mensal, projeção, exportações): o front ainda não as consome,
 * mas o backend as entrega e o contrato as declara. Chamada de fumaça (id nulo, corpo vazio): têm
 * handler, validam contra o contrato e não dão 5xx. Os fluxos de negócio são testados na etapa delas.
 */
const STAGE_5_OPERATIONS = [
  'GET /v1/goals',
  'POST /v1/goals',
  'GET /v1/goals/{id}',
  'PUT /v1/goals/{id}',
  'POST /v1/goals/{id}/reservations',
  'POST /v1/goals/{id}/archive',
  'POST /v1/goals/{id}/unarchive',
  'GET /v1/summaries/{month}',
  'GET /v1/projections',
  'GET /v1/exports/transactions.csv',
  'GET /v1/exports/backup',
];

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Chama a operação com id nulo e corpo vazio (sem conferir o corpo enviado: só a resposta). */
function smoke(api: Api, operation: string) {
  const [method, template] = operation.split(' ') as [string, string];
  const path = template
    .replace('{id}', NIL_UUID)
    .replace('{month}', todayInSaoPaulo().slice(0, 7))
    .replace('{date}', todayInSaoPaulo());
  const body = method === 'POST' || method === 'PUT' ? {} : undefined;
  // O CSV não é JSON: o validador do contrato só lê corpo JSON, então esta resposta não é conferida.
  const csv = template.endsWith('.csv');
  return api.call(method, path, body, { validateRequest: false, validate: !csv });
}

/** Rota que o Spring não conhece: 404 genérico (`NOT_FOUND`) ou 405. Um 404 de domínio traz outro código. */
const isUnrouted = (res: { status: number; body: any }): boolean =>
  res.status === 405 || (res.status === 404 && res.body?.code === 'NOT_FOUND');

test('todas as operações do contrato respondem e validam (cobertura de operationId)', async ({
  api,
  playwright,
  baseURL,
}) => {
  const acc = await api.createAccount({ name: 'Conta', openingBalance: '0.00' });
  const food = await api.categoryId('Alimentação');
  const tx = await api.txOk(expense({ amount: '1.00', accountId: acc.id, categoryId: food }));
  const cat = await api.ok(
    api.call('POST', '/v1/categories', { name: 'Cobertura', kind: 'INCOME' }),
  );
  const today = todayInSaoPaulo();

  await api.get('/v1/accounts');
  await api.get(`/v1/accounts/${acc.id}`);
  await api.get('/v1/categories');
  await api.get(`/v1/transactions/${tx.id}`);
  await api.get('/v1/transactions');
  await api.get(`/v1/entries?competence=${today.slice(0, 7)}`);
  await api.get('/v1/dashboard/summary');
  await api.get('/v1/dashboard/upcoming');
  const arch = await api.call('POST', `/v1/categories/${cat.id}/archive`);
  expect(arch.status).toBe(200);
  expect((await api.call('POST', `/v1/categories/${cat.id}/unarchive`)).status).toBe(200);
  const zero = await api.createAccount({ name: 'Zero', openingBalance: '0.00' });
  expect((await api.call('POST', `/v1/accounts/${zero.id}/archive`)).status).toBe(200);
  expect((await api.call('POST', `/v1/accounts/${zero.id}/unarchive`)).status).toBe(200);
  const upd = await api.call('PUT', `/v1/transactions/${tx.id}`, {
    ...expense({ amount: '2.00', accountId: acc.id, categoryId: food }),
    version: tx.version,
  });
  expect(upd.status).toBe(200);
  expect(
    (await api.call('POST', `/v1/transactions/${tx.id}/void`, { reason: 'cobertura' })).status,
  ).toBe(200);
  await api.call('PUT', `/v1/accounts/${acc.id}`, {
    name: 'Conta 2',
    version: (await api.get(`/v1/accounts/${acc.id}`)).body.version,
  });
  await api.call('PUT', `/v1/categories/${cat.id}`, {
    name: 'Cobertura 2',
    version: (await api.get('/v1/categories')).body.find((c: any) => c.id === cat.id).version,
  });

  // Auth: login (já feito), refresh e logout com o cookie real do contexto de requisição.
  const auth = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL ?? '' },
  });
  const sink: any[] = [];
  const authApi = new Api(auth, sink);
  await authApi.login();
  const ref = await authApi.call('POST', '/v1/auth/refresh', undefined, { auth: false });
  expect(ref.status).toBe(200);
  const out = await authApi.call('POST', '/v1/auth/logout', undefined, { auth: false });
  expect(out.status).toBe(204);
  expect(sink).toEqual([]);
  await auth.dispose();

  // Etapa 3: chamada de fumaça em cada operação (tem handler, valida o contrato, nunca 5xx).
  for (const operation of STAGE_3_OPERATIONS) {
    const res = await smoke(api, operation);
    expect(res.status, `${operation} respondeu ${res.status}`).toBeLessThan(500);
    expect(isUnrouted(res), `${operation} não tem handler no backend`).toBe(false);
  }

  // Etapa 4: pessoas, dívidas e recorrências com dados reais (cada operação responde e valida).
  const key = () => ({ 'Idempotency-Key': randomUUID() });
  const person = await api.ok(
    api.call('POST', '/v1/people', { name: 'Cobertura', notes: null }, { headers: key() }),
  );
  expect((await api.get('/v1/people')).status).toBe(200);
  expect((await api.get(`/v1/people/${person.id}`)).status).toBe(200);
  const renamed = await api.ok(
    api.call('PUT', `/v1/people/${person.id}`, {
      name: 'Cobertura 2',
      notes: 'nota',
      version: person.version,
    }),
  );
  expect((await api.call('POST', `/v1/people/${person.id}/archive`)).status).toBe(200);
  expect((await api.call('POST', `/v1/people/${person.id}/unarchive`)).status).toBe(200);
  const debtBody = (description: string) => ({
    personId: person.id,
    direction: 'RECEIVABLE',
    principal: '10.00',
    date: today,
    expectedDate: null,
    description,
  });
  const debtA = await api.ok(
    api.call('POST', '/v1/debts', debtBody('cobertura A'), { headers: key() }),
  );
  const debtB = await api.ok(
    api.call('POST', '/v1/debts', debtBody('cobertura B'), { headers: key() }),
  );
  expect((await api.get('/v1/debts')).status).toBe(200);
  expect((await api.get(`/v1/debts/${debtA.id}`)).status).toBe(200);
  expect(
    (
      await api.call('PUT', `/v1/debts/${debtA.id}`, {
        description: 'cobertura A2',
        expectedDate: null,
        version: debtA.version,
      })
    ).status,
  ).toBe(200);
  expect(
    (await api.call('POST', `/v1/debts/${debtA.id}/cancel`, { reason: 'cobertura' })).status,
  ).toBe(200);
  expect(
    (await api.call('POST', `/v1/debts/${debtB.id}/void`, { reason: 'cobertura' })).status,
  ).toBe(200);

  const recurrenceBody = (description: string) => ({
    type: 'EXPENSE',
    amount: '19.00',
    description,
    categoryId: food,
    accountId: acc.id,
    method: 'PIX',
    frequency: 'MONTHLY',
    startDate: today,
    endDate: null,
    maxOccurrences: null,
  });
  const recA = await api.ok(
    api.call('POST', '/v1/recurrences', recurrenceBody('cobertura R1'), { headers: key() }),
  );
  const recB = await api.ok(
    api.call('POST', '/v1/recurrences', recurrenceBody('cobertura R2'), { headers: key() }),
  );
  const recC = await api.ok(
    api.call('POST', '/v1/recurrences', recurrenceBody('cobertura R3'), { headers: key() }),
  );
  expect((await api.get('/v1/recurrences')).status).toBe(200);
  expect((await api.get('/v1/recurrences/summary')).status).toBe(200);
  expect(
    (
      await api.get(
        `/v1/recurrences/occurrences?status=PENDING&from=${today}&to=${todayInSaoPaulo(60)}`,
      )
    ).status,
  ).toBe(200);
  expect((await api.get(`/v1/recurrences/${recA.id}`)).status).toBe(200);
  expect(
    (
      await api.call('PUT', `/v1/recurrences/${recA.id}`, {
        amount: '21.00',
        description: 'cobertura R1b',
        categoryId: food,
        accountId: acc.id,
        method: 'PIX',
        endDate: null,
        version: recA.version,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api.call(
        'POST',
        `/v1/recurrences/${recA.id}/occurrences/${today}/realize`,
        {},
        { headers: key() },
      )
    ).status,
  ).toBe(201);
  expect((await api.call('POST', `/v1/recurrences/${recA.id}/end`, {})).status).toBe(200);
  expect(
    (await api.call('POST', `/v1/recurrences/${recB.id}/occurrences/${today}/skip`)).status,
  ).toBe(200);
  expect((await api.call('POST', `/v1/recurrences/${recC.id}/deactivate`)).status).toBe(200);
  void renamed;

  // Etapa 5: fumaça.
  for (const operation of STAGE_5_OPERATIONS) {
    const res = await smoke(api, operation);
    expect(res.status, `${operation} respondeu ${res.status}`).toBeLessThan(500);
    expect(isUnrouted(res), `${operation} não tem handler no backend`).toBe(false);
  }

  const called = new Set(
    [...api.calls, ...authApi.calls].map((c) => {
      const op = findOperation(c.method, c.path.split('?')[0] as string);
      return op ? `${c.method.toUpperCase()} ${op.template}` : `?? ${c.method} ${c.path}`;
    }),
  );
  const missing = OPERATIONS_IN_CONTRACT.filter((o) => !called.has(o));
  expect(missing, 'operações do contrato sem chamada').toEqual([]);
  expect([...called].filter((c) => c.startsWith('??'))).toEqual([]);
  void income;
});
