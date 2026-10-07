import type { Page } from '@playwright/test';

import {
  CANVAS,
  contrastRatio,
  expect,
  expectNoHorizontalScroll,
  expectNoRawKeys,
  expectSidebarReachable,
  focusRingClippedSides,
  type Lang,
  ROUTES,
  runAxe,
  seedPreferences,
  SIDEBAR_ORDER,
  test,
  waitForApp,
} from './support';

/**
 * QA da fatia A do redesign (T196), por um agente independente: o que os testes do dev não pegam.
 * Relatório: docs/qa/2026-10-11-qa-redesign-fatia-a.md. Capturas: docs/qa/evidencias/redesign/qa/.
 *
 * Os bugs que esta suíte pegou (BUG-QA-xx) foram corrigidos pelo dev-frontend e os `test.fail` viraram os
 * testes verdadeiros: nenhum foi enfraquecido. Cada título de `describe` cita o bug que ele guarda.
 */

const ROUTE_PATHS: string[] = [...ROUTES.map((r) => r.path), '/settings/categories'];
const WIDTHS = [320, 375, 390, 414, 768, 820, 1023, 1024, 1180, 1199, 1200, 1280, 1440, 1920];

const heightFor = (width: number) => (width < 768 ? 812 : 800);

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
}

test.describe('layout: larguras do plano e transições de breakpoint', () => {
  test('sem rolagem horizontal de 320 a 1920 px (inclusive 1023/1024 e 1199/1200)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: heightFor(width) });
      for (const path of ['/', '/transactions', '/settings']) {
        await open(page, path);
        await expectNoHorizontalScroll(page);
      }
    }
  });

  test('1023 → 1024 liga a janela e 1199 → 1200 expande a sidebar, sem recarregar', async ({
    page,
  }) => {
    const probe = () =>
      page.evaluate(() => {
        const win = document.querySelector('[data-cy="shell-window"]')!;
        const aside = document.querySelector('.shell__aside')!;
        return {
          radius: Number.parseFloat(getComputedStyle(win).borderTopLeftRadius),
          aside: Math.round(aside.getBoundingClientRect().width),
        };
      });
    await page.setViewportSize({ width: 1023, height: 800 });
    await open(page, '/');
    expect(await probe()).toEqual({ radius: 0, aside: 72 });
    await page.setViewportSize({ width: 1024, height: 800 });
    expect(await probe()).toEqual({ radius: 28, aside: 72 });
    await page.setViewportSize({ width: 1199, height: 800 });
    expect((await probe()).aside).toBe(72);
    await page.setViewportSize({ width: 1200, height: 800 });
    expect((await probe()).aside).toBe(248);
    await expectNoHorizontalScroll(page);
  });

  for (const lang of ['en', 'es'] as Lang[]) {
    test(`320 px em ${lang}: textos mais longos não geram rolagem horizontal em nenhuma rota`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await seedPreferences(page, { language: lang });
      await page.setViewportSize({ width: 320, height: 640 });
      for (const path of ROUTE_PATHS) {
        await open(page, path);
        await expectNoHorizontalScroll(page);
        await expectNoRawKeys(page);
      }
    });
  }

  test('conteúdo não fica atrás da barra inferior em 375 px (fim da página)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const path of ['/', '/settings', '/accounts', '/transactions']) {
      await open(page, path);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const gap = await page.evaluate(() => {
        const nav = document.querySelector('[data-cy="bottom-nav"]')!.getBoundingClientRect();
        const content = document.querySelector('.shell__content')!.getBoundingClientRect();
        // O fim do conteúdo (já sem o respiro reservado à barra) precisa ficar acima do topo da barra.
        return nav.top - (content.bottom - nav.height);
      });
      expect(gap, `${path}: respiro mínimo acima da barra`).toBeGreaterThanOrEqual(-1);
    }
  });
});

