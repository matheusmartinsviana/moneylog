/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

import { todayInSaoPaulo } from '../support/api';

import { cy, expect, open, resetDatabase, test } from './fixtures';

/**
 * Etapa 6 com o backend real (T114 a T119 do front): o vault de notas Markdown. A jornada do plano: criar a
 * nota → vincular à compra do notebook e ao resumo do mês → `[[` para outra nota → renomear (links reescritos nas
 * outras notas) → backlinks → lixeira → restaurar → exportar → esvaziar o vault e importar o zip de volta. O
 * teste **compara a tela com a API** e confere que o vault nunca muda saldo, razão nem dashboard (invariante do
 * D1 §5). Também cobre XSS por Markdown, `VERSION_CONFLICT` sem sobrescrever o digitado, `Idempotency-Key`
 * reutilizada no retry depois de falha ambígua, importação inválida e os blocos "Notas vinculadas".
 *
 * Limitação declarada: o app tem um único usuário (o dono), então "importar em outro usuário" vira "esvaziar o
 * vault e importar o zip exportado" (o mesmo caminho de código no backend). **Escrito, não executado pelo
 * dev-frontend** (o stack do backend estava com o tester): a QA roda `npm run e2e:integration`.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(() => resetDatabase());

const MONTH = (): string => todayInSaoPaulo().slice(0, 7);

async function createNote(api: any, path: string, body: string, links: unknown[] = []) {
  return api.ok(
    api.call(
      'POST',
      '/v1/notes',
      { path, body, ...(links.length > 0 ? { links } : {}) },
      { headers: { 'Idempotency-Key': randomUUID() } },
    ),
    [201],
  );
}

/** Zip mínimo (método "stored", sem compressão) com as entradas dadas: o bastante para o importador. */
function makeZip(entries: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.content, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** O que o vault não pode tocar: saldo da conta e resumo do dashboard (antes e depois têm de ser iguais). */
async function financialSnapshot(api: any, accountId: string) {
  return {
    account: await api.get(`/v1/accounts/${accountId}`).then((r: any) => r.body),
    dashboard: await api.get('/v1/dashboard/summary').then((r: any) => r.body),
  };
}

test('jornada: criar → vincular à compra e ao resumo do mês → [[ ]] → renomear → backlinks → lixeira → restaurar → exportar → esvaziar e importar; saldos e dashboard idênticos', async ({
  page,
  api,
  signIn,
  net,
}) => {
  test.setTimeout(420_000);
  net.checkDuplicates = false;
  net.allow(404);
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '10000.00' });
  const categoryId = await api.categoryId('Alimentação');
  const notebook = await api.txOk({
    type: 'EXPENSE',
    amount: '4500.00',
    date: todayInSaoPaulo(),
    description: 'Notebook',
    notes: null,
    accountId: nubank.id,
    categoryId,
    method: 'PIX',
  });
  const macbook = await createNote(api, 'MacBook.md', '# MacBook\n\nO notebook novo.');
  const index = await createNote(
    api,
    'Índice.md',
    'Veja [[Revisão de outubro]] e [[Revisão de outubro|a revisão]].',
  );
  const before = await financialSnapshot(api, nubank.id);
  await signIn(page);

  // 1. A lista mostra as notas e a indicação honesta de armazenamento.
  await open(page, '/notes');
  await expect(cy(page, 'notes-storage')).toContainText('servidor do moneylog');
  await expect(cy(page, `note-row-${macbook.id}`)).toBeVisible();

  // 2. Cria a nota pela folha (nome + pasta): POST com Idempotency-Key e a nota nasce na versão 0.
  await cy(page, 'notes-new').click();
  await cy(page, 'new-note-name').fill('Revisão de outubro');
  await cy(page, 'new-note-folder').fill('reviews');
  await cy(page, 'new-note-submit').click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const created = await net.body('POST', '/v1/notes', 'first');
  expect(net.find('POST', '/v1/notes')[0]?.idempotencyKey).toBeTruthy();
  expect(created.path).toBe('reviews/Revisão de outubro.md');
  expect(created.version).toBe(0);
  const noteId: string = created.id;

  // 3. `[[` abre as sugestões; Enter insere o caminho da nota; salvar manda a version e o backend resolve o link.
  const area = cy(page, 'note-text');
  await area.click();
  await area.press('End');
  await page.keyboard.type('\nComprei o [[Mac');
  await expect(cy(page, 'wikilink-options')).toBeVisible();
  await expect(cy(page, `wikilink-option-${macbook.id}`)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(area).toHaveValue(/\[\[MacBook\]\]/);
  await page.keyboard.press('Control+s');
  await expect(cy(page, 'note-status')).toContainText('Tudo salvo');
  const saved = await net.body('PUT', `/v1/notes/${noteId}`);
  expect(saved.version).toBe(1);
  expect(saved.links.find((l: any) => l.origin === 'WIKILINK')).toMatchObject({
    type: 'NOTE',
    state: 'RESOLVED',
    target: { id: macbook.id },
  });
  await expect(cy(page, 'md-wikilink')).toHaveAttribute('href', `/notes/${macbook.id}`);

  // 4. Vincula à compra do notebook e ao resumo do mês pelo seletor próprio.
  await cy(page, 'link-add').click();
  await cy(page, 'picker-search').fill('Notebook');
  await cy(page, `picker-option-${notebook.id}`).click();
  await expect(cy(page, 'link-picker')).toBeHidden();
  await cy(page, 'link-add').click();
  await cy(page, 'picker-type').click();
  await page.getByRole('option', { name: 'Resumo mensal', exact: true }).click();
  await cy(page, 'picker-month').click();
  await cy(page, `picker-month-grid-${MONTH()}`).click();
  await cy(page, 'picker-add-month').click();
  await expect(cy(page, 'link-picker')).toBeHidden();
  const linked = await net.body('PUT', `/v1/notes/${noteId}/links`);
  expect(linked.links.filter((l: any) => l.origin === 'EXPLICIT').map((l: any) => l.type)).toEqual(
    expect.arrayContaining(['TRANSACTION', 'MONTHLY_SUMMARY']),
  );
  const putLinks = net.find('PUT', `/v1/notes/${noteId}/links`).at(-1);
  expect((putLinks?.requestBody as any).links).toEqual(
    expect.arrayContaining([
      { type: 'TRANSACTION', id: notebook.id },
      { type: 'MONTHLY_SUMMARY', key: MONTH() },
    ]),
  );
  await expect(cy(page, 'link-0')).toContainText('Notebook');

  // 5. As telas financeiras mostram a nota vinculada (o valor da compra não muda).
  await open(page, `/transactions/${notebook.id}`);
  await expect(cy(page, 'detail-notes-block')).toContainText('Revisão de outubro');
  await open(page, `/planning/summary/${MONTH()}`);
  await expect(cy(page, 'summary-notes-block')).toContainText('Vinculada à revisão mensal');
  await expect(cy(page, 'summary-notes-block')).toContainText('Revisão de outubro');

  // 6. Renomeia: o backend reescreve os `[[Revisão de outubro]]` das outras notas na mesma transação.
  await open(page, `/notes/${noteId}`);
  await cy(page, 'note-menu').click();
  await cy(page, 'note-menu-item-rename').click();
  await cy(page, 'move-path').fill('reviews/Outubro 2026.md');
  await cy(page, 'move-submit').click();
  const moved = await net.body('POST', `/v1/notes/${noteId}/move`);
  expect(moved.rewrittenNotes.map((n: any) => n.id)).toEqual([index.id]);
  await expect(cy(page, 'note-moved')).toContainText('1 nota teve links reescritos');
  await expect(cy(page, `note-moved-${index.id}`)).toBeVisible();
  const reindexed = await api.get(`/v1/notes/${index.id}`).then((r: any) => r.body);
  expect(reindexed.body).toBe('Veja [[Outubro 2026]] e [[Outubro 2026|a revisão]].');

  // 7. Backlinks: a nota MacBook recebe a revisão (com o trecho em texto puro).
  await open(page, `/notes/${macbook.id}`);
  await expect(cy(page, 'backlinks')).toContainText('Outubro 2026');

  // 8. Lixeira: mover, ver na aba, restaurar.
  await open(page, `/notes/${noteId}`);
  await cy(page, 'note-menu').click();
  await cy(page, 'note-menu-item-trash').click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'note-trashed')).toBeVisible();
  await expect(cy(page, 'note-text')).toBeDisabled();
  await open(page, '/notes?view=trash');
  await expect(cy(page, `trash-row-${noteId}`)).toBeVisible();
  await cy(page, `trash-restore-${noteId}`).click();
  await expect(cy(page, `trash-row-${noteId}`)).toBeHidden();
  const restored = await api.get(`/v1/notes/${noteId}`).then((r: any) => r.body);
  expect(restored.trashedAt).toBeNull();

  // 9. Exporta: o zip tem as notas nos caminhos delas.
  await open(page, '/settings');
  await cy(page, 'vault-export-action').click();
  await expect(cy(page, 'vault-export-ready')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await cy(page, 'vault-export-save').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^moneylog-vault-\d{4}-\d{2}-\d{2}\.zip$/);
  const zipPath = await download.path();
  const zip = readFileSync(zipPath);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  for (const name of ['MacBook.md', 'Índice.md', 'reviews/Outubro 2026.md']) {
    expect(zip.includes(Buffer.from(name, 'utf8')), `zip contém ${name}`).toBe(true);
  }

  // 10. Esvazia o vault (lixeira + esvaziar, ações explícitas) e importa o zip de volta.
  for (const id of [macbook.id, index.id, noteId])
    await api.ok(api.call('POST', `/v1/notes/${id}/trash`));
  await api.ok(api.call('DELETE', '/v1/notes/trash'), [204]);
  await open(page, '/notes');
  await cy(page, 'empty-state-action-import-vault').click();
  await cy(page, 'vault-file-native').setInputFiles(zipPath);
  await expect(cy(page, 'vault-file-name')).toContainText('.zip');
  await cy(page, 'vault-import-action').click();
  await expect(page.getByRole('dialog', { name: 'Importar este arquivo?' })).toBeVisible();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'import-report')).toBeVisible();
  const report = await net.body('POST', '/v1/vault/import');
  expect(report.created).toBe(3);
  expect(report.skipped).toBe(0);
  await expect(cy(page, 'import-created')).toHaveText('3');
  expect(net.find('POST', '/v1/vault/import')[0]?.url.searchParams.get('mode')).toBe('SKIP');
  await cy(page, 'import-done').click();
  await expect(cy(page, 'notes-list')).toContainText('Outubro 2026');
  const imported = await api.get('/v1/notes?pageSize=50').then((r: any) => r.body);
  expect(imported.items.map((n: any) => n.path).sort()).toEqual([
    'MacBook.md',
    'reviews/Outubro 2026.md',
    'Índice.md',
  ]);
  // Os vínculos explícitos voltaram pelo frontmatter `moneylog.links`.
  const importedReview = imported.items.find((n: any) => n.path === 'reviews/Outubro 2026.md');
  const full = await api.get(`/v1/notes/${importedReview.id}`).then((r: any) => r.body);
  expect(
    full.links
      .filter((l: any) => l.origin === 'EXPLICIT')
      .map((l: any) => l.type)
      .sort(),
  ).toEqual(['MONTHLY_SUMMARY', 'TRANSACTION']);

  // 11. O vault nunca mexeu em saldo, razão nem dashboard.
  expect(await financialSnapshot(api, nubank.id)).toEqual(before);
});

