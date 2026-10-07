import { expense } from '../support/api';

import { cy, cyText, expect, fillAmount, fmt, open, pick, resetDatabase, test } from './fixtures';

/** T44: contas (editar, arquivar, conta arquivada) e categorias (criar, renomear, arquivar) com o backend real. */
test.beforeEach(() => resetDatabase());

test('contas: estado vazio, editar nome, saldo inicial travado depois de movimentar', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  await signIn(page);
  await open(page, '/accounts');
  await expect(cy(page, 'empty-state')).toBeVisible();
  await evidence(page, 'e2e-30-contas-vazio');
  await open(page, '/');
  await expect(cy(page, 'empty-state-title')).toHaveText('Nada registrado ainda.');
  await open(page, '/transactions');
  await expect(cy(page, 'empty-state-title')).toHaveText('Seu log está vazio.');

  const acc = await api.createAccount({
    name: 'Carteira',
    type: 'WALLET',
    openingBalance: '50.00',
    institution: 'Casa',
  });
  await open(page, '/accounts');
  await expect(cy(page, `account-edit-${acc.id}`)).toHaveText('Carteira');
  await expect(cy(page, `account-institution-${acc.id}`)).toHaveText('Casa');

  // Sem movimentações o saldo inicial é editável; a edição reflete no saldo atual.
  await cy(page, `account-edit-button-${acc.id}`).click();
  await expect(cy(page, 'account-form')).toBeVisible();
  await expect(cy(page, 'account-opening-locked')).toHaveCount(0);
  await cy(page, 'account-name').fill('Carteira nova');
  await cy(page, 'account-opening-balance').fill('80,00');
  await cy(page, 'account-opening-balance').blur();
  await cy(page, 'account-form-save').click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(cy(page, `account-edit-${acc.id}`)).toHaveText('Carteira nova');
  expect(await cyText(page, `account-balance-${acc.id}`)).toContain(fmt('80.00'));

  // Depois de uma movimentação, o saldo inicial fica travado (ACCOUNT_OPENING_LOCKED).
  const food = await api.categoryId('Alimentação');
  await api.txOk(expense({ amount: '5.00', accountId: acc.id, categoryId: food }));
  await open(page, `/accounts/${acc.id}/edit`);
  await expect(cy(page, 'account-opening-locked')).toBeVisible();
  await evidence(page, 'e2e-31-conta-saldo-inicial-travado');
  const locked = await api.call('PUT', `/v1/accounts/${acc.id}`, {
    name: 'x',
    openingBalance: { amount: '1.00', currency: 'BRL' },
    version: (await api.get(`/v1/accounts/${acc.id}`)).body.version,
  });
  expect(locked.status).toBe(422);
  expect(locked.body.code).toBe('ACCOUNT_OPENING_LOCKED');
  void net;
});

test('conta com saldo não arquiva; zerada arquiva, some dos formulários e a movimentação dela fica só leitura', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  const rich = await api.createAccount({ name: 'Com saldo', openingBalance: '100.00' });
  const zero = await api.createAccount({ name: 'Zerada', openingBalance: '0.00' });
  const food = await api.categoryId('Alimentação');
  const tx = await api.txOk(
    expense({
      amount: '0.00'.replace('0.00', '1.00'),
      accountId: zero.id,
      categoryId: food,
      description: 'antes de arquivar',
    }),
  );
  // Zera a conta devolvendo o valor: ajuste de +1,00.
  await api.txOk({
    type: 'ADJUSTMENT',
    amount: '1.00',
    date: tx.date,
    description: 'zera',
    notes: null,
    accountId: zero.id,
    direction: 'INCREASE',
    kind: 'CORRECTION',
    reason: 'zerar',
  });
  await signIn(page);

  await open(page, '/accounts');
  await expect(cy(page, `account-archive-${rich.id}`)).toBeDisabled();
  await expect(cy(page, `account-archive-hint-${rich.id}`)).toBeVisible();
  const refused = await api.call('POST', `/v1/accounts/${rich.id}/archive`);
  expect(refused.status).toBe(422);
  expect(refused.body.code).toBe('ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED');
  await evidence(page, 'e2e-32-contas-arquivar-bloqueado');

  // Arquiva a zerada pela tela.
  await expect(cy(page, `account-archive-${zero.id}`)).toBeEnabled();
  await cy(page, `account-archive-${zero.id}`).click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, `account-row-${zero.id}`)).toHaveCount(0);
  await cy(page, 'accounts-tab-archived').click();
  await expect(cy(page, `account-row-${zero.id}`)).toBeVisible();
  await expect(cy(page, `account-unarchive-${zero.id}`)).toBeVisible();
  await evidence(page, 'e2e-33-contas-arquivadas');

  // Conta arquivada não é oferecida no /quick-add; o Início segue contando "hasAccounts".
  await open(page, '/quick-add?mode=pix');
  await cy(page, 'entry-account').click();
  await expect(
    cy(page, 'entry-account-listbox').getByRole('option', { name: 'Zerada', exact: true }),
  ).toHaveCount(0);

  // A movimentação da conta arquivada fica somente leitura: sem edição, estorno bloqueado.
  await open(page, `/transactions/${tx.id}`);
  const detail = (await api.get(`/v1/transactions/${tx.id}`)).body;
  expect(detail.editable).toBe(false);
  expect(detail.voidable).toBe(false);
  expect(detail.voidBlockedBy).toBe('ACCOUNT_ARCHIVED');
  await expect(cy(page, 'void-blocked')).toBeVisible();
  await expect(cy(page, 'detail-edit')).toHaveCount(0);
  await open(page, `/transactions/${tx.id}/edit`);
  await expect(cy(page, 'transaction-edit')).toHaveCount(0);
  net.allow(422);
  const v = await api.call('POST', `/v1/transactions/${tx.id}/void`, { reason: 'x' });
  expect(v.status).toBe(422);
  expect(v.body.code).toBe('ACCOUNT_ARCHIVED');

  // Desarquiva pela tela e volta a valer.
  await open(page, '/accounts?status=ARCHIVED');
  await cy(page, `account-unarchive-${zero.id}`).click();
  await expect(cy(page, `account-row-${zero.id}`)).toHaveCount(0);
  await open(page, '/accounts');
  await expect(cy(page, `account-row-${zero.id}`)).toBeVisible();
});

