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
import { RouterLink } from '@angular/router';
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
import { ToastService } from '~/app/common/services/toast.service';
import { CardRowComponent } from '~/app/features/cards/components/card-row/card-row.component';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import type { Card, CardStatus } from '~/modules/cards/core/types/card';
import { problemOf } from '~/util/api/problem';

interface RowAction {
  readonly kind: 'archive' | 'unarchive';
  readonly card: Card;
}

/**
 * Cartões (smart, T64): lista ativos ou arquivados (`?status=ARCHIVED` na URL), com cards no celular e
 * tabela no desktop. Fala só com a facade de negócio (FE 01). Limite, disponível e fatura atual são os
 * que a API calculou; arquivar pede confirmação e usa o recurso devolvido. `CARD_HAS_PENDING_BALANCE`
 * explica o que falta e leva à tela do cartão (faturas e parcelas).
 */
@Component({
  selector: 'app-cards-page',
  imports: [
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    CardRowComponent,
  ],
  providers: [CardsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cards.page.html',
  styleUrl: './cards.page.css',
})
export class CardsPage {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly cards = inject(CardsListFacade);

  /** Filtro da URL (`?status=ARCHIVED`); qualquer outro valor mostra os ativos. */
  readonly status = input<string>();

  protected readonly filter = computed<CardStatus>(() =>
    this.status() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
  );
  protected readonly pendingArchive = signal<Card | null>(null);
  protected readonly pendingBalance = signal<Card | null>(null);
  protected readonly busy = signal(false);
  private readonly actions = new Subject<RowAction>();

  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'add-card',
      label: this.t().emptyState.cards.addCard,
      available: true,
      primary: true,
      link: '/cards/new',
    },
  ]);

  protected readonly confirmTitle = computed(() =>
    interpolate(this.t().cards.archiveConfirm.title, { name: this.pendingArchive()?.name ?? '' }),
  );
  protected readonly pendingMessage = computed(() =>
    interpolate(this.t().cards.pendingBalance.message, {
      name: this.pendingBalance()?.name ?? '',
    }),
  );

  constructor() {
    effect(() => {
      const filter = this.filter();
      untracked(() => {
        this.pendingBalance.set(null);
        this.cards.load(filter);
      });
    });

    // exhaustMap: um toque duplo em "Arquivar" faz uma chamada só.
    this.actions
      .pipe(
        exhaustMap(({ kind, card }) => {
          this.busy.set(true);
          this.pendingBalance.set(null);
          const call =
            kind === 'archive' ? this.cards.archive(card.id) : this.cards.unarchive(card.id);
          return call.pipe(
            map(() => {
              this.toast.show(
                kind === 'archive'
                  ? this.t().cards.toast.archived
                  : this.t().cards.toast.unarchived,
              );
            }),
            catchError((error: unknown) => {
              const problem = problemOf(error);
              if (problem.code === 'CARD_HAS_PENDING_BALANCE') {
                this.pendingBalance.set(card);
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

  protected askArchive(card: Card): void {
    this.pendingArchive.set(card);
  }

  protected confirmArchive(): void {
    const card = this.pendingArchive();
    if (card) this.actions.next({ kind: 'archive', card });
  }

  protected cancelArchive(): void {
    if (!this.busy()) this.pendingArchive.set(null);
  }

  protected unarchive(card: Card): void {
    this.actions.next({ kind: 'unarchive', card });
  }

  protected retry(): void {
    this.cards.load(this.filter());
  }
}
