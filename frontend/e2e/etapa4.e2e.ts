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
 * Etapa 4 no ambiente mock (sem backend: nenhuma pessoa, dívida ou recorrência). Os fluxos com dados
 * (emprestar → ver a dívida na pessoa → receber a devolução, despesa dividida, recorrência realizada e
 * pulada) são dos testes de componente e do projeto `integration` (`integration/debts.e2e.ts` e
 * `integration/recurrences.e2e.ts`). Aqui: estados vazios, formulários, validação, a11y e 375 px.
 */

test.describe('/people sem pessoas', () => {
  test('mostra o estado vazio com "Adicionar pessoa" habilitado e leva ao formulário', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/people');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText(
      'Nenhuma pessoa registrada.',
    );
    const action = page.locator('[data-cy="empty-state-action-add-person"]');
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page).toHaveURL(/\/people\/new$/);
  });

  test('a aba "Arquivadas" vai para a URL e diz que não há nenhuma', async ({ page }) => {
    await page.goto('/people');
    await waitForApp(page);

    await page.locator('[data-cy="people-tab-archived"]').click();

    await expect(page).toHaveURL(/status=ARCHIVED/);
    await expect(page.locator('[data-cy="people-empty-archived"]')).toBeVisible();
  });

  test('a busca por nome é um campo próprio (sem input type=search)', async ({ page }) => {
    await page.goto('/people');
    await waitForApp(page);

    await page.locator('[data-cy="people-search"]').fill('joão');
    await expect(page.locator('input[type="search"]')).toHaveCount(0);
  });
});

test.describe('/people/new', () => {
  test('valida só para UX e aponta o nome obrigatório', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/people/new');
    await waitForApp(page);

    await page.locator('[data-cy="person-form-save"]').click();

    await expect(page.locator('[data-cy="person-name"]')).toHaveAttribute('aria-invalid', 'true');
    await expectNoRawKeys(page);
  });

  test('criar fecha o modal, mostra o aviso e volta para a lista', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/people/new');
    await waitForApp(page);

    await page.locator('[data-cy="person-name"]').fill('João');
    await page.locator('[data-cy="person-form-save"]').click();

    await expect(page).toHaveURL(/\/people$/);
    await expect(page.locator('[data-cy="form-modal-panel"]')).toHaveCount(0);
  });
});

test.describe('/debts/:id', () => {
  test('uma dívida que não existe mostra "não encontrada" com o caminho de volta', async ({
    page,
  }) => {
    await page.goto('/debts/00000000-0000-4000-8000-000000000001');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText('Dívida não encontrada');
    await page.locator('[data-cy="empty-state-action-back"]').click();
    await expect(page).toHaveURL(/\/people$/);
  });
});

test.describe('/quick-add: pessoas e dívidas', () => {
  test('o grupo "Pessoas e dívidas" tem emprestar, receber e nova dívida', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    // Sem nenhuma conta o /quick-add só abre o modo "Nova dívida" (não usa conta): é por ele que se chega ao grupo.
    await page.goto('/quick-add?mode=debt');
    await waitForApp(page);

    await expect(page.locator('[data-cy="quick-add-people"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    for (const mode of ['received', 'debt']) {
      await expect(page.locator(`[data-cy="quick-add-people-mode-${mode}"]`)).toBeVisible();
    }
  });

  test('"Dinheiro emprestado" sem nenhuma conta pede para cadastrar uma conta', async ({
    page,
  }) => {
    await page.goto('/quick-add?mode=loan');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-action-add-account"]')).toBeVisible();
  });

  test('"Nova dívida" não precisa de conta, explica que não mexe no saldo e mostra a categoria só em "Eu devo"', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/quick-add?mode=debt');
    await waitForApp(page);

    await expect(page.locator('[data-cy="debt-no-movement"]')).toContainText(
      'não mexe no saldo das contas',
    );
    await expect(page.locator('[data-cy="debt-category"]')).toHaveCount(0);
    await page.locator('[data-cy="debt-direction-PAYABLE"]').click();
    await expect(page.locator('[data-cy="debt-category"]')).toBeVisible();
    await page.locator('[data-cy="form-save"]').click();
    await expect(page.locator('[data-cy="debt-principal"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('"Nova pessoa…" abre o nome e o botão cria a pessoa antes (no mock, devolve a pessoa e fica escolhida)', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/quick-add?mode=debt');
    await waitForApp(page);

    await page.locator('[data-cy="debt-person"]').click();
    await page.locator('[data-cy="debt-person-option-__new-person__"]').click();
    await page.locator('[data-cy="debt-person-new-name"]').fill('Ana');
    await page.locator('[data-cy="debt-person-new-create"]').click();

    await expect(page.locator('[data-cy="debt-person"]')).toContainText('Ana');
  });
});