test('XSS: nota com Markdown malicioso não executa nada no navegador (nem alert, nem erro de página, nem nó perigoso)', async ({
  page,
  api,
  signIn,
}) => {
  const payload = [
    '<script>window.__pwned = 1</script>',
    '<img src=x onerror="window.__pwned = 1">',
    '<svg onload="window.__pwned = 1"></svg>',
    '<iframe src="javascript:window.__pwned = 1"></iframe>',
    '[clique](javascript:window.__pwned=1)',
    '![rastreio](https://exemplo.invalid/pixel.png)',
    '<a href="javascript:window.__pwned=1" onclick="window.__pwned=1">x</a>',
    '[[<img src=x onerror=window.__pwned=1>]]',
    '[ok](https://exemplo.com)',
  ].join('\n\n');
  const note = await createNote(api, 'xss.md', payload);
  const dialogs: string[] = [];
  const errors: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const requested: string[] = [];
  page.on('request', (req) => requested.push(req.url()));
  await signIn(page);

  await open(page, `/notes/${note.id}`);
  const preview = cy(page, 'note-preview');
  await expect(preview).toBeVisible();

  expect(
    await preview.locator('script, iframe, img, svg, object, embed, form, style').count(),
  ).toBe(0);
  expect(await preview.locator('[onerror], [onload], [onclick]').count()).toBe(0);
  const hrefs = await preview
    .locator('a')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  for (const href of hrefs) expect(href).toMatch(/^(https?:\/\/|mailto:|\/notes\/)/);
  const external = preview.locator('a[href^="https://exemplo.com"]');
  await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(external).toHaveAttribute('target', '_blank');
  await expect(cy(page, 'md-image-blocked')).toBeVisible();
  expect(requested.some((url) => url.includes('exemplo.invalid'))).toBe(false);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
  // O texto literal continua visível para o autor.
  await expect(preview).toContainText('<script>window.__pwned = 1</script>');
});

