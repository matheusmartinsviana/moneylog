import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MenuComponent, MenuItem } from '~/app/common/components/menu/menu.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { TabPanelDirective } from '~/app/common/components/tabs/tab-panel.directive';
import { TabItem, TabsComponent } from '~/app/common/components/tabs/tabs.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { LinkedNotesComponent } from '~/app/features/notes/components/linked-notes/linked-notes.component';
import { DebtRowComponent } from '~/app/features/people/components/debt-row/debt-row.component';
import { balanceText, openDebtsText } from '~/app/features/people/person-balance';
import { PersonDetailFacade } from '~/modules/people/core/facades/person-detail.facade';
import { formatIsoDate } from '~/util/date';
import { type DebtDirection, type DebtSummary, isOpenStatus } from '~/util/debt';

type TabId = 'receivable' | 'payable';
type ActionId = 'newDebt' | 'edit' | 'archive' | 'unarchive';

interface DebtGroup {
  readonly open: readonly DebtSummary[];
  readonly closed: readonly DebtSummary[];
}

/**
 * Detalhe da pessoa (smart, T84): o saldo (frase pelo `direction` e `net` do backend), a próxima cobrança
 * e as dívidas em duas abas, "Me devem" e "Eu devo", cada uma com as em aberto e as encerradas (status em
 * texto). Cada dívida leva ao detalhe. As ações de movimentação (emprestar, receber, nova dívida) levam ao
 * `/quick-add` já com a pessoa. Nenhum valor é calculado aqui.
 */
@Component({
  selector: 'app-person-page',
  imports: [
    DisclosureComponent,
    RouterOutlet,
    LinkedNotesComponent,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    MenuComponent,
    TabsComponent,
    TabPanelDirective,
    DebtRowComponent,
  ],
  providers: [PersonDetailFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person.page.html',
  styleUrl: './person.page.css',
})
export class PersonPage {
  private readonly changes = inject(EntityChanges);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(PersonDetailFacade);

  /** `:id` da rota. */
  readonly id = input.required<string>();
  /** `?tab=` da URL; qualquer valor desconhecido abre "Me devem". */
  readonly tab = input<string>();

  protected readonly person = this.facade.person;
  protected readonly state = this.facade.state;
  protected readonly confirmArchive = signal(false);

  protected readonly activeTab = computed<TabId>(() =>
    this.tab() === 'payable' ? 'payable' : 'receivable',
  );
  protected readonly tabs = computed<readonly TabItem[]>(() => {
    const copy = this.t().people.detail;
    return [
      { id: 'receivable', label: copy.owedToMe },
      { id: 'payable', label: copy.iOwe },
    ];
  });

  protected readonly receivables = computed(() => this.group('RECEIVABLE'));
  protected readonly payables = computed(() => this.group('PAYABLE'));

  protected readonly balance = computed(() => {
    const person = this.person();
    return person ? balanceText(person, this.t().people) : '';
  });
  protected readonly debtsText = computed(() => {
    const person = this.person();
    return person ? openDebtsText(person.openDebts, this.t().people) : '';
  });
  protected readonly nextDue = computed(() => {
    const date = this.person()?.nextDueDate ?? null;
    if (date === null) return this.t().people.noNextDue;
    return interpolate(this.t().people.nextDue, {
      date: formatIsoDate(date, HTML_LANG[this.i18n.language()]),
    });
  });
  protected readonly confirmTitle = computed(() =>
    interpolate(this.t().people.archiveConfirm.title, { name: this.person()?.name ?? '' }),
  );

  protected readonly menuItems = computed<readonly MenuItem[]>(() => {
    const copy = this.t().people.detail;
    const archived = this.person()?.archived ?? false;
    return [
      // Pessoa arquivada não recebe dívida nova (`PERSON_ARCHIVED`): a ação fica indisponível.
      { id: 'newDebt', label: copy.newDebt, disabled: archived },
      { id: 'edit', label: copy.edit },
      archived
        ? { id: 'unarchive', label: copy.unarchive }
        : { id: 'archive', label: copy.archive, destructive: true },
    ];
  });
  protected readonly actionError = computed(() => {
    const problem = this.facade.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  protected readonly notFoundActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().people.detail.notFound.back,
      available: true,
      primary: true,
      link: '/people',
    },
  ]);
  protected readonly loadProblem = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.problem : null;
  });

  constructor() {
    // Um cadastro foi salvo no modal por cima desta página: relê do backend.
    this.changes
      .of('people')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.facade.load(this.id()));
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.load(id));
    });
  }

  protected setTab(tab: string | null): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'payable' ? 'payable' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected run(action: string): void {
    switch (action as ActionId) {
      case 'newDebt':
        void this.router.navigate(['/quick-add'], {
          queryParams: { mode: 'debt', personId: this.id() },
        });
        break;
      case 'edit':
        void this.router.navigate(['/people', this.id(), 'edit']);
        break;
      case 'archive':
        this.confirmArchive.set(true);
        break;
      case 'unarchive':
        this.facade.unarchive(this.id());
        break;
    }
  }

  protected doArchive(): void {
    this.facade.archive(this.id());
    this.confirmArchive.set(false);
  }

  protected retry(): void {
    this.facade.load(this.id());
  }

  private group(direction: DebtDirection): DebtGroup {
    const debts = (this.person()?.debts ?? []).filter((debt) => debt.direction === direction);
    return {
      open: debts.filter((debt) => isOpenStatus(debt.status)),
      closed: debts.filter((debt) => !isOpenStatus(debt.status)),
    };
  }
}