test.describe('/planning', () => {
  test('leva às recorrências: estimativa mensal rotulada, estado vazio e "Nova recorrência"', async ({
    page,
  }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/planning');
    await waitForApp(page);

    await expect(page).toHaveURL(/\/planning\/recurrences$/);
    await expect(page.locator('[data-cy="recurrence-summary-estimate"]')).toHaveText('Estimativa');
    await expect(page.locator('[data-cy="recurrence-fixed-costs"]')).toContainText('R$ 0,00');
    await expect(page.locator('[data-cy="recurrence-recurring-income"]')).toContainText('R$ 0,00');
    const action = page.locator('[data-cy="empty-state-action-add-recurrence"]');
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page).toHaveURL(/\/planning\/recurrences\/new$/);
  });

  test('"Pendentes" diz que não há nada pendente', async ({ page }) => {
    await seedPreferences(page, { language: 'pt' });
    await page.goto('/planning/recurrences');
    await waitForApp(page);

    await page.locator('[data-cy="planning-tab-pending"]').click();

    await expect(page).toHaveURL(/\/planning\/occurrences$/);
    await expect(page.locator('[data-cy="empty-state-title"]')).toHaveText('Nada pendente');
  });
});

test.describe('/planning/recurrences/new', () => {
  test('sem conta nem cartão, pede para cadastrar uma conta', async ({ page }) => {
    await page.goto('/planning/recurrences/new');
    await waitForApp(page);

    await expect(page.locator('[data-cy="empty-state-action-add-account"]')).toBeVisible();
  });
});

for (const [name, viewport] of Object.entries({
  mobile: VIEWPORTS.mobile,
  desktop: VIEWPORTS.desktop,
})) {
  test.describe(`layout e acessibilidade em ${name}`, () => {
    test.use({ viewport });

    for (const path of [
      '/people',
      '/people/new',
      '/quick-add?mode=loan',
      '/quick-add?mode=received',
      '/quick-add?mode=debt',
      '/planning/recurrences',
      '/planning/occurrences',
      '/planning/recurrences/new',
    ]) {
      test(`${path}: sem scroll horizontal, sem chave crua e sem violações do axe`, async ({
        page,
      }) => {
        await seedPreferences(page, { language: 'pt' });
        await page.goto(path);
        await waitForApp(page);

        await expectNoHorizontalScroll(page);
        await expectNoRawKeys(page);
        const violations = await runAxe(page);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      });
    }

    test('em inglês e espanhol, as telas novas não vazam texto em português', async ({ page }) => {
      for (const lang of ['en', 'es'] as const) {
        await seedPreferences(page, { language: lang });
        for (const path of ['/people', '/planning/recurrences', '/quick-add?mode=debt']) {
          await page.goto(path);
          await waitForApp(page);
          await expectNoRawKeys(page);
          const text = await page.locator('main').innerText();
          expect(text, `${lang} ${path}`).not.toMatch(
            /Adicionar pessoa|Nova recorrência|Custo fixo mensal|Nova dívida/,
          );
        }
      }
    });
  });
}