test('VERSION_CONFLICT: a nota mudou em outro lugar; o texto digitado fica e as duas escolhas funcionam', async ({
  page,
  api,
  signIn,
  net,
}) => {
  net.allow(409);
  net.checkDuplicates = false;
  const note = await createNote(api, 'conflito.md', 'original');
  await signIn(page);
  await open(page, `/notes/${note.id}`);

  // Outro dispositivo salva primeiro.
  await api.ok(
    api.call('PUT', `/v1/notes/${note.id}`, { body: 'do outro dispositivo', version: 0 }),
  );
  const area = cy(page, 'note-text');
  await area.click();
  await area.press('End');
  await page.keyboard.type(' e o que eu digitei');
  await page.keyboard.press('Control+s');

  await expect(cy(page, 'conflict-panel')).toBeVisible();
  await expect(area).toHaveValue('original e o que eu digitei');
  await cy(page, 'conflict-toggle-diff').click();
  await expect(cy(page, 'conflict-diff')).toContainText('do outro dispositivo');
  const server = await api.get(`/v1/notes/${note.id}`).then((r: any) => r.body);
  expect(server.body).toBe('do outro dispositivo');

  await cy(page, 'conflict-keep-mine').click();
  await expect(cy(page, 'conflict-panel')).toBeHidden();
  const final = await api.get(`/v1/notes/${note.id}`).then((r: any) => r.body);
  expect(final.body).toBe('original e o que eu digitei');
});

