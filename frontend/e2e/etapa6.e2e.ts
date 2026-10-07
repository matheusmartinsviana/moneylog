import {
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  runAxe,
  seedPreferences,
  test,
  VIEWPORTS,
  waitForApp,
} from './support';

/**
 * Etapa 6 (vault de notas) no ambiente mock: sem backend, o vault está vazio, criar devolve a nota sem
 * persistir e abrir uma nota dá "não encontrada". Os fluxos com dados (criar, vincular à compra do notebook e
 * ao resumo de outubro, `[[` para outra nota, renomear com reescrita de links, lixeira, exportar, importar em
 * outro usuário, XSS e saldos idênticos) são do projeto `integration` (`integration/etapa6.e2e.ts`). Aqui:
 * estado vazio e honesto sobre o armazenamento, folha de nova nota, lixeira, exportar com "Arquivo pronto" (o
 * download só nasce do clique), importar com o `FilePicker` próprio (o único `<input type="file">`, escondido
 * dentro dele) e o relatório, o bloco "Notas vinculadas" ausente de telas sem registro, a11y, 375 px e idiomas.
 */

const ZIP = {
  name: 'moneylog-vault.zip',
  mimeType: 'application/zip',
  buffer: Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]),
};

test.describe('/notes vazio', () => {
  test('mostra o estado vazio e diz, sem prometer local-first, que as notas ficam no servidor', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/notes');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Nenhuma nota no vault.',
    );
    await expect(page.locator('[data-cy="notes-storage"]')).toContainText(
      'Guardado no servidor do moneylog. Exporte quando quiser uma cópia em Markdown.',
    );
    await expect(page.locator('[data-cy="empty-state-action-create-note"]')).toBeEnabled();
    await expect(page.locator('[data-cy="empty-state-action-import-vault"]')).toBeEnabled();
    await expectNoRawKeys(page);
  });

  test('"Nova nota" abre a folha; criar leva ao editor (no mock a nota não persiste: "não encontrada")', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/notes');
    await waitForApp(page);

    await page.locator('[data-cy="notes-new"]').click();
    await expect(page.locator('[data-cy="new-note-form"]')).toBeVisible();
    // Nome vazio: erro do campo, nada é enviado.
    await page.locator('[data-cy="new-note-submit"]').click();
    await expect(page.locator('[data-cy="new-note-name"]')).toHaveAttribute('aria-invalid', 'true');
    // Caractere proibido: avisa antes de enviar.
    await page.locator('[data-cy="new-note-name"]').fill('a:b');
    await page.locator('[data-cy="new-note-submit"]').click();
    await expect(page.locator('[data-cy="new-note-error"]')).toBeVisible();

    await page.locator('[data-cy="new-note-name"]').fill('Revisão de outubro');
    await page.locator('[data-cy="new-note-folder"]').fill('reviews');
    await page.locator('[data-cy="new-note-submit"]').click();

    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText('Nota não encontrada');
  });

  test('a aba Lixeira vai para a URL, explica a regra e diz que está vazia', async ({ page }) => {
    await page.goto('/notes');
    await waitForApp(page);

    await page.locator('[data-cy="notes-tab-trash"]').click();
    await expect(page).toHaveURL(/view=trash/);
    await expect(page.locator('[data-cy="notes-trash-empty"]')).toHaveText('A lixeira está vazia.');
    await expect(page.locator('[data-cy="notes-trash"]')).toContainText(
      'fora da busca e dos backlinks',
    );
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('[data-cy="notes-tab-trash"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('a busca vai para a URL (q) e volta no F5', async ({ page }) => {
    await page.goto('/notes');
    await waitForApp(page);

    await page.locator('[data-cy="notes-search"]').fill('macbook');
    await expect(page).toHaveURL(/q=macbook/);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('[data-cy="notes-search"]')).toHaveValue('macbook');
  });
});

