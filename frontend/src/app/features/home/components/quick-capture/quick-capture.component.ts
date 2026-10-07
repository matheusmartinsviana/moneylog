import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, tap } from 'rxjs';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { QuickCaptureBus } from '~/app/common/services/quick-capture-bus';
import { ToastService } from '~/app/common/services/toast.service';
import {
  CaptureType,
  QuickCaptureFormComponent,
} from '~/app/features/home/components/quick-capture/quick-capture-form.component';
import { transactionLabel } from '~/app/features/transactions/transaction-label';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { CategoriesFacade } from '~/modules/categories/core/facades/categories.facade';
import type { Category } from '~/modules/categories/core/types/category';
import { PeopleListFacade } from '~/modules/people/core/facades/people-list.facade';
import { TransactionFormFacade } from '~/modules/transactions/core/facades/transaction-form.facade';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import type { PersonRef } from '~/util/debt';
import { readLastUsedAccount, writeLastUsedAccount } from '~/util/last-used-account';
import { formatMoney } from '~/util/money';

type CategoriesState = 'loading' | 'error' | 'ready';

/**
 * Quick Capture do Início (smart, sem IA): valor, descrição e Salvar; tipo, categoria, conta e data aparecem ao
 * focar. Salva por `POST /v1/transactions` (mesma facade e mesma `Idempotency-Key` por tentativa do `/quick-add`:
 * clique duplo = uma movimentação) e **o Início relê tudo do backend** (`saved`): nenhum saldo é atualizado no
 * front. As contas vêm da facade do Início (só `CASH` ativas). O bloco "Interpretação por IA" é inerte: o produto
 * não interpreta texto (sem parser, sem confiança, sem prévia).
 */