test('Idempotency-Key: o "tentar de novo" depois de uma resposta perdida reusa a chave e não duplica a nota', async ({
  page,
  api,
  signIn,
  net,
}) => {
  net.checkDuplicates = false;
  net.duplicateOk = ['/v1/notes'];
  await signIn(page);
  await open(page, '/notes');
  net.dropNextResponse('POST', /\/v1\/notes$/);

  await cy(page, 'notes-new').click();
  await cy(page, 'new-note-name').fill('Uma só vez');
  await cy(page, 'new-note-submit').click();
  await expect(cy(page, 'new-note-error')).toBeVisible();
  await cy(page, 'new-note-submit').click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);

  const posts = net.find('POST', '/v1/notes');
  expect(posts).toHaveLength(2);
  expect(posts[0]?.idempotencyKey).toBeTruthy();
  expect(posts[1]?.idempotencyKey).toBe(posts[0]?.idempotencyKey);
  const list = await api.get('/v1/notes').then((r: any) => r.body);
  expect(list.items.filter((n: any) => n.path === 'Uma só vez.md')).toHaveLength(1);
});

test('importar: arquivo que não é zip → VAULT_IMPORT_INVALID com mensagem clara e nada muda; reimportar com SKIP não duplica', async ({
  page,
  api,
  signIn,
  net,
}) => {
  net.allow(422);
  net.checkDuplicates = false;
  await createNote(api, 'existente.md', 'já existe');
  await signIn(page);
  await open(page, '/notes');
  await cy(page, 'notes-tab-notes').click();

  await page.getByRole('button', { name: /Importar e exportar notas/ }).click();
  await cy(page, 'vault-file-native').setInputFiles({
    name: 'falso.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('isto não é um zip'),
  });
  await cy(page, 'vault-import-action').click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'vault-import-error')).toContainText('não é um zip válido');
  await expect(cy(page, 'vault-import-error')).toContainText('Nada foi importado');
  await expect(cy(page, 'vault-import-retry')).toHaveCount(0);
  expect((await api.get('/v1/notes').then((r: any) => r.body)).items).toHaveLength(1);

  // Zip bom com um caminho que já existe, um anexo e uma nota nova: SKIP pula a repetida.
  await cy(page, 'vault-import-reset').click();
  const zip = makeZip([
    { name: 'existente.md', content: 'do zip' },
    { name: 'nova.md', content: '# Nova\n\nCom #tag e [[existente]].' },
    { name: 'foto.png', content: 'binario' },
  ]);
  await cy(page, 'vault-file-native').setInputFiles({
    name: 'ok.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  await cy(page, 'vault-import-action').click();
  await cy(page, 'confirm-dialog-confirm').click();
  await expect(cy(page, 'import-report')).toBeVisible();
  await expect(cy(page, 'import-created')).toHaveText('1');
  await expect(cy(page, 'import-skipped')).toHaveText('1');
  await expect(cy(page, 'import-ignored-list')).toContainText('foto.png');
  const existing = (await api.get('/v1/notes?q=existente').then((r: any) => r.body)).items[0];
  const body = await api.get(`/v1/notes/${existing.id}`).then((r: any) => r.body);
  expect(body.body).toBe('já existe');
});

