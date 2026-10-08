import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { Router, TitleStrategy } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { App } from '~/app/app';
import { routes } from '~/app/app.routes';
import {
  BOTTOM_NAV_ITEMS,
  MORE_ITEMS,
  NavKey,
  SIDEBAR_ITEMS,
} from '~/app/common/components/app-shell/navigation';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { pt } from '~/app/common/i18n/translations/pt';
import { I18nTitleStrategy } from '~/app/common/services/i18n-title.strategy';
import { provideAuthenticatedSession } from '~/testing/auth-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideDashboardMock } from '~/testing/dashboard-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideBusinessModules } from '~/testing/modules-testing';

/**
 * Monta o app real (rotas lazy + shell) na URL pedida.
 * O jsdom não avalia media queries: a sidebar (só ≥ 768px) fica oculta e a barra inferior visível,
 * então as consultas à sidebar usam `hidden: true`. O layout por largura é validado no navegador (T20).
 */
async function navigate(url: string, language: 'pt' | 'en' | 'es' = 'pt') {
  const result = await render(App, {
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
    routes,
    initialRoute: url,
    providers: [
      provideI18nTesting(language),
      { provide: TitleStrategy, useExisting: I18nTitleStrategy },
      // Início usa o dashboard: mesma ligação do bootstrap, em modo mock (resumo vazio).
      provideDashboardMock(),
      provideBusinessModules(),
      // As rotas ficam atrás do authGuard: a sessão já vem restaurada.
      provideAuthenticatedSession(),
    ],
  });
  // A busca, o avatar e o "Mais" carregam em blocos @defer: espera chegarem.
  await screen.findByTestId('header-profile');
  await screen.findByTestId('sidebar-more');
  return result;
}

/** A sidebar fica oculta no jsdom (sem media queries); localiza pelo data-cy e confere o rótulo. */
function sidebarNav(): HTMLElement {
  const nav = screen.getByTestId('sidebar').querySelector('nav');
  expect(nav).toHaveAttribute('aria-label', pt.shell.primaryNavigation);
  return nav as HTMLElement;
}

const SECTION_KEYS = [
  'home',
  'transactions',
  'quickAdd',
  'goals',
  'cards',
  'accounts',
  'planning',
  'people',
  'notes',
  'import',
  'insights',
  'settings',
  'budgets',
] as const satisfies readonly NavKey[];

const PATHS: Record<(typeof SECTION_KEYS)[number], string> = {
  home: '/',
  transactions: '/transactions',
  quickAdd: '/quick-add',
  goals: '/goals',
  cards: '/cards',
  accounts: '/accounts',
  planning: '/planning',
  people: '/people',
  notes: '/notes',
  import: '/import',
  insights: '/insights',
  settings: '/settings',
  budgets: '/budgets',
};

/** Seções que já têm tela real (estado vazio com ação habilitada); as demais seguem como placeholder. */
const IMPLEMENTED = new Set<NavKey>([
  'home',
  'accounts',
  'cards',
  'transactions',
  'quickAdd',
  'people',
  'planning',
  'goals',
  'notes',
  // Importar extrato (Etapa 7): tela real (testada em features/import).
  'import',
  // Insights (Etapa 8): tela real (testada em features/insights).
  'insights',
  // Orçamentos (T208): página própria "em breve", sem ação (testada em budgets.page.spec).
  'budgets',
]);

