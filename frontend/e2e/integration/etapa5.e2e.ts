/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';

import { todayInSaoPaulo } from '../support/api';

import { cy, cyText, expect, fmt, norm, open, pick, resetDatabase, test } from './fixtures';

/**
 * Etapa 5 com o backend real (T99 a T104 do front): metas com reserva lógica, `reserved` e `available` no
 * Início, resumo mensal, projeções e exportação. O teste só **compara a tela com a API**: o
 * front não calcula percentuais, saldos, reservas nem projeções. A reserva não pode mudar o saldo da conta.
 * **Escrito, não executado pelo dev-frontend** (o backend da Etapa 5 estava sendo recompilado): a QA roda
 * `npm run e2e:integration` com o backend estável.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(() => resetDatabase());

const MONTH = (): string => todayInSaoPaulo().slice(0, 7);

/** Fechamento que nunca cai no dia de hoje (compra no dia do fechamento vai para a fatura seguinte, S-12). */
function closingDayAwayFromToday(): number {
  const day = Number(todayInSaoPaulo().slice(8, 10));
  return ((day + 9) % 28) + 1;
}

async function createGoal(api: any, overrides: Record<string, unknown> = {}) {
  return api.ok(
    api.call('POST', '/v1/goals', {
      name: 'Reserva de emergência',
      target: '20000.00',
      deadline: null,
      priority: 'HIGH',
      description: null,
      ...overrides,
    }),
    [201],
  );
}

