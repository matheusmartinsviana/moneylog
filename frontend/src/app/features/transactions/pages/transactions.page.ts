import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { EntriesTableComponent } from '~/app/features/transactions/components/entries-table/entries-table.component';
import {
  FilterOption,
  FiltersBarComponent,
} from '~/app/features/transactions/components/filters-bar/filters-bar.component';
import { RecordsTableComponent } from '~/app/features/transactions/components/records-table/records-table.component';
import { TotalsRowComponent } from '~/app/features/transactions/components/totals-row/totals-row.component';
import { ViewSwitchComponent } from '~/app/features/transactions/components/view-switch/view-switch.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import { TransactionsListFacade } from '~/modules/transactions/core/facades/transactions-list.facade';
import {
  filtersFromQuery,
  filtersToQuery,
  ListFilters,
  ListView,
} from '~/modules/transactions/core/types/list-filters';
import { todayIso } from '~/util/date';

/**
 * Movimentações (smart): duas visões (Registros e Por competência), filtros espelhados na URL,
 * totais **do backend** e "carregar mais". Fala só com facades de negócio (FE 01); nada é somado.
 */
@Component({
  selector: 'app-transactions-page',
  imports: [
    RouterLink,
    RouterOutlet,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ViewSwitchComponent,
    FiltersBarComponent,
    RecordsTableComponent,
    EntriesTableComponent,
    TotalsRowComponent,
  ],
  providers: [TransactionsListFacade, AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.has-detail]': 'detailOpen()' },
  templateUrl: './transactions.page.html',
  styleUrl: './transactions.page.css',
})
export class TransactionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accountsFacade = inject(AccountsListFacade);
  private readonly categoriesFacade = inject(CategoriesFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly list = inject(TransactionsListFacade);

  /** Há um detalhe aberto (rota filha `:id`): painel no desktop, página no celular. */
  protected readonly detailOpen = signal(false);
  protected readonly accountOptions = signal<readonly FilterOption[]>([]);
  protected readonly categoryOptions = signal<readonly FilterOption[]>([]);
  protected readonly filters = this.list.filters;
  protected readonly accountScoped = computed(() => this.filters().accountId !== null);
  protected readonly voidedOnly = computed(
    () => this.filters().view === 'records' && this.filters().status === 'VOIDED',
  );

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => {
    const copy = this.t().emptyState.transactions;
    return [
      {
        id: 'add-transaction',
        label: copy.addTransaction,
        available: true,
        primary: true,
        link: '/quick-add',
      },
      { id: 'import-statement', label: copy.importStatement, available: false },
    ];
  });

  constructor() {
    // URL → filtros (primeira carga, F5, voltar/avançar).
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.list.apply(filtersFromQuery((key) => params.get(key), todayIso()));
    });
    // Filtros → URL (só o que difere do padrão; a busca com debounce também passa por aqui).
    effect(() => {
      const query = filtersToQuery(this.filters(), todayIso());
      untracked(() => {
        const current = this.route.snapshot.queryParamMap;
        const same =
          current.keys.length === Object.keys(query).length &&
          Object.entries(query).every(([key, value]) => current.get(key) === value);
        if (!same)
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: query,
            replaceUrl: true,
          });
      });
    });

    // Opções dos filtros (contas e categorias, inclusive arquivadas: o histórico as usa).
    forkJoin({
      accounts: this.accountsFacade.loadAll(),
      expense: this.categoriesFacade.list('EXPENSE', true),
      income: this.categoriesFacade.list('INCOME', true),
    })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (!result) return;
        this.accountOptions.set(result.accounts.map((a) => ({ id: a.id, name: a.name })));
        this.categoryOptions.set(
          [...result.expense, ...result.income].map((c) => ({ id: c.id, name: c.name })),
        );
      });
  }

  protected setView(view: ListView): void {
    this.list.patch({ view });
  }

  protected patch(changes: Partial<ListFilters>): void {
    this.list.patch(changes);
  }

  /** A linha de consumo de uma dívida leva à dívida (ela não tem movimentação). */
  protected openDebt(id: string): void {
    void this.router.navigate(['/debts', id]);
  }

  protected openTransaction(id: string): void {
    void this.router.navigate(['/transactions', id], { queryParamsHandling: 'preserve' });
  }
}