test.describe('BUG-QA-01 · sidebar recolhida em telas baixas', () => {
  for (const [width, height] of [
    [844, 390],
    [932, 430],
    [1024, 600],
    [1100, 600],
    [1180, 600],
  ] as const) {
    test(`${width}x${height}: todo item da sidebar e o avatar são alcançáveis`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await open(page, '/');
      await expectSidebarReachable(page);
    });
  }

  test('o balão do item recolhido vem do appTooltip (no body), não de um rótulo absoluto dentro da coluna rolável', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await open(page, '/');
    const overflow = await page
      .locator('[data-cy="sidebar"]')
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflow).toBe('auto');
    await page.locator('[data-cy="sidebar-cards"]').hover();
    const tooltip = page.locator('body > .tooltip[role="tooltip"]');
    await expect(tooltip).toHaveText('Cartões');
    const link = (await page.locator('[data-cy="sidebar-cards"]').boundingBox())!;
    const bubble = (await tooltip.boundingBox())!;
    expect(bubble.x, 'o balão fica à direita do item').toBeGreaterThanOrEqual(link.x + link.width);
    expect(Math.abs(bubble.y + bubble.height / 2 - (link.y + link.height / 2))).toBeLessThan(4);
  });

  test('o balão também aparece no foco por teclado e some com Esc', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await open(page, '/');
    await page.locator('[data-cy="sidebar-goals"]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('body > .tooltip[role="tooltip"]')).toHaveText('Metas');
    await page.keyboard.press('Escape');
    await expect(page.locator('body > .tooltip')).toHaveCount(0);
  });

  test('expandida (>= 1200 px) não repete o rótulo em balão', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/');
    await page.locator('[data-cy="sidebar-cards"]').hover();
    await page.waitForTimeout(600);
    await expect(page.locator('body > .tooltip')).toHaveCount(0);
  });
});

