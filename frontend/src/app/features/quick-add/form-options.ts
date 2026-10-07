import { forkJoin, map, Observable, of } from 'rxjs';

import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import type { Card } from '~/modules/cards/core/types/card';
import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import type { Category } from '~/modules/categories/core/types/category';

/**
 * O que os formulários de movimentação deixam escolher: contas ativas, cartões ativos e categorias
 * ativas por tipo.
 */
export interface FormOptions {
  readonly accounts: readonly Account[];
  readonly cards: readonly Card[];
  readonly expenseCategories: readonly Category[];
  readonly incomeCategories: readonly Category[];
}

/**
 * Carrega as opções dos formulários (quick-add e edição): todas as contas ativas, paginando até o fim
 * (`loadAll`, S-91), as categorias ativas de despesa e receita (cache da sessão) e, quando a tela pede
 * (`cards`), todos os cartões ativos (S-126). A edição não precisa dos cartões.
 */
export function loadFormOptions(
  accounts: AccountsListFacade,
  categories: CategoriesFacade,
  cards?: CardsListFacade,
): Observable<FormOptions> {
  return forkJoin({
    accounts: accounts.loadAll('ACTIVE'),
    cards: cards ? cards.loadAll('ACTIVE') : of<readonly Card[]>([]),
    expense: categories.list('EXPENSE'),
    income: categories.list('INCOME'),
  }).pipe(
    map(({ accounts, cards, expense, income }) => ({
      accounts,
      cards,
      expenseCategories: expense,
      incomeCategories: income,
    })),
  );
}
