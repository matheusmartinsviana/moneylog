import { IsActiveMatchOptions } from '@angular/router';

import type { IconName } from '~/app/common/components/icon/icons';
import type { AppI18n } from '~/app/common/i18n/i18n';

export type NavKey = Exclude<keyof AppI18n['nav'], 'groups'>;

export interface NavItem {
  readonly key: NavKey;
  readonly path: string;
  readonly icon: IconName;
  readonly activeOptions: IsActiveMatchOptions | { exact: boolean };
}

const PREFIX = { exact: false } as const;

const ITEMS = {
  home: { key: 'home', path: '/', icon: 'home', activeOptions: { exact: true } },
  transactions: {
    key: 'transactions',
    path: '/transactions',
    icon: 'transactions',
    activeOptions: PREFIX,
  },
  quickAdd: { key: 'quickAdd', path: '/quick-add', icon: 'plus', activeOptions: PREFIX },
  goals: { key: 'goals', path: '/goals', icon: 'goals', activeOptions: PREFIX },
  more: { key: 'more', path: '/more', icon: 'more', activeOptions: PREFIX },
  cards: { key: 'cards', path: '/cards', icon: 'cards', activeOptions: PREFIX },
  accounts: { key: 'accounts', path: '/accounts', icon: 'accounts', activeOptions: PREFIX },
  planning: { key: 'planning', path: '/planning', icon: 'planning', activeOptions: PREFIX },
  people: { key: 'people', path: '/people', icon: 'people', activeOptions: PREFIX },
  notes: { key: 'notes', path: '/notes', icon: 'notes', activeOptions: PREFIX },
  import: { key: 'import', path: '/import', icon: 'import', activeOptions: PREFIX },
  notifications: {
    key: 'notifications',
    path: '/notifications',
    icon: 'bell',
    activeOptions: PREFIX,
  },
  insights: { key: 'insights', path: '/insights', icon: 'insights', activeOptions: PREFIX },
  budgets: { key: 'budgets', path: '/budgets', icon: 'budgets', activeOptions: PREFIX },
  vault: { key: 'vault', path: '/vault', icon: 'folder', activeOptions: PREFIX },
  ai: { key: 'ai', path: '/ai', icon: 'sparkle', activeOptions: PREFIX },
  mcp: { key: 'mcp', path: '/mcp', icon: 'link', activeOptions: PREFIX },
  settings: { key: 'settings', path: '/settings', icon: 'settings', activeOptions: PREFIX },
} as const satisfies Record<NavKey, NavItem>;

/** Barra inferior do mobile (arquitetura §5.3): Início · Movimentações · + · Metas · Mais. */
export const BOTTOM_NAV_ITEMS: readonly NavItem[] = [
  ITEMS.home,
  ITEMS.transactions,
  ITEMS.quickAdd,
  ITEMS.goals,
  ITEMS.more,
];

export type NavGroupKey = keyof AppI18n['nav']['groups'];

export interface NavGroup {
  readonly key: NavGroupKey;
  readonly items: readonly NavItem[];
}

/**
 * Sidebar em grupos (DS 02): OVERVIEW, WORKSPACE e SYSTEM. Nenhuma tela some: Cartões e Metas ficam em
 * OVERVIEW, Notas e Pessoas em WORKSPACE (`/debts` segue alcançada por `/people`), Importar extrato e
 * Configurações em SYSTEM. O rótulo "Planejamento" é mantido (decisão do dono). `budgets` (T208) é a página "em breve" do
 * orçamento; `vault`, `ai` e `mcp` (fatia F) são páginas honestas (nada finge funcionar).
 */
export const SIDEBAR_GROUPS: readonly NavGroup[] = [
  {
    key: 'overview',
    items: [
      ITEMS.home,
      ITEMS.transactions,
      ITEMS.accounts,
      ITEMS.cards,
      ITEMS.goals,
      ITEMS.budgets,
      ITEMS.planning,
    ],
  },
  {
    key: 'workspace',
    items: [ITEMS.vault, ITEMS.notes, ITEMS.people, ITEMS.insights, ITEMS.ai, ITEMS.mcp],
  },
  { key: 'system', items: [ITEMS.import, ITEMS.notifications, ITEMS.settings] },
];

/** Lista plana da sidebar, na ordem dos grupos. */
export const SIDEBAR_ITEMS: readonly NavItem[] = SIDEBAR_GROUPS.flatMap((group) => group.items);

/** Seções que não cabem na barra inferior e ficam em /more no mobile. */
export const MORE_ITEMS: readonly NavItem[] = SIDEBAR_ITEMS.filter(
  (item) => !BOTTOM_NAV_ITEMS.some((bottom) => bottom.key === item.key),
);

/** `/more` sob os mesmos três títulos de grupo (grupos que ficariam vazios não aparecem). */
export const MORE_GROUPS: readonly NavGroup[] = SIDEBAR_GROUPS.map((group) => ({
  key: group.key,
  items: group.items.filter((item) => MORE_ITEMS.includes(item)),
})).filter((group) => group.items.length > 0);

export const QUICK_ADD_ITEM: NavItem = ITEMS.quickAdd;