test('jornada: criar a meta → reservar 8.500,00 → ver reservado e disponível no Início → liberar → resumo → projeções → exportar CSV; a reserva nunca muda o saldo da conta', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(300_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const before = await api.get(`/v1/accounts/${nubank.id}`);
  await signIn(page);

  // 1. Cria a meta pela tela.
  await open(page, '/goals/new');
  await cy(page, 'goal-name').fill('Reserva de emergência');
  await cy(page, 'goal-target').fill('20.000,00');
  await cy(page, 'goal-target').blur();
  await cy(page, 'goal-priority-HIGH').click();
  await cy(page, 'goal-form-save').click();
  await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/);
  const created = await net.body('POST', '/v1/goals', 'first');
  expect(net.find('POST', '/v1/goals')[0]?.idempotencyKey).toBeTruthy();
  expect(created.current.amount).toBe('0.00');
  expect(created.progress).toBe('0.0000');

  // 2. Reserva 8.500,00 na Nubank pela folha: o corpo leva o valor positivo e a Idempotency-Key.
  await cy(page, 'goal-reserve').click();
  await expect(cy(page, 'reserve-not-money')).toBeVisible();
  await pick(page, 'reserve-account', 'Nubank');
  await cy(page, 'reserve-amount').fill('8.500,00');
  await cy(page, 'reserve-amount').blur();
  await cy(page, 'reserve-submit').click();
  await expect(cy(page, 'reserve-form')).toBeHidden();
  const reserve = net.find('POST', `/v1/goals/${created.id}/reservations`)[0];
  expect(reserve?.idempotencyKey).toBeTruthy();
  expect((reserve?.requestBody as any).amount).toBe('8500.00');
  const goal = await net.body('POST', `/v1/goals/${created.id}/reservations`);

  // 3. A tela mostra o que a API calculou: 42,5%, atual, falta (nenhuma conta no front).
  expect(goal.current.amount).toBe('8500.00');
  expect(await cyText(page, 'goal-percent')).toBe('42,5%');
  expect(await cyText(page, 'goal-current')).toBe(fmt(goal.current.amount));
  expect(await cyText(page, 'goal-remaining')).toBe(fmt(goal.remaining.amount));
  expect(await cyText(page, 'goal-target')).toBe(fmt('20000.00'));
  await expect(cy(page, 'goal-reservations').locator('li')).toHaveCount(1);

  // 4. O saldo da conta NÃO mudou (reserva lógica) e nenhuma movimentação nasceu.
  const after = await api.get(`/v1/accounts/${nubank.id}`);
  expect(after.body.currentBalance.amount).toBe(before.body.currentBalance.amount);
  expect(after.body.reservedAmount.amount).toBe('8500.00');
  const transactions = await api.get('/v1/transactions');
  expect(transactions.body.items).toHaveLength(0);

  // 5. O Início mostra reservado e disponível exatamente como a API.
  await open(page, '/');
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  const summary = await net.body('GET', '/v1/dashboard/summary');
  expect(summary.balances.reserved.amount).toBe('8500.00');
  expect(await cyText(page, 'home-reserved')).toBe(fmt(summary.balances.reserved.amount));
  expect(await cyText(page, 'home-available')).toBe(fmt(summary.balances.available.amount));
  await expect(cy(page, 'home-reserved-goals')).toBeVisible();

  // 6. Libera 2.000,00 pela chave "Liberar": o corpo leva o valor negativo e o atual cai.
  await open(page, `/goals/${created.id}`);
  await cy(page, 'goal-release').click();
  await pick(page, 'reserve-account', 'Nubank');
  await cy(page, 'reserve-amount').fill('2.000,00');
  await cy(page, 'reserve-amount').blur();
  await cy(page, 'reserve-submit').click();
  await expect(cy(page, 'reserve-form')).toBeHidden();
  const release = net.find('POST', `/v1/goals/${created.id}/reservations`).at(-1);
  expect((release?.requestBody as any).amount).toBe('-2000.00');
  const released = await net.body('POST', `/v1/goals/${created.id}/reservations`);
  expect(released.current.amount).toBe('6500.00');
  expect(await cyText(page, 'goal-current')).toBe(fmt('6500.00'));
  expect(await cyText(page, 'goal-percent')).toBe('32,5%');
  await expect(cy(page, 'goal-reservations').locator('li')).toHaveCount(2);

  // 7. O resumo do mês: cada número é o da API.
  await open(page, `/planning/summary/${MONTH()}`);
  const monthly = await net.body('GET', `/v1/summaries/${MONTH()}`);
  expect(await cyText(page, 'summary-income')).toContain(fmt(monthly.income.amount));
  expect(await cyText(page, 'summary-expenses')).toContain(fmt(monthly.expenses.amount));
  expect(await cyText(page, 'summary-investments')).toContain(fmt(monthly.investments.amount));
  expect(await cyText(page, 'summary-net')).toContain(fmt(monthly.net.amount));
  await expect(cy(page, 'summary-partial')).toBeVisible();
  await expect(cy(page, 'summary-analyze')).toHaveCount(0);
  await expect(cy(page, 'summary-analyze-note')).toBeVisible();

  // 8. Projeções: rotuladas como projeção; a série e as premissas são as da API; a reserva não é saída.
  await open(page, '/planning/projections');
  await expect(cy(page, 'projection-banner-title')).toHaveText('Projeção, não certeza.');
  const projection = await net.body('GET', '/v1/projections');
  expect(projection.isProjection).toBe(true);
  for (const point of projection.series) {
    expect(await cyText(page, `projection-balance-${point.competence}`)).toBe(
      fmt(point.balance.amount),
    );
  }
  for (const key of projection.assumptions as string[]) {
    await expect(cy(page, `projection-assumption-${key}`)).toBeVisible();
  }
  expect(await cyText(page, 'projection-goals-reserved')).toContain(
    fmt(projection.goals.reserved.amount),
  );

  // 9. Exportar o CSV: download autenticado (Blob), nome do Content-Disposition, sem token na URL.
  await open(page, '/settings');
  await cy(page, 'export-csv-action').click();
  const downloading = page.waitForEvent('download');
  await cy(page, 'export-save').click();
  const download = await downloading;
  const csvCall = net.find('GET', '/v1/exports/transactions.csv').at(-1);
  expect(csvCall?.authorization).toBe(true);
  expect(csvCall?.url.search).not.toMatch(/token|access/i);
  expect(download.suggestedFilename()).toMatch(/^moneylog-transactions.*\.csv$/);
  expect(download.url()).toMatch(/^blob:/);
  const csv = readFileSync((await download.path()) ?? '', 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain(';');
});

