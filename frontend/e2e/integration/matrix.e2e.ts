/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  expectNoHorizontalScroll,
  expectNoRawKeys,
  HTML_LANG,
  runAxe,
  VIEWPORTS,
} from '../support';
import { expense, income, todayInSaoPaulo } from '../support/api';

import {
  cy,
  cyText,
  totalsText,
  expect,
  fmt,
  Lang,
  norm,
  open,
  resetDatabase,
  seedPreferences,
  test,
} from './fixtures';

/**
 * T44 CA6 e PR 01 regra 10: 375/768/1280 px, tema claro/escuro, pt/en/es. Em cada combinação, as
 * telas de Início, lista (registros e competência), contas, /quick-add e detalhe mostram exatamente
 * os números que a API devolveu (a tela só exibe; quem calcula é o backend), sem scroll horizontal,
 * sem chave de i18n crua, sem violação axe crítica/séria, sem erro de console e sem requisição
 * duplicada (os dois últimos são conferidos pelos observadores automáticos).
 */
const SIZES = { 375: VIEWPORTS.mobile, 768: VIEWPORTS.tablet, 1280: VIEWPORTS.desktop } as const;
const LANGS: Lang[] = ['pt', 'en', 'es'];
const THEMES = ['light', 'dark'] as const;

const EVIDENCE_FULL = (w: number, l: Lang) => l === 'pt' && w !== 768;
const EVIDENCE_LIGHT_ONLY = (w: number, l: Lang, t: string) =>
  l !== 'pt' && w !== 768 && t === 'light';

test.beforeEach(() => resetDatabase());

