import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { valueSignal } from '~/app/common/forms/control-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { GoalReserveFacade } from '~/modules/goals/core/facades/goal-reserve.facade';
import { GOAL_CURRENCY, type Goal } from '~/modules/goals/core/types/goal';
import { Problem, problemOf } from '~/util/api/problem';
import { todayIso } from '~/util/date';

/** Códigos de regra que o backend atribui a um campo da folha. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'amount',
  AMOUNT_ABOVE_LIMIT: 'amount',
  GOAL_RESERVATION_AMOUNT_ZERO: 'amount',
  GOAL_RELEASE_EXCEEDS_RESERVED: 'amount',
  GOAL_RESERVATION_ACCOUNT_NOT_ELIGIBLE: 'accountId',
  ACCOUNT_ARCHIVED: 'accountId',
  ACCOUNT_NOT_FOUND: 'accountId',
};

/** Códigos em que a meta já não aceita a operação: quem usa recarrega. */
const STALE_CODES: ReadonlySet<string> = new Set(['GOAL_ARCHIVED', 'GOAL_NOT_FOUND']);

/**
 * "Reservar" e "Liberar" numa meta (T100): conta (só as ativas, `CASH` ou `INVESTMENT`; a liberação oferece
 * as contas que a meta já tem reservadas, mesmo arquivadas), valor, data e nota. Liberar é uma **chave
 * própria** (Reservar | Liberar): o usuário digita o valor positivo e a infra manda o negativo no corpo. O
 * texto explica que a reserva não move dinheiro. A `Idempotency-Key` é por tentativa e reutilizada no "tentar
 * de novo". Com mais de uma meta (atalho do Início) a folha deixa escolher a meta.
 */
@Component({
  selector: 'app-reserve-sheet',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SheetComponent,
    SegmentedControlComponent,
    SelectComponent,
    MoneyInputComponent,
    DatePickerComponent,
    TextFieldComponent,
  ],
  providers: [GoalReserveFacade, AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reserve-sheet.component.html',
  styleUrl: './reserve-sheet.component.css',
})
export class ReserveSheetComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly accountsFacade = inject(AccountsListFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(GoalReserveFacade);
  protected readonly currency = GOAL_CURRENCY;

  readonly open = input.required<boolean>();
  /** As metas que a folha pode receber (uma só, ou várias no atalho do Início). */
  readonly goals = input.required<readonly Goal[]>();
  /** A meta escolhida ao abrir (a de maior prioridade, no atalho). */
  readonly goalId = input<string>();
  /** Começa em "Liberar"? */
  readonly releasing = input(false);

  readonly closed = output<void>();
  /** A meta devolvida pelo backend (com `current`, `progress` e as reservas). */
  readonly reserved = output<Goal>();
  /** A meta já não aceita a operação (arquivada ou removida): recarregue. */
  readonly stale = output<void>();

  protected readonly form = new FormGroup({
    kind: new FormControl<string | null>('reserve'),
    goalId: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>(null),
    amount: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    note: new FormControl('', { nonNullable: true }),
  });

  private readonly kindValue = valueSignal(this.form.controls.kind);
  private readonly goalValue = valueSignal(this.form.controls.goalId);
  private readonly accounts = signal<readonly Account[] | null>(null);
  private readonly accountsProblem = signal<Problem | null>(null);
  protected readonly accountsLoading = computed(
    () => this.accounts() === null && this.accountsProblem() === null,
  );
  protected readonly accountsFailed = computed(() => this.accountsProblem() !== null);

  protected readonly isRelease = computed(() => this.kindValue() === 'release');
  protected readonly selectedGoal = computed(
    () => this.goals().find((goal) => goal.id === this.goalValue()) ?? this.goals()[0] ?? null,
  );
  protected readonly manyGoals = computed(() => this.goals().length > 1);
  protected readonly heading = computed(() => {
    const copy = this.t().goals.reserve;
    const name = this.selectedGoal()?.name ?? '';
    return interpolate(this.isRelease() ? copy.releaseTitle : copy.reserveTitle, { name });
  });

  protected readonly kindOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'reserve', label: this.t().goals.detail.reserve },
    { value: 'release', label: this.t().goals.detail.release },
  ]);
  protected readonly goalOptions = computed<readonly ChoiceOption[]>(() =>
    this.goals().map((goal) => ({ value: goal.id, label: goal.name })),
  );
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() => {
    if (this.isRelease()) {
      // Liberar: as contas que a meta já tem reservadas (inclusive arquivadas), sem repetir.
      const seen = new Map<string, string>();
      for (const reservation of this.selectedGoal()?.reservations ?? []) {
        seen.set(reservation.account.id, reservation.account.name);
      }
      return [...seen].map(([value, label]) => ({ value, label }));
    }
    return (this.accounts() ?? []).map((account) => ({ value: account.id, label: account.name }));
  });
  protected readonly noAccounts = computed(
    () => !this.accountsLoading() && !this.accountsFailed() && this.accountOptions().length === 0,
  );

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });
  private lastKind: 'reserve' | 'release' = 'reserve';

  constructor() {
    // Abriu: zera o formulário (uma falha ambígua da MESMA meta continua pendente) e carrega as contas.
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (!open) return;
        const goals = this.goals();
        const goal = goals.find((g) => g.id === this.goalId()) ?? goals[0];
        if (!goal) return;
        this.facade.reopen(goal.id);
        this.form.reset({
          kind: this.releasing() ? 'release' : 'reserve',
          goalId: goal.id,
          accountId: null,
          amount: null,
          date: todayIso(),
          note: '',
        });
        this.loadAccounts();
      });
    });
    // Trocar de tipo ou de meta muda as contas oferecidas: a escolha anterior deixa de valer.
    effect(() => {
      this.kindValue();
      this.goalValue();
      untracked(() => this.form.controls.accountId.setValue(null, { emitEvent: false }));
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() => {
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        );
        if (problem && STALE_CODES.has(problem.code)) this.stale.emit();
      });
    });
    this.facade.reserved$.pipe(takeUntilDestroyed()).subscribe((goal) => {
      const copy = this.t().goals.toast;
      this.toast.show(this.lastKind === 'release' ? copy.released : copy.reserved);
      this.reserved.emit(goal);
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const goal = this.selectedGoal();
    const value = this.form.getRawValue();
    if (!goal || this.form.invalid || value.accountId === null || value.amount === null) return;
    const kind = value.kind === 'release' ? 'release' : 'reserve';
    this.lastKind = kind;
    this.facade.reserve(goal.id, {
      kind,
      accountId: value.accountId,
      amount: value.amount,
      date: value.date ?? todayIso(),
      note: value.note.trim() === '' ? null : value.note.trim(),
    });
  }

  protected close(): void {
    if (!this.facade.saving()) this.closed.emit();
  }

  protected retryAccounts(): void {
    this.loadAccounts();
  }

  /** As contas ativas (`CASH` e `INVESTMENT` são todas as que existem hoje); recarrega a cada abertura. */
  private loadAccounts(): void {
    this.accountsProblem.set(null);
    this.accounts.set(null);
    this.accountsFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => this.accounts.set(accounts),
        error: (error: unknown) => this.accountsProblem.set(problemOf(error)),
      });
  }
}