test('resposta perdida ao reservar: "tentar de novo" reenvia a MESMA Idempotency-Key e a meta tem uma só reserva', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const goal = await createGoal(api);
  await signIn(page);
  await open(page, `/goals/${goal.id}`);

  // O backend processa a reserva, mas a resposta se perde na volta.
  net.dropNextResponse('POST', /\/v1\/goals\/[^/]+\/reservations$/);
  await cy(page, 'goal-reserve').click();
  await pick(page, 'reserve-account', 'Nubank');
  await cy(page, 'reserve-amount').fill('500,00');
  await cy(page, 'reserve-amount').blur();
  await cy(page, 'reserve-submit').click();
  await expect(cy(page, 'reserve-retry')).toBeVisible();
  await cy(page, 'reserve-retry').click();
  await expect(cy(page, 'reserve-form')).toBeHidden();

  const calls = net.find('POST', `/v1/goals/${goal.id}/reservations`);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
  const fresh = await api.get(`/v1/goals/${goal.id}`);
  expect(fresh.body.reservations).toHaveLength(1);
  expect(fresh.body.current.amount).toBe('500.00');
  expect(await cyText(page, 'goal-current')).toBe(fmt('500.00'));
});

test('reserva acima do saldo: aviso "reserva descoberta" na meta e na conta, sem bloquear nada', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const goal = await createGoal(api, { target: '30000.00' });
  await signIn(page);
  await open(page, `/goals/${goal.id}`);

  await cy(page, 'goal-reserve').click();
  await pick(page, 'reserve-account', 'Nubank');
  await cy(page, 'reserve-amount').fill('25.000,00');
  await cy(page, 'reserve-amount').blur();
  await cy(page, 'reserve-submit').click();
  await expect(cy(page, 'reserve-form')).toBeHidden();

  const fresh = await net.body('POST', `/v1/goals/${goal.id}/reservations`);
  expect(fresh.uncovered).toBe(true);
  await expect(cy(page, 'goal-uncovered')).toBeVisible();
  await expect(cy(page, 'goal-reserve')).toBeEnabled();

  await open(page, '/accounts');
  await expect(cy(page, `account-uncovered-${nubank.id}`)).toBeVisible();
  await open(page, '/');
  const summary = await net.body('GET', '/v1/dashboard/summary');
  expect(summary.balances.reserved.amount).toBe('25000.00');
  expect(await cyText(page, 'home-reserved')).toBe(fmt('25000.00'));
});

test('liberar mais do que o reservado: o backend recusa (422) e o erro vai para o campo do valor', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  net.allow(422);
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const goal = await createGoal(api);
  await api.ok(
    api.call(
      'POST',
      `/v1/goals/${goal.id}/reservations`,
      { accountId: nubank.id, amount: '100.00', date: todayInSaoPaulo(), note: null },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    ),
    [200],
  );
  await signIn(page);
  await open(page, `/goals/${goal.id}`);

  await cy(page, 'goal-release').click();
  await pick(page, 'reserve-account', 'Nubank');
  await cy(page, 'reserve-amount').fill('500,00');
  await cy(page, 'reserve-amount').blur();
  await cy(page, 'reserve-submit').click();

  await expect(cy(page, 'reserve-amount')).toHaveAttribute('aria-invalid', 'true');
  expect(await net.body('POST', `/v1/goals/${goal.id}/reservations`)).toMatchObject({
    code: 'GOAL_RELEASE_EXCEEDS_RESERVED',
  });
});

test('arquivar a meta tira o valor do reservado; desarquivar o devolve', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const goal = await createGoal(api);
  await api.ok(
    api.call(
      'POST',
      `/v1/goals/${goal.id}/reservations`,
      { accountId: nubank.id, amount: '1000.00', date: todayInSaoPaulo(), note: null },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    ),
    [200],
  );
  await signIn(page);
  await open(page, `/goals/${goal.id}`);

  await cy(page, 'goal-archive').click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'goal-archived-note')).toBeVisible();
  const archived = await net.body('POST', `/v1/goals/${goal.id}/archive`);
  expect(archived.status).toBe('ARCHIVED');
  await open(page, '/');
  expect(await cyText(page, 'home-reserved')).toBe(fmt('0.00'));

  await open(page, `/goals/${goal.id}`);
  await cy(page, 'goal-unarchive').click();
  await expect(cy(page, 'goal-reserve')).toBeVisible();
  await open(page, '/');
  expect(await cyText(page, 'home-reserved')).toBe(fmt('1000.00'));
});