test('blocos "Notas vinculadas": "Nova nota vinculada" cria a nota já ligada ao registro e abre no editor', async ({
  page,
  api,
  signIn,
  net,
}) => {
  net.checkDuplicates = false;
  const nubank = await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const categoryId = await api.categoryId('Alimentação');
  const tx = await api.txOk({
    type: 'EXPENSE',
    amount: '35.00',
    date: todayInSaoPaulo(),
    description: 'Almoço',
    notes: null,
    accountId: nubank.id,
    categoryId,
    method: 'PIX',
  });
  const before = await financialSnapshot(api, nubank.id);
  await signIn(page);
  await open(page, `/transactions/${tx.id}`);

  await expect(cy(page, 'detail-notes-empty')).toBeVisible();
  await cy(page, 'detail-notes-new').click();
  await expect(cy(page, 'new-note-name')).toHaveValue('Nota de Almoço');
  await cy(page, 'new-note-submit').click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);

  const post = net.find('POST', '/v1/notes').at(-1);
  expect((post?.requestBody as any).links).toEqual([{ type: 'TRANSACTION', id: tx.id }]);
  await expect(cy(page, 'link-0')).toContainText('Almoço');
  expect(await financialSnapshot(api, nubank.id)).toEqual(before);
});

test('mobile (375 px): criar e editar com as abas Escrever e Ler, sem rolagem horizontal', async ({
  page,
  api,
  signIn,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const note = await createNote(api, 'mobile.md', '# Mobile\n\nTexto **forte**.');
  await signIn(page);
  await open(page, `/notes/${note.id}`);

  await expect(page.getByRole('tab', { name: 'Escrever' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const size = await cy(page, 'note-text').evaluate((el) =>
    parseFloat(getComputedStyle(el).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(16);
  await page.getByRole('tab', { name: 'Ler' }).click();
  await expect(cy(page, 'note-preview')).toContainText('Mobile');
  await page.getByRole('tab', { name: 'Escrever' }).click();
  await cy(page, 'note-text').click();
  await page.keyboard.type(' mais');
  await cy(page, 'note-save').click();
  await expect(cy(page, 'note-status')).toContainText('Tudo salvo');
  const scroll = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
});
