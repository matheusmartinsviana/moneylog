import { expect, Page, test as base } from '@playwright/test';

/** Viewports do T17/T20. */
export const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

/** Cor de `--color-canvas` aplicada ao `body` em cada tema (tokens.css). */
export const CANVAS = {
  light: 'rgb(242, 242, 245)',
  dark: 'rgb(14, 14, 16)',
} as const;

export type Lang = 'pt' | 'en' | 'es';

export const HTML_LANG: Record<Lang, string> = { pt: 'pt-BR', en: 'en', es: 'es' };

/** Rótulos de navegação esperados (T17 CA 1–3; T31: "Novo registro", S-57), por idioma. */
export const NAV_LABELS: Record<Lang, Record<string, string>> = {
  pt: {
    home: 'Início',
    transactions: 'Movimentações',
    quickAdd: 'Novo registro',
    goals: 'Metas',
    more: 'Mais',
    cards: 'Cartões',
    accounts: 'Contas',
    planning: 'Planejamento',
    people: 'Pessoas',
    notes: 'Notas',
    import: 'Importar extrato',
    insights: 'Insights',
    settings: 'Configurações',
    budgets: 'Orçamentos',
    vault: 'Vault',
    ai: 'IA',
    mcp: 'MCP',
    notifications: 'Notificações',
  },
  en: {
    home: 'Home',
    transactions: 'Transactions',
    quickAdd: 'New entry',
    goals: 'Goals',
    more: 'More',
    cards: 'Cards',
    accounts: 'Accounts',
    planning: 'Planning',
    people: 'People',
    notes: 'Notes',
    import: 'Import statement',
    insights: 'Insights',
    settings: 'Settings',
    budgets: 'Budgets',
    vault: 'Vault',
    ai: 'AI',
    mcp: 'MCP',
    notifications: 'Notifications',
  },
  es: {
    home: 'Inicio',
    transactions: 'Movimientos',
    quickAdd: 'Nuevo registro',
    goals: 'Metas',
    more: 'Más',
    cards: 'Tarjetas',
    accounts: 'Cuentas',
    planning: 'Planificación',
    people: 'Personas',
    notes: 'Notas',
    import: 'Importar extracto',
    insights: 'Insights',
    settings: 'Ajustes',
    budgets: 'Presupuestos',
    vault: 'Vault',
    ai: 'IA',
    mcp: 'MCP',
    notifications: 'Notificaciones',
  },
};

export const NOT_FOUND_TITLE: Record<Lang, string> = {
  pt: 'Página não encontrada',
  en: 'Page not found',
  es: 'Página no encontrada',
};

/** Todas as rotas da navegação, com a chave de `nav` que dá o título da página. */
export const ROUTES = [
  { path: '/', key: 'home' },
  { path: '/transactions', key: 'transactions' },
  // `/quick-add` não tem página: abre o modal Novo registro sobre a tela de origem (cobertura nos specs dele).
  { path: '/goals', key: 'goals' },
  { path: '/more', key: 'more' },
  { path: '/cards', key: 'cards' },
  { path: '/accounts', key: 'accounts' },
  { path: '/planning', key: 'planning' },
  { path: '/people', key: 'people' },
  { path: '/notes', key: 'notes' },
  { path: '/import', key: 'import' },
  { path: '/insights', key: 'insights' },
  { path: '/settings', key: 'settings' },
  { path: '/budgets', key: 'budgets' },
  { path: '/vault', key: 'vault' },
  { path: '/ai', key: 'ai' },
  { path: '/mcp', key: 'mcp' },
  { path: '/notifications', key: 'notifications' },
] as const;

export const BOTTOM_NAV_ORDER = ['home', 'transactions', 'quickAdd', 'goals', 'more'];
/**
 * Ordem da sidebar em grupos (DS 02, T193): OVERVIEW, WORKSPACE e SYSTEM. Mudou de propósito: antes era
 * uma lista plana (… cards, accounts, planning, goals, people, notes …). `budgets` entrou com T208 (a
 * página "em breve"); `vault`, `ai` e `mcp` (fatia F) e `notifications` completam os 16 itens.
 */