test('categorias: criar, nome repetido, renomear, arquivar (some do /quick-add) e desarquivar', async ({
  page,
  api,
  signIn,
  net,
  evidence,
}) => {
  await api.createAccount({ name: 'Conta', openingBalance: '100.00' });
  await signIn(page);
  await open(page, '/settings');
  await cy(page, 'settings-categories-link').click();
  await expect(page).toHaveURL(/\/settings\/categories/);
  await expect(cy(page, 'categories-list')).toBeVisible();

  // Criar.
  await cy(page, 'categories-add').click();
  await cy(page, 'category-new-name').fill('Pets');
  await cy(page, 'categories-create-save').click();
  const created = await net.body('POST', '/v1/categories');
  expect(created.name).toBe('Pets');
  expect(created.kind).toBe('EXPENSE');
  await expect(cy(page, `category-name-${created.id}`)).toHaveText('Pets');
  await evidence(page, 'e2e-34-categorias-criada');

  // Nome repetido: 409 CATEGORY_NAME_TAKEN, nada duplicado.
  net.allow(409);
  await cy(page, 'categories-add').click();
  await cy(page, 'category-new-name').fill('pets');
  await cy(page, 'categories-create-save').click();
  await expect(page.locator('[aria-invalid="true"], [role="alert"]').first()).toBeVisible();
  expect((await net.body('POST', '/v1/categories')).code).toBe('CATEGORY_NAME_TAKEN');
  await cy(page, 'categories-create-cancel').click();

  // Renomear.
  await cy(page, `category-rename-${created.id}`).click();
  await cy(page, `category-rename-input-${created.id}`).fill('Animais');
  await cy(page, `category-rename-save-${created.id}`).click();
  await expect(cy(page, `category-name-${created.id}`)).toHaveText('Animais');
  expect((await net.body('PUT', `/v1/categories/${created.id}`)).name).toBe('Animais');

  // Aba de receitas existe e lista as de sistema.
  await cy(page, 'categories-tab-income').click();
  await expect(cy(page, 'categories-list')).toContainText('Salário');
  await cy(page, 'categories-tab-expense').click();

  // Arquivar: some das ativas e do /quick-add.
  await cy(page, `category-archive-${created.id}`).click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, `category-rename-${created.id}`)).toHaveCount(0);
  await cy(page, 'categories-archived-toggle').click();
  await expect(cy(page, `category-unarchive-${created.id}`)).toBeVisible();
  await open(page, '/quick-add?mode=pix');
  await cy(page, 'entry-category').click();
  await expect(cy(page, `entry-category-option-${created.id}`)).toHaveCount(0);
  await expect(
    cy(page, 'entry-category-listbox').getByRole('option', { name: 'Alimentação' }),
  ).toHaveCount(1);

  // Desarquivar volta a oferecer.
  await open(page, '/settings/categories');
  await cy(page, 'categories-archived-toggle').click();
  await cy(page, `category-unarchive-${created.id}`).click();
  await expect(cy(page, `category-rename-${created.id}`)).toBeVisible();
  await open(page, '/quick-add?mode=pix');
  await cy(page, 'entry-category').click();
  await expect(cy(page, `entry-category-option-${created.id}`)).toHaveCount(1);

  // Despesa em categoria arquivada é recusada pelo domínio (CATEGORY_ARCHIVED).
  await api.ok(api.call('POST', `/v1/categories/${created.id}/archive`));
  const acc = (await api.get('/v1/accounts?pageSize=50')).body.items[0];
  net.allow(422);
  const bad = await api.tx(expense({ amount: '1.00', accountId: acc.id, categoryId: created.id }));
  expect(bad.status).toBe(422);
  expect(bad.body.code).toBe('CATEGORY_ARCHIVED');
  void fillAmount;
  void pick;
});