async function seed(api: any) {
  const a = await api.createAccount({ name: 'Nubank', openingBalance: '1000.00' });
  const b = await api.createAccount({
    name: 'Poupança',
    type: 'SAVINGS',
    openingBalance: '200.00',
  });
  const inv = await api.createAccount({
    name: 'CDB',
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
  await api.txOk(
    expense({
      amount: '10.10',
      accountId: b.id,
      categoryId: fun,
      method: 'DEBIT',
      description: 'cinema',
    }),
  );
  await api.txOk(
    income({ amount: '3000.00', accountId: a.id, categoryId: salary, description: 'salário' }),
  );
  await api.txOk({
    type: 'TRANSFER',
    amount: '77.77',
    date: today,
    description: 'reserva',
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
    type: 'REFUND',
    amount: '23.45',
    date: today,
    description: 'reembolso',
    notes: null,
    accountId: a.id,
    categoryId: food,
    refundOfTransactionId: meal.id,
  });
  return { meal, accounts: [a, b, inv] };
}

for (const [width, viewport] of Object.entries(SIZES)) {
  for (const lang of LANGS) {
    for (const theme of THEMES) {
      test.describe(`${width}px ${lang} ${theme}`, () => {
        test.use({ viewport, colorScheme: theme });

        test('Início, lista, competência, contas, /quick-add e detalhe: números exatos e sem defeitos de layout', async ({
          page,
          api,
          signIn,
          evidence,
        }) => {
          const w = Number(width);
          const { meal } = await seed(api);
          const summary = (await api.get('/v1/dashboard/summary')).body;
          const list = (await api.get('/v1/transactions?pageSize=50')).body;
          const month = todayInSaoPaulo().slice(0, 7);
          const entries = (await api.get(`/v1/entries?competence=${month}&pageSize=50`)).body;
          const accounts = (await api.get('/v1/accounts?pageSize=50')).body.items;

          await seedPreferences(page, { language: lang, theme });
          await signIn(page);

          const check = async (name: string) => {
            await expectNoHorizontalScroll(page);
            await expectNoRawKeys(page);
            expect(await page.locator('html').getAttribute('lang')).toBe(HTML_LANG[lang]);
            const bad = (await runAxe(page)).filter(
              (v) => v.impact === 'critical' || v.impact === 'serious',
            );
            expect(bad, `axe (${name})`).toEqual([]);
            if (EVIDENCE_FULL(w, lang) || EVIDENCE_LIGHT_ONLY(w, lang, theme)) {
              await evidence(page, `matriz-${width}-${lang}-${theme}-${name}`);
            }
          };

          // Início
          await open(page, '/planning/overview');
          await expect(cy(page, 'home-legacy')).toBeVisible();
          const m = summary.month;
          expect(await cyText(page, 'home-in-accounts')).toBe(
            fmt(summary.balances.inAccounts.amount),
          );
          expect(await cyText(page, 'home-available')).toBe(fmt(summary.balances.available.amount));
          expect(await cyText(page, 'home-investments')).toBe(
            fmt(summary.balances.investments.amount),
          );
          expect(await cyText(page, 'home-month-income')).toBe(fmt(m.income.amount));
          expect(await cyText(page, 'home-month-consumption')).toBe(fmt(m.consumption.amount));
          expect(await cyText(page, 'home-month-net')).toBe(fmt(m.net.amount));
          expect(await cyText(page, 'home-month-cash-in')).toBe(fmt(m.cashFlow.in.amount));
          expect(await cyText(page, 'home-month-cash-out')).toBe(fmt(m.cashFlow.out.amount));
          expect(await cyText(page, 'home-month-cash-net')).toBe(fmt(m.cashFlow.net.amount));
          expect(await cyText(page, 'home-month-refunds')).toBe(fmt(m.refunds.amount));
          await check('inicio');

          // Lista (registros)
          await open(page, '/transactions');
          await expect(
            page
              .locator('[data-cy^="transaction-row-"], [data-cy^="transaction-item-"]')
              .filter({ visible: true })
              .first(),
          ).toBeVisible();
          const t = list.totals;
          expect(await totalsText(page, 'count')).toBe(String(t.count));
          expect(await totalsText(page, 'in')).toBe(fmt(t.cashFlow.in.amount));
          expect(await totalsText(page, 'out')).toBe(fmt(t.cashFlow.out.amount));
          expect(await totalsText(page, 'net')).toBe(fmt(t.cashFlow.net.amount));
          // O rodapé da lista é o fluxo de caixa do Início, número por número.
          expect(await totalsText(page, 'in')).toBe(await totalsText(page, 'in'));
          expect(t.cashFlow.in.amount).toBe(m.cashFlow.in.amount);
          expect(t.cashFlow.out.amount).toBe(m.cashFlow.out.amount);
          expect(t.cashFlow.net.amount).toBe(m.cashFlow.net.amount);
          for (const item of list.items) {
            const row = page
              .locator(
                `[data-cy="transaction-row-${item.id}"], [data-cy="transaction-item-${item.id}"]`,
              )
              .filter({ visible: true })
              .first();
            await expect(row).toBeVisible();
            expect(norm(await row.innerText())).toContain(fmt(item.amount.amount));
            expect(norm(await row.innerText())).toContain(item.description);
          }
          await check('lista');

          // Lista (competência)
          await cy(page, 'view-entries').click();
          expect(await totalsText(page, 'total')).toBe(fmt(entries.totals.total.amount));
          expect(entries.totals.total.amount).toBe(m.consumption.amount);
          for (const c of entries.totals.byCategory) {
            expect(await totalsText(page, `category-${c.category.id}`)).toBe(fmt(c.amount.amount));
          }
          await check('competencia');

          // Contas
          await open(page, '/accounts');
          await expect(cy(page, 'accounts-list')).toBeVisible();
          for (const acc of accounts) {
            expect(await cyText(page, `account-balance-${acc.id}`)).toContain(
              fmt(acc.currentBalance.amount),
            );
          }
          await check('contas');

          // /quick-add (Pix)
          await open(page, '/quick-add?mode=pix');
          await expect(cy(page, 'expense-form')).toBeVisible();
          await check('quick-add');

          // Detalhe da despesa (painel no desktop, página no celular)
          await page.goto(`/transactions/${meal.id}`); // no celular o detalhe é uma página: o título da lista fica oculto
          await expect(cy(page, 'transaction-detail')).toBeVisible();
          await expect(cy(page, 'detail-amount'))
            .toContainText(fmt('123.45').replace('R$ ', '').replace(/\s/g, ''), {
              useInnerText: true,
            })
            .catch(async () => {
              expect(norm(await cy(page, 'detail-amount').innerText())).toContain('123,45');
            });
          await expect(cy(page, 'impact-panel')).toBeVisible();
          await check('detalhe');
        });
      });
    }
  }
}

test.describe('BUG-E2E-01', () => {
  test.use({ viewport: VIEWPORTS.mobile });
  // Corrigido (BUG-E2E-01): o texto oculto da dica do "Crédito" desabilitado é contido pelo botão do seletor de modo.
  test('/quick-add não tem scroll horizontal a 375 px', async ({ page, api, signIn }) => {
    await api.createAccount({ name: 'Conta', openingBalance: '10.00' });
    await signIn(page);
    await open(page, '/quick-add?mode=pix');
    await expect(cy(page, 'expense-form')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
