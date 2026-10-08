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
import { RouterLink, RouterOutlet } from '@angular/router';
import { catchError, exhaustMap, finalize, map, of, Subject } from 'rxjs';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { SlideIndicatorDirective } from '~/app/common/motion/slide-indicator.directive';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { AccountRowComponent } from '~/app/features/accounts/components/account-row/account-row.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account, AccountStatus } from '~/modules/accounts/core/types/account';
import { problemOf } from '~/util/api/problem';

interface RowAction {
  readonly kind: 'archive' | 'unarchive';
  readonly account: Account;
}

/**
 * Contas (smart): lista ativas ou arquivadas (filtro `?status=ARCHIVED` na URL), com cards no
 * celular e tabela no desktop. Fala só com a facade de negócio (FE 01). Os saldos são os que a API
 * calculou; arquivar pede confirmação e usa o recurso devolvido.
 */
@Component({
  selector: 'app-accounts-page',
  imports: [
    SlideIndicatorDirective,
    RouterOutlet,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    AccountRowComponent,
  ],
  providers: [AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accounts.page.html',
  styleUrl: './accounts.page.css',
})
export class AccountsPage {
  private readonly changes = inject(EntityChanges);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly accounts = inject(AccountsListFacade);

  /** Filtro da URL (`?status=ARCHIVED`); qualquer outro valor mostra as ativas. */
  readonly status = input<string>();

  protected readonly filter = computed<AccountStatus>(() =>
    this.status() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
  );
  protected readonly pendingArchive = signal<Account | null>(null);
  protected readonly busy = signal(false);
  /** Arquivar recusado por reserva ativa (422, FE-S-178): aviso fixo com atalho para as metas. */
  protected readonly reservationsBlocked = signal(false);
  private readonly actions = new Subject<RowAction>();

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add-account',
      label: this.t().emptyState.accounts.addAccount,
      available: true,
      primary: true,
      link: '/accounts/new',
    },
  ]);

  protected readonly confirmTitle = computed(() =>
    interpolate(this.t().accounts.archiveConfirm.title, {
      name: this.pendingArchive()?.name ?? '',
    }),
  );

  constructor() {
    // Um cadastro foi salvo no modal por cima desta página: relê do backend.
    this.changes
      .of('accounts')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.accounts.load(this.filter()));
    effect(() => {
      const filter = this.filter();
      untracked(() => this.accounts.load(filter));
    });

    // exhaustMap: um toque duplo em "Arquivar" faz uma chamada só.
    this.actions
      .pipe(
        exhaustMap(({ kind, account }) => {
          this.busy.set(true);
          this.reservationsBlocked.set(false);
          const call =
            kind === 'archive'
              ? this.accounts.archive(account.id)
              : this.accounts.unarchive(account.id);
          return call.pipe(
            map(() => {
              this.toast.show(
                kind === 'archive'
                  ? this.t().accounts.toast.archived
                  : this.t().accounts.toast.unarchived,
              );
            }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              if (problem.code === 'ACCOUNT_HAS_RESERVATIONS') {
                this.reservationsBlocked.set(true);
              } else {
                this.toast.show(problemMessage(problem, this.t().errors), { tone: 'error' });
              }
              return of(null);
            }),
            finalize(() => {
              this.busy.set(false);
              this.pendingArchive.set(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected askArchive(account: Account): void {
    this.pendingArchive.set(account);
  }

  protected confirmArchive(): void {
    const account = this.pendingArchive();
    if (account) this.actions.next({ kind: 'archive', account });
  }

  protected cancelArchive(): void {
    if (!this.busy()) this.pendingArchive.set(null);
  }

  protected unarchive(account: Account): void {
    this.actions.next({ kind: 'unarchive', account });
  }

  protected retry(): void {
    this.accounts.load(this.filter());
  }
}
