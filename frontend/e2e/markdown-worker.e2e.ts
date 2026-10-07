import {
  expect,
  HOSTILE_MARKDOWN,
  maxMainThreadStallMs,
  openSeededNote,
  seedPreferences,
  test,
} from './support';

/**
 * Markdown hostil (F1 da revisão da Etapa 6): o lexer do `marked` tem custo quadrático (`*a *a ...` leva 22 s
 * em 40 KB e minutos em 200 KB), e nenhum teto de tamanho resolve. O parsing roda num **Web Worker de
 * verdade** com tempo limite (1,5 s): ao estourar, o worker é encerrado e a nota aparece como texto simples,
 * sem nunca prender a thread principal. Aqui, no `mock` e no `prod` (build de produção, worker empacotado),
 * cada payload de 200 KB abre a nota: a página continua responsiva (< 1 s sem responder), o editor abre e
 * aceita digitação e a pré-visualização mostra a nota formatada ou, se pesada demais, o aviso com o texto.
 */
const SIZE = 200_000;
const STALL_LIMIT_MS = 1000;

for (const [name, { build, heavy }] of Object.entries(HOSTILE_MARKDOWN)) {
  test(`Markdown hostil de 200 KB (${name}): a página responde, o editor abre e a UI mostra o texto`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedPreferences(page, { language: 'pt' });
    const body = build(SIZE);
    expect(body.length).toBeLessThanOrEqual(SIZE);

    await openSeededNote(page, body);

    // O editor abre (a nota inteira está nele) e a pré-visualização termina de calcular.
    await expect(page.locator('[data-cy="note-text"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-cy="markdown-view"]')).toBeVisible();
    await expect(page.locator('[data-cy="markdown-view"]:not([aria-busy])')).toBeVisible({
      timeout: 20_000,
    });
    if (heavy) {
      await expect(page.locator('[data-cy="markdown-too-complex"]')).toContainText(
        'grande ou complexa demais para formatar; mostrando como texto',
      );
      await expect(page.locator('[data-cy="markdown-plain"]')).toBeVisible();
    } else {
      // Pode terminar a tempo (árvore), cair no texto simples ou, se o lexer lançar, num bloco de código; nunca fica em branco nem pendurado.
      await expect(
        page.locator(
          '[data-cy="markdown-plain"], [data-cy="markdown-view"] p, [data-cy="markdown-view"] blockquote, [data-cy="markdown-view"] pre',
        ),
      ).not.toHaveCount(0);
    }

    // A thread principal nunca ficou presa por mais de 1 s (antes: 22 s a mais de 9 min).
    const stall = await maxMainThreadStallMs(page);
    // Medida registrada no relatório do teste (nada de console da página: o observador o trataria como erro).
    test
      .info()
      .annotations.push({ type: 'maior-travamento-ms', description: String(Math.round(stall)) });
    expect(stall).toBeLessThan(STALL_LIMIT_MS);

    // E o editor continua vivo: digitar muda o estado para "Alterações não salvas".
    await page.locator('[data-cy="note-text"]').click();
    await page.keyboard.type('x');
    await expect(page.locator('[data-cy="note-status"]')).toContainText('Alterações não salvas');
    expect(await maxMainThreadStallMs(page)).toBeLessThan(STALL_LIMIT_MS);
  });
}

test('Markdown comum: a nota formata pelo worker (sem aviso) e o link mostra o destino real', async ({
  page,
}) => {
  await seedPreferences(page, { language: 'pt' });

  await openSeededNote(
    page,
    '# Título\n\nUm [banco.com](https://evil.example/x) e **forte**.\n\n- a\n- b',
  );

  await expect(page.locator('[data-cy="markdown-view"] h2')).toHaveText('Título');
  await expect(page.locator('[data-cy="markdown-view"] strong')).toHaveText('forte');
  await expect(page.locator('[data-cy="md-link-host"]')).toContainText('evil.example');
  await expect(page.locator('[data-cy="markdown-too-complex"]')).toHaveCount(0);
});
