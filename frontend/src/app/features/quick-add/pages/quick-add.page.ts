import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, tap } from 'rxjs';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import type { AppI18n } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { ToastService } from '~/app/common/services/toast.service';
import { AdjustmentFormComponent } from '~/app/features/quick-add/components/adjustment-form/adjustment-form.component';
import { CardPurchaseFormComponent } from '~/app/features/quick-add/components/card-purchase-form/card-purchase-form.component';
import { CashEntryFormComponent } from '~/app/features/quick-add/components/cash-entry-form/cash-entry-form.component';
import { DebtEntryComponent } from '~/app/features/quick-add/components/debt-entry/debt-entry.component';
import { InvestmentFormComponent } from '~/app/features/quick-add/components/investment-form/investment-form.component';
import { LoanFormComponent } from '~/app/features/quick-add/components/loan-form/loan-form.component';
import { ModeSwitchComponent } from '~/app/features/quick-add/components/mode-switch/mode-switch.component';
import {
  ReceivableOption,
  ReceivedFormComponent,
} from '~/app/features/quick-add/components/received-form/received-form.component';
import { RefundFormComponent } from '~/app/features/quick-add/components/refund-form/refund-form.component';
import { TransferFormComponent } from '~/app/features/quick-add/components/transfer-form/transfer-form.component';
import { loadFormOptions } from '~/app/features/quick-add/form-options';
import {
  DEFAULT_MODE,
  parseMode,
  PEOPLE_MODES,
  QuickAddMode,
} from '~/app/features/quick-add/quick-add-mode';
import { sanitizeSharedText } from '~/app/features/quick-add/quick-add-params';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import { PurchasePreviewFacade } from '~/modules/cards/core/facades/purchase-preview.facade';
import type { Card } from '~/modules/cards/core/types/card';
import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import type { Category } from '~/modules/categories/core/types/category';
import { DebtsListFacade } from '~/modules/debts/core/facades/debts-list.facade';
import type { Debt } from '~/modules/debts/core/types/debt';
import { PeopleListFacade } from '~/modules/people/core/facades/people-list.facade';
import { RefundOriginSearchFacade } from '~/modules/transactions/core/facades/refund-origin-search.facade';
import { TransactionFormFacade } from '~/modules/transactions/core/facades/transaction-form.facade';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import type { PaymentMethod } from '~/modules/transactions/core/types/transaction-enums';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import { Problem, problemOf } from '~/util/api/problem';
import { isOpenStatus, type PersonRef } from '~/util/debt';
import { readLastUsedAccount, writeLastUsedAccount } from '~/util/last-used-account';
import { readLastUsedCard, writeLastUsedCard } from '~/util/last-used-card';
import { formatMoney } from '~/util/money';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly problem: Problem }
  | { readonly status: 'ready' };

/** Conta de onde a movimentação sai (ou onde entra), para lembrar como "última usada". */
function accountOf(input: TransactionInput): string {
  switch (input.type) {
    case 'TRANSFER':
      return input.fromAccountId;
    case 'INVESTMENT':
      return input.cashAccountId;
    case 'CARD_PURCHASE':
      return '';
    case 'REFUND':
      return input.accountId ?? '';
    default:
      return input.accountId;
  }
}

/** O cartão da compra no cartão, para lembrar como "último usado"; `null` nos demais tipos. */
function cardOf(input: TransactionInput): string | null {
  return input.type === 'CARD_PURCHASE' ? input.cardId : null;
}

/**
 * `/quick-add` (smart): formulário curto por modo (S-69). Carrega as contas ativas (`loadAll`, S-91)
 * e as categorias; cada formulário é apresentacional e só recebe o que pode escolher (contas `CASH`
 * nos modos de despesa e receita, A19). Salvar usa a `Idempotency-Key` da facade do módulo; o toast
 * mostra o registro devolvido pela API e o formulário mantém conta e modo. O modo "Crédito" (S-132) é a
 * compra no cartão: carrega os cartões ativos (só nos modos Crédito e Reembolso) (`?cardId=` pré-escolhe um), mostra a **prévia do backend**
 * (parcelas, fatura alvo, avisos) e, ao salvar, oferece "Ver fatura" no aviso.
 */