export const SIDEBAR_GROUP_ORDER = {
  overview: ['home', 'transactions', 'accounts', 'cards', 'goals', 'budgets', 'planning'],
  workspace: ['vault', 'notes', 'people', 'insights', 'ai', 'mcp'],
  system: ['import', 'notifications', 'settings'],
} as const;
export const SIDEBAR_ORDER: string[] = Object.values(SIDEBAR_GROUP_ORDER).flat();
/** `/more`: a sidebar menos a barra inferior (home, transactions, goals), na ordem dos grupos. */
export const MORE_ORDER = SIDEBAR_ORDER.filter((key) => !BOTTOM_NAV_ORDER.includes(key));

/** Chave de i18n que vazou crua para a tela (ex.: `emptyState.cards.title`). */
const RAW_KEY =
  /\b(shell|nav|header|charts|dashboard|search|emptyState|settings|home|more|notFound|quickAdd|money|goals|summary|projections|exports|notes)\.[a-zA-Z]+(\.[a-zA-Z]+)*\b/;

interface Observed {
  consoleProblems: string[];
  thirdPartyRequests: string[];
  apiRequests: string[];
  failedRequests: string[];
}

/**
 * `test` com um observador automático: todo teste falha se houver erro/warning no console,
 * exceção não tratada, requisição a outro domínio, chamada a `/v1` ou requisição com falha.
 */
