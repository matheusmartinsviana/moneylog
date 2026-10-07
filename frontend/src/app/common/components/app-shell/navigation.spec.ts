import {
  BOTTOM_NAV_ITEMS,
  MORE_GROUPS,
  MORE_ITEMS,
  SIDEBAR_GROUPS,
  SIDEBAR_ITEMS,
} from '~/app/common/components/app-shell/navigation';
import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';

describe('Navegação em grupos (DS 02, T193)', () => {
  it('Dado a sidebar, então tem OVERVIEW, WORKSPACE e SYSTEM, nessa ordem e com estes itens', () => {
    expect(SIDEBAR_GROUPS.map((group) => [group.key, group.items.map((item) => item.key)])).toEqual(
      [
        ['overview', ['home', 'transactions', 'accounts', 'cards', 'goals', 'budgets', 'planning']],
        ['workspace', ['vault', 'notes', 'people', 'insights', 'ai', 'mcp']],
        ['system', ['import', 'notifications', 'settings']],
      ],
    );
  });

  it('Dado a lista plana, então é a dos grupos e nenhuma tela do MVP some', () => {
    expect(SIDEBAR_ITEMS.map((item) => item.key)).toEqual(
      SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
    );
    expect(new Set(SIDEBAR_ITEMS.map((item) => item.path))).toEqual(
      new Set([
        '/',
        '/transactions',
        '/accounts',
        '/cards',
        '/goals',
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
      ]),
    );
  });

  it('Dado as páginas honestas da fatia F, então vault, ai, mcp e budgets estão na navegação', () => {
    const keys = SIDEBAR_ITEMS.map((item) => item.key) as string[];
    for (const key of ['vault', 'ai', 'mcp', 'budgets']) expect(keys).toContain(key);
  });

  it('Dado /more, então lista os itens fora da barra inferior sob os mesmos grupos, sem grupo vazio', () => {
    expect(MORE_GROUPS.map((group) => [group.key, group.items.map((item) => item.key)])).toEqual([
      ['overview', ['accounts', 'cards', 'budgets', 'planning']],
      ['workspace', ['vault', 'notes', 'people', 'insights', 'ai', 'mcp']],
      ['system', ['import', 'notifications', 'settings']],
    ]);
    expect(MORE_GROUPS.flatMap((group) => group.items)).toEqual([...MORE_ITEMS]);
    for (const bottom of BOTTOM_NAV_ITEMS) expect(MORE_ITEMS).not.toContain(bottom);
  });

  it.each([
    ['pt', pt, ['Visão geral', 'Espaço de trabalho', 'Sistema']],
    ['en', en, ['Overview', 'Workspace', 'System']],
    ['es', es, ['Resumen', 'Espacio de trabajo', 'Sistema']],
  ] as const)('Dado o idioma %s, então os títulos dos grupos existem', (_, dict, titles) => {
    expect(SIDEBAR_GROUPS.map((group) => dict.nav.groups[group.key])).toEqual(titles);
  });

  it('Dado o rótulo de planejamento, então segue "Planejamento" (decisão do dono, não "Relatórios")', () => {
    expect(pt.nav.planning).toBe('Planejamento');
  });
});