test('resumo × Início × lista concordam no mês; o maior gasto abre a movimentação', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '5000.00' });
  const food = await api.categoryId('Alimentação');
  const salary = await api.categoryId('Salário', 'INCOME');
  await api.txOk({
    type: 'INCOME',
    amount: '3000.00',
    date: todayInSaoPaulo(),
    description: 'Salário',
    notes: null,
    accountId: nubank.id,
    categoryId: salary,
    method: 'TRANSFER',
  });
  await api.txOk({
    type: 'EXPENSE',
    amount: '100.00',
    date: todayInSaoPaulo(),
    description: 'Pix mercado',
    notes: null,
    accountId: nubank.id,
    categoryId: food,
    method: 'PIX',
  });
  await signIn(page);

  await open(page, '/');
  await expect(cy(page, 'home-dashboard')).toBeVisible();
  const home = await net.body('GET', '/v1/dashboard/summary');
  const homeIncome = await cyText(page, 'home-month-income');
  const homeNet = await cyText(page, 'home-month-net');

  await open(page, `/planning/summary/${MONTH()}`);
  const monthly = await net.body('GET', `/v1/summaries/${MONTH()}`);
  expect(monthly.income.amount).toBe(home.month.income.amount);
  expect(monthly.expenses.amount).toBe(home.month.consumption.amount);
  expect(monthly.net.amount).toBe(home.month.net.amount);
  expect(await cyText(page, 'summary-income')).toContain(homeIncome);
  expect(norm(await cyText(page, 'summary-net'))).toContain(homeNet.replace(/^[^R−]*/, ''));
  expect(await cyText(page, 'summary-savings-text')).toMatch(/%$/);

  // O maior gasto abre a movimentação.
  await cy(page, 'summary-largest-expense-link').click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);
});

test('exportar: a compra em 6x aparece uma vez no CSV, e o backup baixa como JSON sem segredos', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(240_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const card = await api.ok(
    api.call('POST', '/v1/cards', {
      name: 'Roxinho',
      institution: null,
      limit: { amount: '5000.00', currency: 'BRL' },
      closingDay: closingDayAwayFromToday(),
      dueDay: 5,
      defaultPaymentAccountId: nubank.id,
    }),
    [201],
  );
  const tech = await api.categoryId('Compras');
  await api.txOk({
    type: 'CARD_PURCHASE',
    amount: '1200.00',
    date: todayInSaoPaulo(),
    description: 'Notebook',
    notes: null,
    cardId: card.id,
    categoryId: tech,
    installments: 6,
  });
  await signIn(page);
  await open(page, '/settings');

  await cy(page, 'export-csv-action').click();
  const csvDownload = page.waitForEvent('download');
  await cy(page, 'export-save').click();
  const csvFile = await csvDownload;
  const csv = readFileSync((await csvFile.path()) ?? '', 'utf8');
  expect(csv.split('\r\n').filter((line) => line.includes('Notebook'))).toHaveLength(1);
  expect(csv).toContain('1200,00');

  await cy(page, 'export-backup-action').click();
  // O "Arquivo pronto" do CSV continua na tela até o backup chegar: espera o nome do backup.
  await expect(cy(page, 'export-ready-name')).toContainText('moneylog-backup');
  const backupDownload = page.waitForEvent('download');
  await cy(page, 'export-save').click();
  const backupFile = await backupDownload;
  expect(backupFile.suggestedFilename()).toMatch(/^moneylog-backup.*\.json$/);
  const raw = readFileSync((await backupFile.path()) ?? '', 'utf8');
  const backup = JSON.parse(raw);
  expect(backup.schemaVersion).toBeDefined();
  expect(raw).not.toMatch(/passwordHash|refreshToken|JWT_SECRET/i);
  await expect(cy(page, 'export-backup-privacy')).toBeVisible();
});

test('exportar com a rede caindo: avisa e "tentar de novo" baixa', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  net.allow(500);
  await api.createAccount({ name: 'Nubank', openingBalance: '100.00' });
  await signIn(page);
  await open(page, '/settings');

  net.failNext('GET', /\/v1\/exports\/backup$/, 500);
  await cy(page, 'export-backup-action').click();
  await expect(cy(page, 'export-error')).toBeVisible();
  await cy(page, 'export-retry').click();
  const downloading = page.waitForEvent('download');
  await cy(page, 'export-save').click();
  await downloading;
  await expect(cy(page, 'export-error')).toBeHidden();
});