describe('App shell e rotas', () => {
  it('Dado a barra inferior, então tem exatamente Início · Movimentações · + · Metas · Mais, nessa ordem', async () => {
    await navigate('/');

    const nav = screen.getByRole('navigation', { name: pt.shell.bottomNavigation });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Início',
      'Movimentações',
      'Novo registro',
      'Metas',
      'Mais',
    ]);
    expect(links[2]).toHaveAttribute('href', '/quick-add');
    expect(links.every((link) => link.hasAttribute('data-cy'))).toBe(true);
    expect(BOTTOM_NAV_ITEMS.map((item) => item.key)).toEqual([
      'home',
      'transactions',
      'quickAdd',
      'goals',
      'more',
    ]);
  });

  it('Dado o "+" da barra inferior, quando clico, então navega para /quick-add sem recarregar', async () => {
    const { fixture } = await navigate('/');

    await userEvent.click(screen.getByTestId('bottom-nav-quickAdd'));
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/(modal:quick-add)');
    expect(screen.getByRole('dialog', { name: pt.quickAdd.modes.titles.expense })).toBeVisible();
  });

  it.each([
    ['pt', 'Novo registro'],
    ['en', 'New entry'],
    ['es', 'Nuevo registro'],
  ] as const)(
    'Dado o idioma %s, então o botão da sidebar, o "+" e o título de /quick-add têm um nome só: "%s" (S-57)',
    async (language, name) => {
      const { fixture } = await navigate('/', language);

      const sidebarButton = screen.getByTestId('sidebar-quickAdd');
      expect(sidebarButton).toHaveTextContent(name);
      expect(sidebarButton).toHaveAttribute('href', '/quick-add');
      const plus = screen.getByTestId('bottom-nav-quickAdd');
      expect(plus).toHaveAccessibleName(name);

      await userEvent.click(plus);
      await fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/(modal:quick-add)');
      expect(screen.getByRole('dialog')).toBeVisible();
    },
  );

  it('Dado o item de Movimentações da barra inferior, então o nome acessível contém o texto visível (WCAG 2.5.3)', async () => {
    await navigate('/');

    const link = screen.getByTestId('bottom-nav-transactions');
    const visible = link.querySelector('.bottom-nav__label')?.textContent?.trim();
    expect(visible).toBe(pt.nav.transactions);
    expect(link).toHaveAccessibleName(expect.stringContaining(visible!));
  });

  it('Dado a sidebar, então lista só o essencial, "Mais" e o rodapé (Configurações e Sair), sem Dream Board', async () => {
    await navigate('/');

    const nav = sidebarNav();
    expect(Array.from(nav.querySelectorAll('li a'), (link) => link.textContent?.trim())).toEqual([
      'Início',
      'Movimentações',
      'Contas',
      'Cartões',
      'Metas',
      'Planejamento',
      'Pessoas',
      'Notas',
    ]);
    expect(within(nav).getByTestId('sidebar-more')).toHaveAccessibleName('Mais');
    const footer = nav.querySelector('.sidebar__footer')!;
    expect(footer.querySelector('[data-cy="sidebar-settings"]')).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(footer.querySelector('[data-cy="sidebar-signOut"]')).toBeInTheDocument();
    // Nenhuma rota some: o que saiu do trilho está em "Mais" (`/more`) e em Configurações.
    expect(SIDEBAR_ITEMS).toHaveLength(16);
    expect(screen.queryByText(/dream board/i)).not.toBeInTheDocument();
  });

  it('Dado a sidebar, então a ordem do Tab é marca, Novo registro, seções, Mais, Configurações e Sair', async () => {
    await navigate('/');

    const nav = sidebarNav();
    const order = Array.from(nav.querySelectorAll('a, button'), (el) => el.getAttribute('data-cy'));
    expect(order).toEqual([
      'sidebar-brand',
      'sidebar-quickAdd',
      'sidebar-home',
      'sidebar-transactions',
      'sidebar-accounts',
      'sidebar-cards',
      'sidebar-goals',
      'sidebar-planning',
      'sidebar-people',
      'sidebar-notes',
      'sidebar-more',
      'sidebar-settings',
      'sidebar-signOut',
    ]);
  });

  it('Dado "Mais" na sidebar, então abre um popover com os atalhos secundários e leva à rota escolhida', async () => {
    await navigate('/');

    const more = within(sidebarNav()).getByTestId('sidebar-more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);

    const menu = await screen.findByRole('menu', { name: 'Mais' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Orçamentos', 'Vault', 'Insights', 'IA', 'MCP', 'Importar extrato', 'Notificações']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Vault' }));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/vault'));
  });

  it('Dado o shell, então o cabeçalho do workspace e a janela existem e a página mantém um h1 e um main (T192, T194)', async () => {
    await navigate('/');

    expect(screen.getByTestId('shell-window')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-header')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-greeting')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('Dado a sidebar, então a marca e o "Novo registro" ficam dentro do landmark de navegação', async () => {
    await navigate('/');

    const nav = sidebarNav();
    expect(screen.getAllByRole('navigation', { hidden: true })).toHaveLength(2);
    expect(nav).toContainElement(screen.getByTestId('sidebar-brand'));
    expect(nav).toContainElement(screen.getByTestId('sidebar-quickAdd'));
  });

  it('Dado a rota ativa, então o item é destacado com aria-current="page" só nele', async () => {
    await navigate('/cards');

    const sidebar = sidebarNav();
    expect(screen.getByTestId('sidebar-cards')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('sidebar-home')).not.toHaveAttribute('aria-current');
    expect(sidebar.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.getByTestId('sidebar-cards')).toHaveClass('is-active');
  });

  it('Dado a rota de Metas no mobile, então o item da barra inferior fica com aria-current="page"', async () => {
    await navigate('/goals');

    const bottom = screen.getByRole('navigation', { name: pt.shell.bottomNavigation });
    expect(within(bottom).getByRole('link', { name: 'Metas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(bottom).getByRole('link', { name: 'Início' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('Dado /more, então lista as seções que não estão na barra inferior', async () => {
    await navigate('/more');

    const list = screen.getByTestId('more-list');
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      // Na ordem dos grupos da sidebar (mudou de propósito, T193).
      'Contas',
      'Cartões',
      'Orçamentos',
      'Planejamento',
      'Vault',
      'Notas',
      'Pessoas',
      'Insights',
      'IA',
      'MCP',
      'Importar extrato',
      'Notificações',
      'Configurações',
    ]);
    expect(MORE_ITEMS.map((item) => item.path)).toEqual([
      '/accounts',
      '/cards',
      '/budgets',
      '/planning',
      '/vault',
      '/notes',
      '/people',
      '/insights',
      '/ai',
      '/mcp',
      '/import',
      '/notifications',
      '/settings',
    ]);
  });

  it.each(
    SECTION_KEYS.filter(
      (key): key is Exclude<(typeof SECTION_KEYS)[number], 'quickAdd'> => !IMPLEMENTED.has(key),
    ),
  )(
    'Dado a rota de %s, então mostra o h1 e o estado vazio da seção com ações indisponíveis',
    async (key) => {
      await navigate(PATHS[key]);

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.nav[key]);
      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState[key].title);
      expect(screen.getByTestId('empty-state-description')).toHaveTextContent(
        pt.emptyState[key].description,
      );
      const actions = screen.getAllByTestId(/^empty-state-action-/);
      expect(actions.length).toBeGreaterThan(0);
      actions.forEach((action) => expect(action).toHaveAttribute('aria-disabled', 'true'));
      expect(screen.getByTestId('empty-state-coming-soon')).toHaveTextContent(
        pt.emptyState.comingSoon,
      );
      expect(document.title).toBe(`${pt.nav[key]} · moneylog`);
    },
  );

  it('Dado a rota de accounts em modo mock, então mostra o h1 e o estado vazio com "Adicionar conta" habilitado', async () => {
    await navigate('/accounts');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.nav.accounts);
    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.accounts.title);
    expect(screen.getByTestId('empty-state-action-add-account')).toHaveAttribute(
      'href',
      '/accounts/new',
    );
    expect(document.title).toBe(`${pt.nav.accounts} · moneylog`);
  });

  it('Dado a rota de cards em modo mock, então mostra o h1 e o estado vazio com "Adicionar cartão" habilitado', async () => {
    await navigate('/cards');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.nav.cards);
    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.cards.title);
    const action = screen.getByTestId('empty-state-action-add-card');
    expect(action).toHaveAttribute('href', '/cards/new');
    expect(action).not.toHaveAttribute('aria-disabled');
    expect(document.title).toBe(`${pt.nav.cards} · moneylog`);
  });

  it('Dado uma rota desconhecida, então mostra "não encontrada" com link para o Início', async () => {
    await navigate('/rota-que-nao-existe');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.notFound.pageTitle);
    expect(screen.getByRole('link', { name: pt.notFound.goHome })).toHaveAttribute('href', '/');
    expect(document.title).toBe(`${pt.notFound.pageTitle} · moneylog`);
  });

  it('Dado as rotas, então toda seção é lazy (loadChildren) dentro do shell', () => {
    // As rotas `dev/*` (UI Kit) só existem nos builds de desenvolvimento/mock (`config/dev-routes`).
    const children = (routes.find((route) => route.component)?.children ?? []).filter(
      // A rota auxiliar `modal` (Novo registro) é lazy e tratada à parte.
      (route) => !route.path?.startsWith('dev/') && !route.outlet,
    );
    expect(children).toHaveLength(20);
    children.forEach((route) => {
      expect(route.loadChildren).toBeTypeOf('function');
      expect(route.component).toBeUndefined();
    });
  });

  it('Dado as rotas, então o login fica fora do shell e o shell fica atrás do authGuard', () => {
    const login = routes.find((route) => route.path === 'login');
    const shell = routes.find((route) => route.component);
    expect(login?.component).toBeUndefined();
    expect(login?.canMatch).toHaveLength(1);
    expect(shell?.canMatch).toHaveLength(1);
  });

  it('Dado a navegação por todas as rotas, então o console fica sem erro nem warning', async () => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    const { navigate: go } = await navigate('/');

    for (const path of [...Object.values(PATHS), '/more', '/nao-existe']) {
      await go(path);
    }

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('Dado o idioma em inglês, então a navegação e o título usam en', async () => {
    await navigate('/cards', 'en');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cards');
    expect(document.title).toBe('Cards · moneylog');
  });

  it('Dado a troca de idioma, então o título do documento acompanha', async () => {
    const { fixture } = await navigate('/cards');

    await TestBed.inject(I18nService).use('es');
    await fixture.whenStable();

    expect(document.title).toBe('Tarjetas · moneylog');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tarjetas');
  });

  it('Dado o link "pular para o conteúdo", quando ativo, então o foco vai para o main', async () => {
    await navigate('/goals');

    await userEvent.click(screen.getByTestId('skip-to-content'));

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('Dado o teclado (mobile), então o "pular", o cabeçalho e os itens da barra inferior são alcançáveis com Tab', async () => {
    // Numa seção sem nada focável no conteúdo (Metas já tem "Nova meta" e as abas; Notas, busca e botões).
    // Mudou de propósito (T194): o cabeçalho do workspace entra na ordem de foco entre o "pular" e a barra
    // inferior. O jsdom não avalia media queries e mostra todas as ações do cabeçalho; no aparelho, fora do
    // Início o mobile só tem o avatar. O que vale: o perfil vem antes da barra e a barra segue na ordem.
    await navigate('/import');

    await userEvent.tab();
    expect(screen.getByTestId('skip-to-content')).toHaveFocus();
    // A busca global (T209) vem antes do perfil; em tela compacta ela é o botão de lupa.
    await userEvent.tab();
    expect(screen.getByTestId('global-search-input')).toHaveFocus();
    // O alternador de tema vem antes do sino de notificações (Etapa 7), que vem antes do perfil.
    await userEvent.tab();
    expect(screen.getByTestId('header-theme-toggle')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('header-bell')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('header-profile')).toHaveFocus();
    for (let i = 0; i < 10 && document.activeElement !== screen.getByTestId('bottom-nav-home'); i++)
      await userEvent.tab();
    for (const key of ['home', 'transactions', 'quickAdd', 'goals', 'more']) {
      expect(screen.getByTestId(`bottom-nav-${key}`)).toHaveFocus();
      await userEvent.tab();
    }
  });

  it('Dado a sidebar, então todo item é link com data-cy e rótulo acessível (inclusive recolhida)', async () => {
    await navigate('/');

    const links = within(screen.getByTestId('sidebar')).getAllByRole('link', { hidden: true });
    links.forEach((link) => {
      expect(link).toHaveAttribute('data-cy');
      expect(link.textContent?.trim()).not.toBe('');
    });
  });

  it('Dado o shell com uma página, então o axe não aponta violações', async () => {
    const { container } = await navigate('/transactions');

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