@Component({
  selector: 'app-quick-capture',
  imports: [RouterLink, QuickCaptureFormComponent],
  providers: [TransactionFormFacade, PeopleListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quick-capture.component.html',
  styleUrl: './quick-capture.component.css',
  host: { '(focusout)': 'onFocusOut($event)', '(keydown.escape)': 'collapse()' },
})
export class QuickCaptureComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountsFacade = inject(AccountsListFacade);
  private readonly categoriesFacade = inject(CategoriesFacade);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  /** Resolvida só quando "Emprestei" é usado: o Início não paga a leitura de pessoas antes. */
  private get peopleFacade(): PeopleListFacade {
    return this.injector.get(PeopleListFacade);
  }
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly bus = inject(QuickCaptureBus);
  /** Pedidos anteriores à criação do cartão não valem (a ação rápida pode ter sido usada em outra tela). */
  private readonly baseRequest = this.bus.request()?.n ?? 0;
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(TransactionFormFacade);

  /** `?mode=income` no Início (ação "Adicionar receita"): abre em Receita. */
  readonly type = input<CaptureType>('EXPENSE');
  /** Data do backend (`summary.asOf`). */
  readonly asOf = input<string | null>(null);
  /** Depois de salvar, quem hospeda relê o que o backend calcula. */
  readonly saved = output<void>();

  protected readonly expanded = signal(false);
  protected readonly request = computed(() => {
    const requested = this.bus.request();
    return requested && requested.n > this.baseRequest ? requested : { type: this.type(), n: 0 };
  });
  protected readonly focusToken = computed(() => {
    const requested = this.bus.request();
    return requested ? Math.max(requested.n - this.baseRequest, 0) : 0;
  });
  protected readonly resetToken = signal(0);
  protected readonly expenseCategories = signal<readonly Category[]>([]);
  protected readonly incomeCategories = signal<readonly Category[]>([]);
  protected readonly people = signal<readonly PersonRef[]>([]);
  private peopleLoaded = false;
  protected readonly categoriesState = signal<CategoriesState>('loading');
  private readonly lastUsed = signal<string | null>(readLastUsedAccount());
  private lastAccountId = '';

  protected readonly cashAccounts = computed(() =>
    (this.accountsFacade.data() ?? []).filter(
      (account) => account.liquidity === 'CASH' && account.status === 'ACTIVE',
    ),
  );
  protected readonly defaultAccountId = computed(() => {
    const list = this.cashAccounts();
    const last = this.lastUsed();
    if (last && list.some((account) => account.id === last)) return last;
    return list.length === 1 ? (list[0]?.id ?? null) : null;
  });

  /** O que o cartão mostra: carregando, erro (tentar de novo), sem conta (criar) ou o formulário. */
  protected readonly view = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
    const accounts = this.accountsFacade.state().status;
    if (accounts === 'error' || this.categoriesState() === 'error') return 'error';
    if (accounts === 'loading' || this.categoriesState() === 'loading') return 'loading';
    return this.cashAccounts().length === 0 ? 'empty' : 'ready';
  });

  constructor() {
    // Pedido de "Adicionar despesa/receita" do cabeçalho: expande e o formulário foca o valor.
    effect(() => {
      if (this.focusToken() > 0) untracked(() => this.expanded.set(true));
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((saved) => {
      if (this.lastAccountId !== '') {
        writeLastUsedAccount(this.lastAccountId);
        this.lastUsed.set(this.lastAccountId);
      }
      this.resetToken.update((value) => value + 1);
      this.collapse();
      if (saved.type === 'LOAN_GIVEN' && saved.debt) {
        // Emprestar: valor e pessoa vêm da resposta do backend; o aviso leva à dívida criada.
        const debtId = saved.debt.id;
        this.toast.show(
          interpolate(this.t().lending.loan.toast, {
            amount: formatMoney(saved.amount),
            name: saved.debt.person.name,
          }),
          {
            actions: [
              {
                id: 'view-debt',
                label: this.t().quickAdd.toast.viewDebt,
                run: () => void this.router.navigate(['/debts', debtId]),
              },
            ],
          },
        );
      } else {
        this.toast.show(
          interpolate(this.t().quickAdd.toast.saved, {
            description: transactionLabel(saved, this.t().transactions.types),
            amount: formatMoney(saved.amount),
          }),
        );
      }
      this.saved.emit();
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  protected loadCategories(): void {
    this.categoriesState.set('loading');
    forkJoin({
      expense: this.categoriesFacade.list('EXPENSE'),
      income: this.categoriesFacade.list('INCOME'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ expense, income }) => {
          this.expenseCategories.set(expense);
          this.incomeCategories.set(income);
          this.categoriesState.set('ready');
        },
        error: () => this.categoriesState.set('error'),
      });
  }

  /** Pessoas ativas, só quando "Emprestei" é escolhido (e de novo depois de uma falha). */
  protected loadPeople(): void {
    if (this.peopleLoaded) return;
    this.peopleLoaded = true;
    this.peopleFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.people.set(list.map(({ id, name }) => ({ id, name }))),
        error: () => (this.peopleLoaded = false),
      });
  }

  /** Cria a pessoa antes da dívida e a põe na lista: a resposta do backend é a escolhida. */
  protected readonly createPerson = (name: string): Observable<PersonRef> =>
    this.peopleFacade
      .create({ name, notes: null })
      .pipe(
        tap((person) =>
          this.people.update((list) => [...list, { id: person.id, name: person.name }]),
        ),
      );

  protected retry(): void {
    this.loadCategories();
    if (this.accountsFacade.state().status === 'error') this.accountsFacade.load('ACTIVE');
  }

  protected submit(input: TransactionInput): void {
    this.lastAccountId = ('accountId' in input ? input.accountId : '') ?? '';
    this.facade.submit({ kind: 'create', input });
  }

  protected expand(): void {
    this.expanded.set(true);
  }

  protected collapse(): void {
    this.expanded.set(false);
  }

  /** Perdeu o foco para fora do cartão: recolhe se nada foi digitado (não perde dado digitado). */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    const typed = this.host.nativeElement.querySelector<HTMLInputElement>(
      'input[data-cy="capture-amount"], input[data-cy="capture-description"]',
    );
    const amount = this.host.nativeElement.querySelector<HTMLInputElement>(
      'input[data-cy="capture-amount"]',
    );
    if (!(amount?.value ?? '') && !(typed?.value ?? '')) this.collapse();
  }
}