test('resumo de um mês sem receitas: economia "—" com a explicação; projeção com tendência indisponível mostra o motivo', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  await signIn(page);

  await open(page, `/planning/summary/${MONTH()}`);
  const monthly = await net.body('GET', `/v1/summaries/${MONTH()}`);
  expect(monthly.savingsRate).toBeNull();
  expect(await cyText(page, 'summary-savings-text')).toBe('—');
  await expect(cy(page, 'summary-savings-note')).toBeVisible();

  await open(page, '/planning/projections?trend=1');
  const projection = await net.body('GET', '/v1/projections');
  expect(projection.trend.available).toBe(false);
  await expect(cy(page, 'projection-trend-unavailable')).toBeVisible();
  await expect(cy(page, 'projection-trend-average')).toHaveCount(0);
});

test('teclado e 375 px: reservar uma meta só pelo teclado', async ({ page, api, signIn, net }) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  await page.setViewportSize({ width: 375, height: 812 });
  await api.createAccount({ name: 'Nubank', openingBalance: '20000.00' });
  const goal = await createGoal(api);
  await signIn(page);
  await open(page, `/goals/${goal.id}`);

  await cy(page, 'goal-reserve').focus();
  await page.keyboard.press('Enter');
  await expect(cy(page, 'reserve-form')).toBeVisible();
  await cy(page, 'reserve-account').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await cy(page, 'reserve-amount').fill('300,00');
  await page.keyboard.press('Enter');
  await expect(cy(page, 'reserve-form')).toBeHidden();
  const scroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(scroll).toBe(true);
  expect(await cyText(page, 'goal-current')).toBe(fmt('300.00'));
});

/** `YYYY-MM-DD` de hoje (São Paulo) mais `days`, só calendário (sem horário). */
function inDays(days: number): string {
  const [y, m, d] = todayInSaoPaulo().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

test('movimentação com data futura aparece uma vez em "A seguir" (SCHEDULED_TRANSACTION) e leva ao detalhe (FE-S-177)', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const food = await api.categoryId('Alimentação');
  const created = await api.txOk({
    type: 'EXPENSE',
    amount: '120.00',
    date: inDays(5),
    description: 'Presente agendado',
    notes: null,
    accountId: nubank.id,
    categoryId: food,
    method: 'PIX',
  });
  await signIn(page);
  await open(page, '/');

  const upcoming = await net.body('GET', '/v1/dashboard/upcoming');
  const scheduled = upcoming.items.filter((i: any) => i.kind === 'SCHEDULED_TRANSACTION');
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0]).toMatchObject({ refType: 'TRANSACTION', refId: created.id });

  const rows = page.locator('[data-cy="home-upcoming-item"][data-kind="SCHEDULED_TRANSACTION"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('[data-cy="home-upcoming-amount"]')).toHaveText(fmt('120.00'));
  expect(await cyText(page, 'home-upcoming-total-out')).toBe(fmt(upcoming.totals.out.amount));
  await rows.locator('[data-cy="home-upcoming-transaction-link"]').click();
  await expect(page).toHaveURL(new RegExp(`/transactions/${created.id}$`));
});

test('arquivar conta com reserva ativa: 422 ACCOUNT_HAS_RESERVATIONS vira aviso com atalho para as metas', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(180_000);
  net.checkDuplicates = false;
  net.allow(422);
  const empty = await api.createAccount({ name: 'Reserva vazia', openingBalance: '0.00' });
  const goal = await createGoal(api);
  await api.ok(
    api.call(
      'POST',
      `/v1/goals/${goal.id}/reservations`,
      { accountId: empty.id, amount: '50.00', date: todayInSaoPaulo(), note: null },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    ),
    [200],
  );
  await signIn(page);
  await open(page, '/accounts');

  await cy(page, `account-archive-${empty.id}`).click();
  await cy(page, 'confirm-dialog-confirm').click();

  await expect(cy(page, 'accounts-reservations-blocked')).toBeVisible();
  expect(await net.body('POST', `/v1/accounts/${empty.id}/archive`)).toMatchObject({
    code: 'ACCOUNT_HAS_RESERVATIONS',
  });
  await cy(page, 'accounts-reservations-goals').click();
  await expect(page).toHaveURL(/\/goals$/);
});