test.describe('importar e exportar', () => {
  test('exportar: nada baixa sozinho; aparece "Arquivo pronto" e o zip nasce do clique em Salvar', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="vault-export-action"]').click();
    await expect(page.locator('[data-cy="vault-export-ready"]')).toBeVisible();

    const downloading = page.waitForEvent('download');
    await page.locator('[data-cy="vault-export-save"]').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('moneylog-vault.zip');
    expect(download.url()).toMatch(/^blob:/);
    expect(download.url()).not.toMatch(/token|access|bearer/i);
    await expect(page.locator('a[download]')).toHaveCount(0);
  });

  test('importar: o único input file é o escondido do FilePicker; confirma, mostra o relatório e conclui', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/notes');
    await waitForApp(page);
    await page.locator('[data-cy="empty-state-action-import-vault"]').click();

    const inputs = page.locator('input[type="file"]');
    await expect(inputs).toHaveCount(1);
    await expect(inputs.first()).toBeHidden();
    await expect(page.locator('app-file-picker input[type="file"]')).toHaveCount(1);
    await expect(inputs.first()).toHaveAttribute('accept', '.zip');

    // O botão próprio abre o seletor do sistema (um clique do usuário).
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-cy="vault-file"]').click();
    await (await chooser).setFiles(ZIP);
    await expect(page.locator('[data-cy="vault-file-name"]')).toHaveText('moneylog-vault.zip');
    await expect(page.locator('[data-cy="vault-file-announce"]')).toHaveText(
      'Arquivo recebido: moneylog-vault.zip',
    );

    await page.locator('[data-cy="vault-mode-RENAME"]').click();
    await page.locator('[data-cy="vault-import-action"]').click();
    // Confirmação clara antes de enviar: nenhuma nota existente é sobrescrita.
    const dialog = page.getByRole('dialog', { name: 'Importar este arquivo?' });
    await expect(dialog).toContainText('Notas que já existem não mudam');
    await expect(dialog).toContainText('nome (2)');
    await page.locator('[data-cy="confirm-dialog-confirm"]').click();

    await expect(page.locator('[data-cy="import-report"]')).toBeVisible();
    await expect(page.locator('[data-cy="import-report-review"]')).toContainText(
      'Revise antes de seguir',
    );
    await expect(page.locator('[data-cy="import-created"]')).toHaveText('0');
    await page.locator('[data-cy="import-done"]').click();
    await expect(page.locator('[data-cy="import-report"]')).toBeHidden();
  });

  test('importar: arquivo que não é .zip é recusado no campo, sem enviar', async ({ page }) => {
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="vault-file-native"]').setInputFiles({
      name: 'notas.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('oi'),
    });

    await expect(page.locator('[data-cy="vault-file-error"]')).toHaveText(
      'Escolha um arquivo .zip.',
    );
    await expect(page.locator('[data-cy="vault-file-name"]')).toHaveCount(0);
  });

  test('importar: acima de 20 MB é recusado no campo antes de subir', async ({ page }) => {
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="vault-file-native"]').setInputFiles({
      name: 'grande.zip',
      mimeType: 'application/zip',
      buffer: Buffer.alloc(21 * 1024 * 1024),
    });

    await expect(page.locator('[data-cy="vault-file-error"]')).toContainText(
      'tamanho máximo de 20 MB',
    );
  });

  test('o teclado alcança o botão do seletor e Enter abre o seletor de arquivos', async ({
    page,
  }) => {
    await page.goto('/settings');
    await waitForApp(page);

    await page.locator('[data-cy="vault-file"]').focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    expect(await chooser).toBeTruthy();
  });

  test('o texto da seção é honesto: guardado no servidor, exporte uma cópia em Markdown (zip do Obsidian)', async ({
    page,
  }) => {
    await page.goto('/settings');
    await waitForApp(page);

    await expect(page.locator('[data-cy="vault-storage"]')).toContainText(
      'guardadas no servidor do moneylog',
    );
    await expect(page.locator('[data-cy="vault-storage"]')).toContainText('Obsidian');
  });
});

test.describe('acessibilidade, 375 px e idiomas', () => {
  for (const path of ['/notes', '/notes?view=trash', '/settings']) {
    test(`${path} não tem violações do axe`, async ({ page }) => {
      await seedPreferences(page, { language: 'pt' });
      await page.goto(path);
      await waitForApp(page);

      expect(await runAxe(page)).toEqual([]);
    });
  }

  test('/notes com a importação aberta não tem violações do axe nem rolagem horizontal a 375 px', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/notes');
    await waitForApp(page);
    await page.locator('[data-cy="empty-state-action-import-vault"]').click();
    await page.locator('[data-cy="vault-file-native"]').setInputFiles(ZIP);

    await expectNoHorizontalScroll(page);
    expect(await runAxe(page)).toEqual([]);
  });

  test('a folha "Nova nota" a 375 px é uma folha inferior sem rolagem horizontal', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/notes');
    await waitForApp(page);
    await page.locator('[data-cy="notes-new"]').click();

    await expect(page.locator('[data-cy="new-note-form"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(await runAxe(page)).toEqual([]);
  });

  for (const [language, title, storage] of [
    ['en', 'No notes in the vault.', 'Stored on the moneylog server.'],
    ['es', 'Ninguna nota en el vault.', 'Guardado en el servidor de moneylog.'],
  ] as const) {
    test(`em ${language} a tela de notas está traduzida`, async ({ page }) => {
      await seedPreferences(page, { language });
      await page.goto('/notes');
      await waitForApp(page);

      await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(title);
      await expect(page.locator('[data-cy="notes-storage"]')).toContainText(storage);
      await expectNoRawKeys(page);
    });
  }

  test('o editor de uma nota inexistente mostra "não encontrada" com volta às notas', async ({
    page,
  }) => {
    await page.goto('/notes/00000000-0000-4000-8000-000000000001');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText('Nota não encontrada');
    await page.locator('[data-cy="empty-state-action-back"]').click();
    await expect(page).toHaveURL(/\/notes$/);
  });
});