@Component({
  selector: 'app-quick-add-page',
  imports: [
    PageLayoutComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ModeSwitchComponent,
    CashEntryFormComponent,
    TransferFormComponent,
    InvestmentFormComponent,
    AdjustmentFormComponent,
    RefundFormComponent,
    CardPurchaseFormComponent,
    LoanFormComponent,
    ReceivedFormComponent,
    DebtEntryComponent,
  ],
  providers: [
    TransactionFormFacade,
    AccountsListFacade,
    CardsListFacade,
    PurchasePreviewFacade,
    RefundOriginSearchFacade,
    PeopleListFacade,
    DebtsListFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quick-add.page.html',
  styleUrl: './quick-add.page.css',
})
export class QuickAddPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly accountsFacade = inject(AccountsListFacade);
  private readonly cardsFacade = inject(CardsListFacade);
  private readonly categoriesFacade = inject(CategoriesFacade);
  private readonly injector = inject(Injector);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(TransactionFormFacade);
  protected readonly originSearch = inject(RefundOriginSearchFacade);
  protected readonly purchasePreview = inject(PurchasePreviewFacade);

  protected readonly load = signal<LoadState>({ status: 'loading' });
  protected readonly loadProblem = computed(() => {
    const state = this.load();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly accounts = signal<readonly Account[]>([]);
  protected readonly cards = signal<readonly Card[]>([]);
  /**
   * Os cartões carregam à parte e só nos modos que os usam (Crédito e Reembolso): uma falha de
   * `GET /v1/cards` não derruba despesa, receita, Pix, transferência, investimento nem ajuste.
   */
  private readonly cardsLoad = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly cardsProblem = signal<Problem | null>(null);
  /** Crédito não abre o formulário sem os cartões: espera a carga. */
  protected readonly cardsLoading = computed(
    () => this.mode() === 'credit' && ['idle', 'loading'].includes(this.cardsLoad()),
  );
  protected readonly isPeopleMode = computed(() =>
    (PEOPLE_MODES as readonly string[]).includes(this.mode()),
  );
  /** Os modos com pessoas esperam a carga (e, no recebido, as dívidas a receber). */
  protected readonly peopleLoading = computed(() => {
    const mode = this.mode();
    if (!this.isPeopleMode()) return false;
    const waiting = (state: string) => state === 'idle' || state === 'loading';
    return waiting(this.peopleLoad()) || (mode === 'received' && waiting(this.receivablesLoad()));
  });
  protected readonly peopleFailed = computed(
    () =>
      this.isPeopleMode() &&
      (this.peopleLoad() === 'error' ||
        (this.mode() === 'received' && this.receivablesLoad() === 'error')),
  );
  /** Crédito sem os cartões (a carga falhou): erro com "tentar de novo". O Reembolso tolera. */
  protected readonly cardsFailed = computed(
    () => this.mode() === 'credit' && this.cardsLoad() === 'error',
  );
  /** `?cardId=` da URL (o botão "Nova compra" da tela do cartão). */
  private readonly requestedCard = signal<string | null>(null);
  /** `?personId=` da URL (os botões "Emprestar", "Receber" e "Nova dívida" da tela da pessoa). */
  protected readonly requestedPerson = signal<string | null>(null);
  /**
   * Pessoas e dívidas a receber carregam à parte e só quando o modo (ou a divisão de despesa) as usa:
   * uma falha em `GET /v1/people` não derruba os demais modos. As facades são resolvidas sob demanda.
   */
  protected readonly people = signal<readonly PersonRef[]>([]);
  protected readonly receivables = signal<readonly ReceivableOption[]>([]);
  private readonly peopleLoad = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly receivablesLoad = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private receivablesSub: Subscription | null = null;
  protected readonly peopleProblem = signal<Problem | null>(null);
  /** `?amount=&description=` (Quick Capture do Início): valores inválidos são ignorados. */
  protected readonly prefill = signal<{ amount: string | null; description: string | null } | null>(
    null,
  );
  private readonly lastCard = signal<string | null>(readLastUsedCard());
  protected readonly expenseCategories = signal<readonly Category[]>([]);
  protected readonly incomeCategories = signal<readonly Category[]>([]);
  protected readonly mode = signal<QuickAddMode>(DEFAULT_MODE);
  protected readonly lastUsed = signal<string | null>(readLastUsedAccount());
  /** Sobe a cada registro salvo (limpa valor e descrição) e a cada "novo registro" (foco no valor). */
  protected readonly resetToken = signal(0);
  protected readonly focusToken = signal(0);

  protected readonly cashAccounts = computed(() =>
    this.accounts().filter((account) => account.liquidity === 'CASH'),
  );
  protected readonly investmentAccounts = computed(() =>
    this.accounts().filter((account) => account.liquidity === 'INVESTMENT'),
  );
  protected readonly investmentDefault = computed(() => this.defaultFor(this.investmentAccounts()));
  protected readonly cashDefault = computed(() => this.defaultFor(this.cashAccounts()));
  protected readonly anyDefault = computed(() => this.defaultFor(this.accounts()));
  /** Cartão padrão do modo Crédito: o da URL, o último usado ou o único ativo (T67 CA1). */
  protected readonly cardDefault = computed(() => {
    const cards = this.cards();
    const wanted = this.requestedCard();
    if (wanted && cards.some((card) => card.id === wanted)) return wanted;
    const last = this.lastCard();
    if (last && cards.some((card) => card.id === last)) return last;
    return cards.length === 1 ? (cards[0]?.id ?? null) : null;
  });

  /** O que impede o modo atual de abrir o formulário (sem conta que sirva). */
  protected readonly blocked = computed<
    'noAccount' | 'needTwoAccounts' | 'noInvestmentAccount' | 'noCard' | null
  >(() => {
    switch (this.mode()) {
      case 'credit':
        // Compra no cartão não usa conta: só precisa de um cartão ativo (S-132).
        return this.cardsLoad() === 'ready' && this.cards().length === 0 ? 'noCard' : null;
      case 'transfer':
        return this.accounts().length < 2 ? 'needTwoAccounts' : null;
      case 'adjustment':
      case 'debt':
        // Dívida sem movimentação não usa conta.
        return null;
      case 'investment':
        if (this.cashAccounts().length === 0) return 'noAccount';
        return this.investmentAccounts().length === 0 ? 'noInvestmentAccount' : null;
      default:
        return this.cashAccounts().length === 0 ? 'noAccount' : null;
    }
  });
  protected readonly blockedCopy = computed(() => {
    const kind = this.blocked();
    return kind ? this.t().quickAdd.empty[kind] : null;
  });
  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => {
    const copy = this.blockedCopy();
    const noCard = this.blocked() === 'noCard';
    return copy
      ? [
          {
            id: noCard ? 'add-card' : 'add-account',
            label: copy.action,
            available: true,
            primary: true,
            link: noCard ? '/cards/new' : '/accounts/new',
          },
        ]
      : [];
  });

  private lastInput: TransactionInput | null = null;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const mode = parseMode(params.get('mode'));
      this.requestedCard.set(params.get('cardId'));
      this.requestedPerson.set(params.get('personId'));
      const amount = params.get('amount')?.trim() ?? '';
      // `description` (atalho) ou `text`/`title` (compartilhar para o app): sem HTML nem controle, até 200.
      const description = sanitizeSharedText(
        params.get('description') ?? params.get('text') ?? params.get('title'),
      );
      const validAmount = /^\d+(\.\d{1,2})?$/.test(amount) ? amount : null;
      this.prefill.set(
        validAmount || description
          ? { amount: validAmount, description: description || null }
          : null,
      );
      if (mode !== this.mode()) {
        this.mode.set(mode);
        this.facade.dismissProblem();
        this.purchasePreview.request('', null);
      }
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((saved) => {
      if (this.lastInput) {
        const accountId = accountOf(this.lastInput);
        if (accountId !== '') {
          writeLastUsedAccount(accountId);
          this.lastUsed.set(accountId);
        }
        const cardId = cardOf(this.lastInput);
        if (cardId !== null) {
          writeLastUsedCard(cardId);
          this.lastCard.set(cardId);
        }
      }
      this.resetToken.update((value) => value + 1);
      this.purchasePreview.request('', null);
      // Emprestar cria uma dívida "me devem" e receber muda o `outstanding`: "Receber" recarrega.
      if (saved.type === 'LOAN_GIVEN' || saved.type === 'MONEY_RECEIVED') this.refreshReceivables();
      const copy = this.t().quickAdd.toast;
      // Compra no cartão: o aviso leva à fatura da 1ª parcela (a que o backend escolheu).
      const firstInstallment = saved.type === 'CARD_PURCHASE' ? saved.installments[0] : undefined;
      const viewTarget =
        saved.card && firstInstallment
          ? {
              link: ['/cards', saved.card.id, 'invoices', firstInstallment.invoiceId],
              label: copy.viewInvoice,
            }
          : saved.debt
            ? // Emprestar, receber e pagar: o aviso leva à dívida que o backend devolveu.
              { link: ['/debts', saved.debt.id], label: copy.viewDebt }
            : saved.shares.length > 0
              ? // Despesa dividida: o detalhe mostra o `impact` e as partes, do backend.
                { link: ['/transactions', saved.id], label: copy.viewDetails }
              : { link: ['/transactions'], label: copy.viewTransactions };
      this.toast.show(this.savedMessage(saved, copy), {
        actions: [
          {
            id: 'view',
            label: viewTarget.label,
            run: () => void this.router.navigate(viewTarget.link),
          },
          {
            id: 'new',
            label: copy.newEntry,
            run: () => this.focusToken.update((value) => value + 1),
          },
        ],
      });
    });
    // Entrou num modo com pessoas (ou recebido, que precisa das dívidas): carrega sob demanda.
    effect(() => {
      if (!this.isPeopleMode()) return;
      const mode = this.mode();
      untracked(() => {
        if (this.peopleLoad() === 'idle') this.loadPeople();
        if (mode === 'received' && this.receivablesLoad() === 'idle') this.loadReceivables();
      });
    });
    // Entrou num modo que usa cartões (e eles ainda não foram pedidos): carrega.
    effect(() => {
      const mode = this.mode();
      if ((mode === 'credit' || mode === 'refund') && this.cardsLoad() === 'idle') {
        untracked(() => this.loadCards());
      }
    });
    this.reload();
  }

  /** O aviso do registro salvo: o valor e a pessoa vêm da resposta do backend (nada é recalculado). */
  private savedMessage(saved: Transaction, copy: AppI18n['quickAdd']['toast']): string {
    const lending = this.t().lending;
    const amount = formatMoney(saved.amount);
    const name = saved.debt?.person.name ?? '';
    switch (saved.type) {
      case 'LOAN_GIVEN':
        return interpolate(lending.loan.toast, { amount, name });
      case 'MONEY_RECEIVED':
        // Devolução (a dívida é de quem me devia) ou empréstimo recebido (a dívida é minha).
        return saved.debt?.direction === 'PAYABLE'
          ? interpolate(lending.received.toastBorrowed, { amount, name })
          : interpolate(lending.received.toastRepayment, { amount });
      default:
        return saved.shares.length > 0
          ? lending.shares.toast
          : interpolate(copy.saved, { description: saved.description, amount });
    }
  }

  /** Cria a pessoa antes da dívida (S-138) e a põe na lista dos seletores: a resposta é a escolhida. */
  protected readonly createPerson = (name: string): Observable<PersonRef> =>
    this.injector
      .get(PeopleListFacade)
      .create({ name, notes: null })
      .pipe(
        tap((person) =>
          this.people.update((list) => [...list, { id: person.id, name: person.name }]),
        ),
      );

  /** "Dividir com alguém" foi ligado: carrega as pessoas só na primeira vez (ou depois de uma falha). */
  protected ensurePeople(): void {
    if (this.peopleLoad() === 'idle' || this.peopleLoad() === 'error') this.loadPeople();
  }

  /** Pessoas ativas, sob demanda (modos com pessoas e "Dividir com alguém"). */
  protected loadPeople(): void {
    if (this.peopleLoad() === 'loading') return;
    this.peopleLoad.set('loading');
    this.peopleProblem.set(null);
    this.injector
      .get(PeopleListFacade)
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (people) => {
          this.people.set(people.map((person) => ({ id: person.id, name: person.name })));
          this.peopleLoad.set('ready');
        },
        error: (error: unknown) => {
          this.peopleProblem.set(problemOf(error));
          this.peopleLoad.set('error');
        },
      });
  }

  /** Dívidas "me devem" em aberto (o status e o `outstanding` vêm do backend, que filtra por status). */
  protected loadReceivables(silent = false): void {
    this.receivablesSub?.unsubscribe();
    if (!silent) this.receivablesLoad.set('loading');
    this.receivablesSub = this.injector
      .get(DebtsListFacade)
      .loadAllOpen({ direction: 'RECEIVABLE' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (debts) => {
          this.receivables.set(
            debts
              // Rede de segurança: o backend já filtrou o status.
              .filter((debt) => isOpenStatus(debt.status))
              .map((debt) => ({
                id: debt.id,
                person: debt.person,
                title: debt.description ?? this.t().debts.row.defaultTitleReceivable,
                outstanding: debt.outstanding,
              })),
          );
          this.receivablesLoad.set('ready');
        },
        error: (error: unknown) => {
          if (silent) {
            // Recarga em segundo plano que falhou: não derruba a tela. Fora do "Receber" a lista é
            // marcada como velha (recarrega ao entrar); dentro dele, a lista anterior continua.
            if (this.mode() !== 'received') this.receivablesLoad.set('idle');
            return;
          }
          this.peopleProblem.set(problemOf(error));
          this.receivablesLoad.set('error');
        },
      });
  }

  /** Recarrega, em silêncio, as dívidas a receber já carregadas (se nunca carregaram, carregam ao entrar). */
  private refreshReceivables(): void {
    if (this.receivablesLoad() !== 'idle') this.loadReceivables(true);
  }

  /** "Nova dívida" criada: se é de quem me deve, ela passa a existir em "Receber". */
  protected onDebtSaved(debt: Debt): void {
    if (debt.direction === 'RECEIVABLE') this.refreshReceivables();
  }

  protected retryPeople(): void {
    if (this.peopleLoad() === 'error') this.loadPeople();
    if (this.receivablesLoad() === 'error') this.loadReceivables();
  }

  protected loadCards(): void {
    this.cardsLoad.set('loading');
    this.cardsProblem.set(null);
    this.cardsFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cards) => {
          this.cards.set(cards);
          this.cardsLoad.set('ready');
        },
        error: (error: unknown) => {
          this.cardsProblem.set(problemOf(error));
          this.cardsLoad.set('error');
        },
      });
  }

  protected reload(): void {
    this.load.set({ status: 'loading' });
    loadFormOptions(this.accountsFacade, this.categoriesFacade)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ accounts, expenseCategories, incomeCategories }) => {
          this.accounts.set(accounts);
          this.expenseCategories.set(expenseCategories);
          this.incomeCategories.set(incomeCategories);
          this.load.set({ status: 'ready' });
        },
        error: (error: unknown) => this.load.set({ status: 'error', problem: problemOf(error) }),
      });
  }

  protected setMode(mode: QuickAddMode): void {
    if (mode === this.mode()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: mode === DEFAULT_MODE ? null : mode },
      replaceUrl: true,
    });
  }

  protected submit(input: TransactionInput): void {
    this.lastInput = input;
    this.facade.submit({ kind: 'create', input });
  }

  protected fixedMethod(mode: QuickAddMode): PaymentMethod | null {
    return mode === 'pix' ? 'PIX' : mode === 'debit' ? 'DEBIT' : null;
  }

  private defaultFor(list: readonly Account[]): string | null {
    const last = this.lastUsed();
    if (last && list.some((account) => account.id === last)) return last;
    return list.length === 1 ? (list[0]?.id ?? null) : null;
  }
}