export const test = base.extend<{ observed: Observed }>({
  observed: [
    async ({ page, baseURL }, use, testInfo) => {
      const origin = new URL(baseURL ?? 'http://localhost').origin;
      const observed: Observed = {
        consoleProblems: [],
        thirdPartyRequests: [],
        apiRequests: [],
        failedRequests: [],
      };
      const integration = testInfo.project.name === 'integration';
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          // O Chromium loga todo 4xx/5xx de rede como erro de console. No projeto `integration` os
          // erros de API são conferidos por status em `integration/fixtures.ts` (NetLog), que falha
          // o teste se o status não foi declarado por ele.
          if (
            integration &&
            /Failed to load resource: (the server responded with a status of [45]\d\d|net::ERR_(CONNECTION_RESET|INTERNET_DISCONNECTED))/.test(
              msg.text(),
            )
          ) {
            return;
          }
          observed.consoleProblems.push(`[${msg.type()}] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => observed.consoleProblems.push(`[pageerror] ${err.message}`));
      page.on('request', (req) => {
        const url = new URL(req.url());
        if (url.protocol === 'data:' || url.protocol === 'blob:') return;
        if (url.origin !== origin) observed.thirdPartyRequests.push(req.url());
        if (url.origin === origin && url.pathname.startsWith('/v1')) {
          observed.apiRequests.push(req.url());
        }
      });
      page.on('requestfailed', (req) => {
        const reason = req.failure()?.errorText ?? '';
        // Navegação cancelada pelo próprio teste não é defeito do app.
        if (reason.includes('ERR_ABORTED')) return;
        // `integration`: rede cortada de propósito pelo teste (`NetLog.offline`/`dropNextResponse`).
        if (integration && /ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED/.test(reason)) return;
        observed.failedRequests.push(`${req.url()} (${reason})`);
      });

      await use(observed);

      expect.soft(observed.consoleProblems, 'console sem erros nem warnings').toEqual([]);
      expect.soft(observed.thirdPartyRequests, 'nenhuma requisição a terceiros').toEqual([]);
      // Os projetos `mock` e `prod` usam o ambiente mock: nenhuma chamada a /v1. O `integration` usa o backend real.
      if (testInfo.project.name !== 'integration') {
        expect.soft(observed.apiRequests, 'nenhuma chamada a /v1 em modo mock').toEqual([]);
      }
      expect.soft(observed.failedRequests, 'nenhuma requisição com falha').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Deixa as respostas brutas do contrato em `window.__MONEYLOG_MOCK_RESPONSES__` antes do app subir: as facades em
 * modo mock (`mock` e `prod`) leem a chave do endpoint no lugar do estado vazio. O E2E compara a tela com o JSON.
 */
export async function seedMockResponses(
  page: Page,
  responses: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript((value) => {
    (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'] = value;
  }, responses);
}

/** Espera o app inicializar (i18n carregado e a página com o `<h1>`). */
export async function waitForApp(page: Page): Promise<void> {
  await expect(page.locator('[data-cy="page-title"]')).toBeVisible();
}

/** Grava as preferências antes do primeiro carregamento (mesmas chaves do app). */
export async function seedPreferences(
  page: Page,
  prefs: { language?: Lang; theme?: 'light' | 'dark' },
): Promise<void> {
  await page.addInitScript((p) => {
    try {
      if (p.language) localStorage.setItem('moneylog.language', p.language);
      if (p.theme) localStorage.setItem('moneylog.theme', p.theme);
    } catch {
      // storage indisponível: o app deve seguir com o padrão
    }
  }, prefs);
}

/** Largura total do documento não pode passar da viewport. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'sem scroll horizontal').toBeLessThanOrEqual(clientWidth);
}

/** Nenhuma chave de i18n crua no texto visível. */
export async function expectNoRawKeys(page: Page): Promise<void> {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(RAW_KEY);
}

export async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

// A suíte roda como CommonJS (o package.json não é `type: module`).
const AXE_PATH = require.resolve('axe-core/axe.min.js');

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  targets: string[];
}

/** Roda o axe-core (já é devDependency do projeto) na página e devolve as violações. */
export async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<AxeResult> } }).axe;
    interface AxeResult {
      violations: {
        id: string;
        impact: string | null;
        help: string;
        nodes: { target: string[] }[];
      }[];
    }
    const result = await axe.run(document);
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
  });
}

/** Markdown hostil (custo quadrático no lexer do `marked`) com `size` caracteres: o que o backend aceita em 200 KB. */
export const HOSTILE_MARKDOWN: Record<string, { build: (size: number) => string; heavy: boolean }> =
  {
    'asteriscos soltos (*a *a ...)': {
      build: (n) => '*a '.repeat(Math.ceil(n / 3)).slice(0, n),
      heavy: true,
    },
    'negrito e itálico abertos (**a *b ...)': {
      build: (n) => '**a *b '.repeat(Math.ceil(n / 7)).slice(0, n),
      heavy: true,
    },
    'tachado aberto (~~a ...)': {
      build: (n) => '~~a '.repeat(Math.ceil(n / 4)).slice(0, n),
      heavy: true,
    },
    'sublinhados (_a_a...)': {
      build: (n) => '_a'.repeat(Math.ceil(n / 2)).slice(0, n),
      heavy: true,
    },
    'sinais de menor (<<<...)': { build: (n) => '<'.repeat(n), heavy: true },
    'links abertos ([a]( ...)': {
      build: (n) => '[a]('.repeat(Math.ceil(n / 4)).slice(0, n),
      heavy: false,
    },
    'tags abertas (<a <a ...)': {
      build: (n) => '<a '.repeat(Math.ceil(n / 3)).slice(0, n),
      heavy: true,
    },
    'tarefas (- [ ] a ...)': {
      build: (n) => '- [ ] a\n'.repeat(Math.ceil(n / 8)).slice(0, n),
      heavy: true,
    },
    'citações aninhadas (> > > ...)': {
      build: (n) => '> '.repeat(Math.ceil(n / 2)).slice(0, n),
      heavy: false,
    },
  };

/**
 * Abre, no ambiente mock, uma nota com `body` (semeada no `sessionStorage`; ver `seededMockNote`) por uma
 * navegação da SPA (sem recarregar), com um "batimento" na thread principal: um `setInterval` de 50 ms que
 * registra o maior atraso. Devolve o id. Quem chama espera o editor e lê o atraso com `maxMainThreadStallMs`.
 */
export async function openSeededNote(page: Page, body: string): Promise<string> {
  const id = crypto.randomUUID();
  await page.goto('/notes');
  await waitForApp(page);
  await page.evaluate(
    ({ id: noteId, text }) => {
      const now = '2026-10-05T10:00:00Z';
      sessionStorage.setItem(
        `moneylog.mock.note.${noteId}`,
        JSON.stringify({
          id: noteId,
          path: 'hostil/nota.md',
          title: 'nota',
          body: text,
          tags: [],
          links: [],
          version: 1,
          trashedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
      const w = window as unknown as { __maxStall: number };
      w.__maxStall = 0;
      let last = performance.now();
      setInterval(() => {
        const t = performance.now();
        w.__maxStall = Math.max(w.__maxStall, t - last - 50);
        last = t;
      }, 50);
      // Navegação da SPA (o roteador escuta `popstate`): o boot do app não entra na medida.
      history.pushState({}, '', `/notes/${noteId}`);
      dispatchEvent(new PopStateEvent('popstate'));
    },
    { id, text: body },
  );
  return id;
}

/** O maior tempo (ms) em que a thread principal ficou presa desde `openSeededNote`. */
export async function maxMainThreadStallMs(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __maxStall: number }).__maxStall);
}

/**
 * Toda a navegação da sidebar (marca, "Novo registro", itens e avatar) é alcançável na altura atual da janela:
 * o avatar fica à vista **sem rolar** e cada item, depois de rolado para a vista, está dentro da viewport e
 * recebe o clique (nada o cobre). Vale para a sidebar recolhida (768 a 1199 px), que antes não rolava.
 */
export async function expectSidebarReachable(page: Page): Promise<void> {
  const keys = await page
    .locator('[data-cy="sidebar"] a, [data-cy="sidebar"] button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-cy') ?? ''));
  expect(keys, 'marca, novo registro, 16 itens e avatar').toHaveLength(19);
  const viewport = page.viewportSize()!;
  const profile = (await page.locator('[data-cy="sidebar-profile"]').boundingBox())!;
  expect(profile.y, 'o avatar já está à vista, sem rolar').toBeGreaterThanOrEqual(0);
  expect(profile.y + profile.height, 'o avatar não passa do fim da janela').toBeLessThanOrEqual(
    viewport.height + 0.5,
  );
  for (const key of keys) {
    const item = page.locator(`[data-cy="${key}"]`);
    await item.scrollIntoViewIfNeeded();
    const state = await item.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        inView: rect.top >= 0 && rect.bottom <= window.innerHeight + 0.5,
        clickable: top !== null && (node === top || node.contains(top)),
      };
    });
    expect(state, `${key} alcançável em ${viewport.width}x${viewport.height}`).toEqual({
      inView: true,
      clickable: true,
    });
  }
}

/**
 * Lados em que o anel de foco (`ring` px de `box-shadow`) do elemento é recortado por um ancestral que
 * não deixa o conteúdo vazar (`overflow` diferente de `visible`). Vazio = o anel cabe inteiro.
 */
export async function focusRingClippedSides(
  page: Page,
  selector: string,
  ring = 4,
): Promise<string[]> {
  return page
    .locator(selector)
    .first()
    .evaluate((node, size) => {
      const rect = node.getBoundingClientRect();
      const clipped = new Set<string>();
      for (let el = node.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        const clipsX = style.overflowX !== 'visible';
        const clipsY = style.overflowY !== 'visible';
        if (!clipsX && !clipsY) continue;
        const box = el.getBoundingClientRect();
        const left = box.left + el.clientLeft;
        const top = box.top + el.clientTop;
        if (clipsX && rect.left - size < left - 0.5) clipped.add('left');
        if (clipsX && rect.right + size > left + el.clientWidth + 0.5) clipped.add('right');
        if (clipsY && rect.top - size < top - 0.5) clipped.add('top');
        if (clipsY && rect.bottom + size > top + el.clientHeight + 0.5) clipped.add('bottom');
      }
      return [...clipped];
    }, ring);
}

/** Contraste WCAG entre duas cores `rgb()/rgba()` computadas (a transparência é ignorada). */
export function contrastRatio(a: string, b: string): number {
  const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const luminance = (css: string) => {
    const [r, g, bl] = channels(css).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