test.describe('foco, teclado e menu do avatar (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('ordem de Tab: skip-link, marca, sidebar na ordem dos grupos, avatar, busca, sino, ações rápidas, conteúdo', async ({
    page,
  }) => {
    await open(page, '/');
    const seen: string[] = [];
    for (let i = 0; i < 3 + SIDEBAR_ORDER.length + 1 + 1 + 1 + 4; i++) {
      await page.keyboard.press('Tab');
      seen.push(
        await page.evaluate(() => document.activeElement?.getAttribute('data-cy') ?? 'SEM-DATA-CY'),
      );
    }
    expect(seen).toEqual([
      'skip-to-content',
      'sidebar-brand',
      'sidebar-quickAdd',
      ...SIDEBAR_ORDER.map((key) => `sidebar-${key}`),
      'sidebar-profile',
      // A busca global (T209) e o sino de notificações vêm no cabeçalho, antes das ações rápidas.
      'global-search-input',
      'header-bell',
      'header-action-expense',
      'header-action-income',
      'header-action-transfer',
      'header-action-askAi',
    ]);
  });

  test('só o item da rota atual tem aria-current; rota filha mantém o pai ativo', async ({
    page,
  }) => {
    for (const [path, key] of [
      ['/settings', 'settings'],
      ['/settings/categories', 'settings'],
      ['/quick-add?mode=income', 'quickAdd'],
      ['/accounts', 'accounts'],
    ] as const) {
      await open(page, path);
      const current = await page.evaluate(() =>
        [...document.querySelectorAll('[data-cy^="sidebar-"][aria-current]')].map((el) =>
          el.getAttribute('data-cy'),
        ),
      );
      expect(current, path).toEqual([`sidebar-${key}`]);
    }
  });

  test('menu do avatar no desktop: Enter abre com o foco no 1º item, setas, Esc fecha e devolve o foco', async ({
    page,
  }) => {
    await open(page, '/cards');
    const trigger = page.locator('[data-cy="sidebar-profile"]');
    await trigger.focus();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-cy="sidebar-profile-item-settings"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-cy="sidebar-profile-item-signOut"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-cy="sidebar-profile-item-settings"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe com o menu do avatar aberto (${scheme}); só a exceção conhecida de "region" no portal`, async ({
      page,
    }) => {
      await seedPreferences(page, { theme: scheme });
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, '/');
      await page.locator('[data-cy="sidebar-profile"]').click();
      await expect(page.locator('[role="menu"]')).toBeVisible();
      const violations = (await runAxe(page)).filter(
        // Mesma exceção de `ui-kit.e2e.ts`: popover no portal do `body`, sem papel de diálogo.
        (v) => !(v.id === 'region' && v.targets.every((t) => t.includes('app-overlay-panel'))),
      );
      expect(violations, JSON.stringify(violations)).toEqual([]);
    });
  }

  test('"Perguntar à IA" não faz nada, o chip é "IA desligada" e não há logo nem dado de demonstração', async ({
    page,
  }) => {
    for (const path of ROUTE_PATHS) {
      await open(page, path);
      const text = await page.locator('body').innerText();
      expect(text, path).not.toMatch(/demonstra|demo\b|FinVault/i);
    }
    await open(page, '/');
    const ask = page.locator('[data-cy="header-action-askAi"]');
    await ask.click({ force: true });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[role="dialog"], [role="menu"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="header-ai-status"]')).toHaveText('IA desligada');
    // Nenhuma imagem de marca: o espaço do logo é vazio e o wordmark vem de BRAND_NAME.
    await expect(
      page.locator('[data-cy="sidebar-brand"] img, [data-cy="sidebar-brand"] svg'),
    ).toHaveCount(0);
    await expect(page.locator('[data-cy="sidebar-brand"]')).toHaveText('moneylog');
    await expect(page).toHaveTitle(/moneylog/);
  });
});

test.describe('BUG-QA-02 e BUG-QA-03 · o anel de foco não é cortado', () => {
  test('o anel de 4 px de cada ação rápida cabe dentro do contêiner de rolagem (1280 px)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/cards');
    for (const key of ['expense', 'income', 'transfer', 'askAi']) {
      expect(
        await focusRingClippedSides(page, `[data-cy="header-action-${key}"]`),
        `header-action-${key}`,
      ).toEqual([]);
    }
  });

  test('o mesmo no celular, onde as ações rolam na horizontal (375 px, Início)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/');
    for (const key of ['expense', 'income']) {
      expect(await focusRingClippedSides(page, `[data-cy="header-action-${key}"]`), key).toEqual(
        [],
      );
    }
  });

  test('no tablet (768 px) as ações quebram de linha: nenhuma fica cortada atrás de rolagem (M5)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page, '/cards');
    const state = await page.evaluate(() => {
      const box = document.querySelector('[data-cy="header-actions"]')!;
      return {
        scrolls: box.scrollWidth > box.clientWidth + 1,
        hidden: [...box.children].some((el) => {
          const r = el.getBoundingClientRect();
          return r.right > window.innerWidth + 0.5 || r.left < -0.5;
        }),
      };
    });
    expect(state).toEqual({ scrolls: false, hidden: false });
    await expectNoHorizontalScroll(page);
  });

  test('o campo de busca dos filtros de Movimentações mostra o anel inteiro (disclosure)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/transactions');
    const field = page.locator('[data-cy="filter-search"]').first();
    await expect(field).toBeVisible();
    expect(await focusRingClippedSides(page, '[data-cy="filter-search"]')).toEqual([]);
  });
});

test.describe('temas', () => {
  test('theme-color acompanha o tema ESCOLHIDO, não só o do sistema', async ({ page }) => {
    await seedPreferences(page, { theme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, '/');
    const effective = await page.evaluate(() =>
      [...document.querySelectorAll('meta[name="theme-color"]')]
        .filter((m) => !m.getAttribute('media') || matchMedia(m.getAttribute('media')!).matches)
        .map((m) => m.getAttribute('content')),
    );
    expect(effective).toEqual(['#0e0e10']);
    expect(CANVAS.dark).toBe('rgb(14, 14, 16)');
  });

  test('data-theme vence o sistema nos dois sentidos e a troca em tempo de execução repinta a casca', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedPreferences(page, { theme: 'light' });
    await open(page, '/settings');
    const bg = () =>
      page.evaluate(() => ({
        body: getComputedStyle(document.body).backgroundColor,
        win: getComputedStyle(document.querySelector('[data-cy="shell-window"]')!).backgroundColor,
      }));
    expect((await bg()).body).toBe(CANVAS.light);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect((await bg()).body).toBe(CANVAS.dark);
    expect((await bg()).win).toBe('rgb(28, 28, 30)');
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    expect((await bg()).body, 'sem escolha: segue o sistema (escuro)').toBe(CANVAS.dark);
  });
});

test.describe('forced-colors (Windows alto contraste)', () => {
  test('BUG-QA-06a · o foco de teclado continua visível', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/cards');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement!);
      return { style: cs.outlineStyle, width: Number.parseFloat(cs.outlineWidth) };
    });
    expect(focus.style).not.toBe('none');
    expect(focus.width).toBeGreaterThan(0);
  });

  test('BUG-QA-06b · o item ativo da sidebar se distingue dos demais sem depender de cor de fundo', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/cards');
    // Visual real em forced-colors: fundo igual ao do canvas (transparente ou `Canvas`) não distingue nada.
    const style = (cy: string) =>
      page.evaluate((key) => {
        const cs = getComputedStyle(document.querySelector(`[data-cy="${key}"]`)!);
        const canvas = getComputedStyle(
          document.querySelector('[data-cy="shell-window"]')!,
        ).backgroundColor;
        const bg =
          cs.backgroundColor === canvas || /,\s*0\)$/.test(cs.backgroundColor)
            ? 'canvas'
            : cs.backgroundColor;
        return [
          bg,
          cs.color,
          cs.borderTopWidth,
          cs.borderLeftWidth,
          cs.textDecorationLine,
          cs.fontWeight,
          cs.outlineStyle,
        ].join('|');
      }, cy);
    expect(await style('sidebar-cards')).not.toBe(await style('sidebar-home'));
  });
});

test.describe('BUG-QA-07 · texto ampliado em tela estreita', () => {
  for (const [lang, width] of [
    ['pt', 320],
    ['es', 320],
    ['es', 375],
  ] as [Lang, number][]) {
    test(`fonte do sistema a 200% em ${width} px (${lang}): o cabeçalho do Início não estoura a largura`, async ({
      page,
    }) => {
      await seedPreferences(page, { language: lang });
      await page.setViewportSize({ width, height: 640 });
      await open(page, '/');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await expectNoHorizontalScroll(page);
      // Nada do cabeçalho fica para fora da tela: o chip e o avatar quebram de linha.
      const outside = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-cy="workspace-header"] *:not([data-cy="header-actions"] *)',
          ),
        ]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .map((el) => el.getAttribute('data-cy') ?? el.tagName),
      );
      expect(outside).toEqual([]);
    });
  }
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, width, height] of [
    ['mobile', 375, 812],
    ['desktop', 1280, 800],
  ] as const) {
    test(`axe em todas as rotas: ${name}, tema ${scheme}`, async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width, height });
      await seedPreferences(page, { theme: scheme });
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of [...ROUTE_PATHS, '/nada-aqui']) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        const violations = await runAxe(page);
        expect(violations, `${path}: ${JSON.stringify(violations)}`).toEqual([]);
      }
    });
  }
}

/* ------------------------------------------------------------------ gráficos */

interface Money {
  amount: string;
  currency: string;
}
interface ChartSeries {
  id: string;
  label: string;
  tone: 'primary' | 'secondary';
  values: Money[];
}
const brl = (amount: string): Money => ({ amount, currency: 'BRL' });
const keysOf = (n: number, label = (i: number) => `Dia ${i + 1}`) =>
  Array.from({ length: n }, (_, i) => ({ id: `k${i}`, label: label(i) }));
const series = (id: string, tone: 'primary' | 'secondary', values: string[]): ChartSeries => ({
  id,
  label: id,
  tone,
  values: values.map(brl),
});

/**
 * O gráfico só recebe dados por entradas de sinal; a página do UI Kit tem cenários fixos. Para exercitar
 * valores extremos sem tocar no código do app, o teste troca as entradas pelo depurador do Angular
 * (`window.ng`, só existe no build de desenvolvimento = projeto `mock`).
 */
async function feedChart(
  page: Page,
  data: { series: ChartSeries[]; keys: { id: string; label: string }[]; label?: string },
): Promise<void> {
  await page.evaluate((payload) => {
    const ng = (
      window as unknown as {
        ng: {
          getComponent: (el: Element) => Record<string, unknown>;
          applyChanges: (c: unknown) => void;
        };
      }
    ).ng;
    const host = document.querySelector('#qa-chart')!;
    const instance = ng.getComponent(host);
    const apply = (name: string, value: unknown) => {
      const sig = instance[name] as Record<symbol, unknown>;
      const sym = Object.getOwnPropertySymbols(sig).find((s) => String(s).includes('SIGNAL'))!;
      const node = sig[sym] as { applyValueToInputSignal: (n: unknown, v: unknown) => void };
      node.applyValueToInputSignal(node, value);
    };
    apply('series', payload.series);
    apply('keys', payload.keys);
    apply('label', payload.label ?? 'Gráfico de teste');
    ng.applyChanges(host);
  }, data);
}

test.describe('gráficos: valores extremos (UI Kit, mock)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mock',
      'depende de `window.ng` (build de desenvolvimento) e do UI Kit',
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    await page.evaluate(() => {
      document
        .querySelector('app-line-chart:has([data-cy="light-line-negative-plot"])')!
        .setAttribute('id', 'qa-chart');
    });
  });

  const paths = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('#qa-chart path')].map((p) => p.getAttribute('d') ?? ''),
    );

  test('zero, série vazia e sem chaves: estado vazio honesto, sem linha reta fingindo dado', async ({
    page,
  }) => {
    await feedChart(page, { series: [series('a', 'primary', ['0', '0', '0'])], keys: keysOf(3) });
    await expect(page.locator('#qa-chart [data-cy$="-empty"]')).toBeVisible();
    await feedChart(page, { series: [], keys: keysOf(3) });
    await expect(page.locator('#qa-chart [data-cy$="-empty"]')).toBeVisible();
    await feedChart(page, { series: [series('a', 'primary', ['5'])], keys: [] });
    await expect(page.locator('#qa-chart [data-cy$="-empty"]')).toBeVisible();
  });

  test('um ponto, todos iguais, só negativos, mistos, minúsculos e enormes: caminhos válidos e tabela completa', async ({
    page,
  }) => {
    const cases: [string, ChartSeries[], number][] = [
      ['um ponto', [series('a', 'primary', ['500.00'])], 1],
      ['um ponto negativo', [series('a', 'primary', ['-500.00'])], 1],
      ['todos iguais', [series('a', 'primary', ['100', '100', '100', '100'])], 4],
      ['só negativos', [series('a', 'secondary', ['-10', '-80', '-30', '-5'])], 4],
      [
        'mistos',
        [
          series('a', 'primary', ['300', '-200', '150', '-400', '50']),
          series('b', 'secondary', ['-100', '100', '-50', '20', '0']),
        ],
        5,
      ],
      ['minúsculos', [series('a', 'primary', ['0.01', '0.02', '0.01'])], 3],
      [
        'enormes',
        [
          series('a', 'primary', ['99999999999999.99', '1.00', '5000000000000.00']),
          series('b', 'secondary', ['123456789012345.67', '0.00', '1.00']),
        ],
        3,
      ],
      ['inválidos (texto/vazio/infinito)', [series('a', 'primary', ['abc', '', '1e400', '5'])], 4],
    ];
    for (const [name, data, n] of cases) {
      await feedChart(page, { series: data, keys: keysOf(n) });
      const d = await paths(page);
      expect(
        d.filter((p) => /NaN|Infinity|undefined/.test(p)),
        name,
      ).toEqual([]);
      await expect(page.locator('#qa-chart tbody tr'), name).toHaveCount(n);
      await expectNoHorizontalScroll(page);
    }
  });

  test('o eixo mostra o texto do backend do maior valor, sem arredondar nem recalcular', async ({
    page,
  }) => {
    await feedChart(page, {
      series: [series('a', 'primary', ['1234.50', '99.99', '7.00'])],
      keys: keysOf(3),
    });
    await expect(page.locator('#qa-chart [data-cy$="-y-max"]')).toHaveText('R$ 1.234,50');
    await expect(page.locator('#qa-chart [data-cy$="-y-zero"]')).toHaveText('0');
  });

  test('400 e 1000 pontos: no máximo 400 linhas na tabela e o desenho entra em tempo razoável', async ({
    page,
  }) => {
    for (const total of [400, 1000]) {
      const values = Array.from({ length: total }, (_, i) => String(100 + (i % 50)));
      const started = Date.now();
      await feedChart(page, { series: [series('a', 'primary', values)], keys: keysOf(total) });
      await expect(page.locator('#qa-chart tbody tr')).toHaveCount(400);
      expect(Date.now() - started, `${total} pontos`).toBeLessThan(8000);
    }
  });

  test('teclado e foco: setas anunciam na região viva, Esc e saída do foco escondem o tooltip', async ({
    page,
  }) => {
    await feedChart(page, {
      series: [series('a', 'primary', ['10', '20', '30'])],
      keys: keysOf(3),
    });
    const plot = page.locator('#qa-chart [data-cy$="-plot"]');
    const tip = page.locator('#qa-chart [data-cy$="-tooltip"]');
    await plot.focus();
    await expect(tip).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(tip).toBeVisible();
    await expect(page.locator('[aria-live="polite"]').last()).toContainText('Dia 1');
    await page.keyboard.press('End');
    await expect(page.locator('[aria-live="polite"]').last()).toContainText('Dia 3');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await expect(tip).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(tip).toHaveCount(0);
  });

  test('redimensionar com o tooltip aberto mantém o ponto e não gera rolagem horizontal', async ({
    page,
  }) => {
    await feedChart(page, {
      series: [series('a', 'primary', ['10', '20', '30', '40'])],
      keys: keysOf(4),
    });
    await page.locator('#qa-chart [data-cy$="-plot"]').focus();
    await page.keyboard.press('ArrowRight');
    for (const width of [900, 600, 375, 320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('#qa-chart [data-cy$="-tooltip"]')).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('movimento reduzido: o traço já nasce revelado, sem estado pendente nem transição', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await waitForApp(page);
    const info = await page.evaluate(() => {
      const svg = document.querySelector('[data-cy="light-line-chart-plot"] svg')!;
      const cs = getComputedStyle(svg);
      return { pending: svg.classList.contains('is-pending'), transition: cs.transitionDuration };
    });
    expect(info.pending).toBe(false);
    // O Chromium converte `0ms` em 0,00001s (reset de movimento reduzido): na prática, sem transição.
    expect(Number.parseFloat(info.transition)).toBeLessThan(0.001);
  });

  test('BUG-QA-11 · só negativos e mistos: o menor valor é rotulado (texto do backend)', async ({
    page,
  }) => {
    await feedChart(page, {
      series: [series('a', 'secondary', ['-10', '-80.50', '-30', '-5'])],
      keys: keysOf(4),
    });
    await expect(page.locator('#qa-chart [data-cy$="-y-min"]')).toHaveText('−R$ 80,50');
    await expect(page.locator('#qa-chart [data-cy$="-y-zero"]')).toHaveText('0');
    await feedChart(page, {
      series: [series('a', 'primary', ['300', '-200.25', '150', '-400.75', '50'])],
      keys: keysOf(5),
    });
    await expect(page.locator('#qa-chart [data-cy$="-y-max"]')).toHaveText('R$ 300,00');
    await expect(page.locator('#qa-chart [data-cy$="-y-min"]')).toHaveText('−R$ 400,75');
  });

  test('BUG-QA-11 · o rótulo de um valor máximo muito largo fica acima da curva, sem cobri-la', async ({
    page,
  }) => {
    await feedChart(page, {
      series: [
        series('a', 'primary', ['123456789012345.67', '1.00', '5.00']),
        series('b', 'secondary', ['99999999999999.99', '0.00', '1.00']),
      ],
      keys: keysOf(3),
    });
    const { label, curveTop } = await page.evaluate(() => {
      const label = document
        .querySelector('#qa-chart [data-cy$="-y-max"]')!
        .getBoundingClientRect();
      const tops = [...document.querySelectorAll('#qa-chart path.lc__line')].map(
        (p) => p.getBoundingClientRect().top,
      );
      return { label: { bottom: label.bottom, right: label.right }, curveTop: Math.min(...tops) };
    });
    expect(label.bottom, 'o rótulo termina antes de a curva começar').toBeLessThanOrEqual(curveTop);
  });

  test('um ponto só: o gráfico é baixo (menos de 8 rem), não gasta a altura de uma série', async ({
    page,
  }) => {
    await feedChart(page, { series: [series('a', 'primary', ['500.00'])], keys: keysOf(1) });
    const height = await page
      .locator('#qa-chart .lc__plot')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(128);
    await expect(page.locator('#qa-chart .lc__dot')).toHaveCount(1);
  });

  test('BUG-QA-05 · o tooltip cabe na viewport de 320 px (reflow WCAG 1.4.10)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const plot = page.locator('[data-cy="light-line-chart-plot"]');
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    const rect = (await page.locator('[data-cy="light-line-chart-tooltip"]').boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  });

  test('BUG-QA-08 · rótulos longos do eixo X não se sobrepõem', async ({ page }) => {
    await feedChart(page, {
      series: [series('a', 'primary', ['10', '20', '30', '40', '50'])],
      keys: keysOf(5, (i) => `Competência de referência número ${i + 1}`),
    });
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('#qa-chart .lc__tick')]
        .map((el) => el.getBoundingClientRect())
        .map((r) => [r.left, r.right]),
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]![0]!, `marca ${i} começa depois do fim da anterior`).toBeGreaterThanOrEqual(
        boxes[i - 1]![1]!,
      );
    }
  });
});

/* ------------------------------------------------- alvos de toque, contraste e hierarquia */

test.describe('A4 / BUG-QA-12 · alvos de toque e hover sem perder contraste', () => {
  test.describe('ponteiro grosso (tablet com toque, 820 px)', () => {
    test.use({ hasTouch: true, viewport: { width: 820, height: 1180 } });

    test('os itens da sidebar e a marca têm 44 px ou mais de altura', async ({ page }) => {
      await open(page, '/');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const heights = await page
        .locator('[data-cy="sidebar"] a')
        .evaluateAll((els) =>
          els.map((el) => [el.getAttribute('data-cy'), el.getBoundingClientRect().height]),
        );
      expect(heights.length).toBeGreaterThan(10);
      for (const [key, height] of heights) {
        expect(height as number, String(key)).toBeGreaterThanOrEqual(43.5);
      }
    });
  });

  test('"Ver como tabela" tem 44 px de altura em 375 px (UI Kit, mock)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mock',
      'os gráficos só aparecem no UI Kit (build de desenvolvimento)',
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const toggle = page.locator('[data-cy="light-line-chart-table-toggle"]');
    await toggle.scrollIntoViewIfNeeded();
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`o hover de .button--soft mantém o texto a 4,5:1 e a opacidade em 1 (${scheme})`, async ({
      page,
    }) => {
      await seedPreferences(page, { theme: scheme });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, '/cards');
      const soft = page.locator('[data-cy="header-action-income"]');
      await soft.hover();
      await page.waitForTimeout(400);
      const state = await soft.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, background: cs.backgroundColor, opacity: cs.opacity };
      });
      expect(state.opacity).toBe('1');
      expect(contrastRatio(state.color, state.background)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe('BUG-QA-09 · borda de campos e controles com 3:1 (WCAG 1.4.11)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`campo de texto e botão neutro: a borda tem 3:1 sobre o fundo (${scheme})`, async ({
      page,
    }) => {
      await seedPreferences(page, { theme: scheme });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, '/accounts/new');
      const surface = await page.evaluate(
        () => getComputedStyle(document.querySelector('[data-cy="shell-window"]')!).backgroundColor,
      );
      for (const selector of ['input.input', '[data-cy="header-action-transfer"]']) {
        const border = await page
          .locator(selector)
          .first()
          .evaluate((el) => getComputedStyle(el).borderTopColor);
        expect(contrastRatio(border, surface), selector).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test('o cartão (decorativo) continua com borda fina e sutil: o token de cartão não mudou', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/accounts');
    const tokens = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return {
        border: css.getPropertyValue('--color-border').trim(),
        control: css.getPropertyValue('--color-control-border').trim(),
      };
    });
    expect(tokens.border).toBe('#e7e4df');
    expect(tokens.control).not.toBe(tokens.border);
  });
});

test.describe('BUG-QA-06a · foco em forced-colors também nos campos', () => {
  test('um campo de texto focado ganha outline de sistema (o anel é box-shadow)', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/accounts/new');
    await page.locator('input.input').first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page
      .locator('input.input')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: Number.parseFloat(cs.outlineWidth) };
      });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });
});

test.describe('M6 · cabeçalho do Início e espaço do logo', () => {
  test('a saudação é um texto de apoio menor que o título da página', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/');
    const sizes = await page.evaluate(() => ({
      hello: Number.parseFloat(
        getComputedStyle(document.querySelector('[data-cy="workspace-greeting"]')!).fontSize,
      ),
      title: Number.parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
    }));
    expect(sizes.hello).toBeLessThan(sizes.title);
  });

  test('o espaço do logo continua vazio e o nome da marca alinha com os ícones da sidebar (sem recuo)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/');
    const slot = page.locator('.sidebar__logo-slot');
    await expect(slot).toHaveCount(1);
    expect(await slot.evaluate((el) => el.childNodes.length)).toBe(0);
    const offsets = await page.evaluate(() => {
      const left = (el: Element | null) => el!.getBoundingClientRect().left;
      return {
        brand: left(document.querySelector('.sidebar__brand-name')),
        icon: left(document.querySelector('[data-cy="sidebar-home"] app-icon')),
      };
    });
    expect(Math.abs(offsets.brand - offsets.icon)).toBeLessThanOrEqual(1);
  });
});

test.describe('gráficos: tooltip no toque (mock)', () => {
  test.use({ hasTouch: true });

  test('M4 · tocar no gráfico abre o tooltip e tocar fora o fecha', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mock', 'depende do UI Kit (build de desenvolvimento)');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dev/ui-kit');
    await waitForApp(page);
    const plot = page.locator('[data-cy="light-line-chart-plot"]');
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-cy="light-line-chart-tooltip"]')).toBeVisible();
    await page.touchscreen.tap(box.x + box.width / 2, Math.max(2, box.y - 40));
    await expect(page.locator('[data-cy="light-line-chart-tooltip"]')).toHaveCount(0);
  });
});
