import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { merge } from 'rxjs';

import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { BillingChangeNoticeComponent } from '~/app/features/cards/components/billing-change-notice/billing-change-notice.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import { BillingChangePreviewFacade } from '~/modules/cards/core/facades/billing-change-preview.facade';
import { CardFormFacade } from '~/modules/cards/core/facades/card-form.facade';
import { CARD_CURRENCY, CardInput } from '~/modules/cards/core/types/card';

/** Códigos de regra que o backend atribui a um campo do formulário. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  CARD_NAME_REQUIRED: 'name',
  CARD_NAME_TOO_LONG: 'name',
  CARD_INSTITUTION_TOO_LONG: 'institution',
  CARD_INVALID_LIMIT: 'limit',
  AMOUNT_ABOVE_LIMIT: 'limit',
  TRANSACTION_ACCOUNT_NOT_CASH: 'defaultPaymentAccountId',
  ACCOUNT_ARCHIVED: 'defaultPaymentAccountId',
  ACCOUNT_NOT_FOUND: 'defaultPaymentAccountId',
};

const MAX_DAY = 31;

/**
 * Criar (`/cards/new`) e editar (`/cards/:id/edit`) um cartão (T64, T69). Valida nome, limite e dias só
 * para UX: a regra é do backend, e o erro dele preenche o campo. Nenhum campo para número, validade ou
 * CVV. Ao mudar fechamento ou vencimento (edição), pede a **prévia do backend** (300 ms, cancela a
 * anterior), mostra o efeito e só habilita o salvar com a prévia da combinação atual; o `PUT` leva
 * `confirmedEffectiveFrom` = `effectiveFromClosingDate` recebido. `409 CARD_BILLING_CHANGE_STALE` refaz a
 * prévia; `409 VERSION_CONFLICT` avisa e recarrega. Salvar usa o cartão devolvido e leva à tela dele.
 */
@Component({
  selector: 'app-card-form-page',
  imports: [
    ReactiveFormsModule,
    FormModalComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TextFieldComponent,
    MoneyInputComponent,
    NumberStepperComponent,
    SelectComponent,
    BillingChangeNoticeComponent,
  ],
  providers: [CardFormFacade, BillingChangePreviewFacade, AccountsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-form.page.html',
  styleUrl: './card-form.page.css',
})
export class CardFormPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly changes = inject(EntityChanges);
  private readonly toast = inject(ToastService);
  private readonly accountsFacade = inject(AccountsListFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(CardFormFacade);
  protected readonly billing = inject(BillingChangePreviewFacade);
  protected readonly currency = CARD_CURRENCY;
  protected readonly maxDay = MAX_DAY;

  /** `:id` da rota; ausente em `/cards/new`. */
  readonly id = input<string>();

  protected readonly editing = computed(() => this.id() !== undefined);
  protected readonly card = this.facade.card;

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    institution: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    limit: new FormControl<string | null>(null),
    closingDay: new FormControl<number | null>(null, [Validators.required]),
    dueDay: new FormControl<number | null>(null, [Validators.required]),
    defaultPaymentAccountId: new FormControl<string | null>(null),
  });

  /** Alterações digitadas e não salvas: fechar pede confirmação. */
  protected readonly dirty = dirtySignal(this.form);

  private readonly accounts = signal<readonly Account[]>([]);
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts()
      .filter((account) => account.liquidity === 'CASH')
      .map((account) => ({ value: account.id, label: account.name })),
  );

  /** Os dois dias mudaram em relação ao cartão carregado? (Só na edição.) */
  protected readonly daysChanged = signal(false);
  protected readonly staleBilling = signal(false);

  protected readonly dayText = computed(
    () =>
      (day: number): string =>
        interpolate(this.t().cards.form.dayValue, { day: String(day) }),
  );

  /** A falha do salvar já foi para os campos (então não precisa do aviso geral)? */
  private readonly fieldHandled = signal(false);

  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (
      !problem ||
      problem.code === 'VERSION_CONFLICT' ||
      problem.code === 'CARD_BILLING_CHANGE_STALE' ||
      this.fieldHandled()
    ) {
      return null;
    }
    return problemMessage(problem, this.t().errors);
  });
  protected readonly conflict = computed(() => this.facade.problem()?.code === 'VERSION_CONFLICT');
  protected readonly loadProblem = computed(() => {
    const state = this.facade.loadStatus();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly notFound = computed(() => this.loadProblem()?.status === 404);

  /** O salvar espera a prévia da combinação atual quando um dia mudou (T69 CA1). */
  protected readonly waitingPreview = computed(
    () => this.daysChanged() && this.billing.data() === null,
  );

  constructor() {
    // Edição: carrega o cartão; a cada versão nova (inclusive depois de um conflito) repõe o formulário.
    effect(() => {
      const id = this.id();
      if (id !== undefined) untracked(() => this.facade.load(id));
    });
    effect(() => {
      const card = this.card();
      if (!card) return;
      untracked(() => {
        this.form.setValue({
          name: card.name,
          institution: card.institution ?? '',
          limit: card.limit?.amount ?? null,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          defaultPaymentAccountId: card.defaultPaymentAccountId,
        });
        this.staleBilling.set(false);
        this.updateBillingPreview();
      });
    });
    // Mudou o fechamento ou o vencimento: pede a prévia (ou limpa, se voltou ao que era).
    merge(this.form.controls.closingDay.valueChanges, this.form.controls.dueDay.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.staleBilling.set(false);
        this.updateBillingPreview();
      });
    // Falha do salvar: marca os campos que o backend apontou; 409 recarrega ou refaz a prévia.
    effect(() => {
      const problem = this.facade.problem();
      if (!problem) {
        this.fieldHandled.set(false);
        return;
      }
      untracked(() => {
        this.fieldHandled.set(applyProblemToForm(this.form, problem, CODE_TO_FIELD));
        const id = this.id();
        if (problem.code === 'VERSION_CONFLICT' && id !== undefined) this.facade.load(id);
        if (problem.code === 'CARD_BILLING_CHANGE_STALE') {
          this.staleBilling.set(true);
          this.updateBillingPreview();
        }
      });
    });

    this.accountsFacade
      .loadAll('ACTIVE')
      .pipe(takeUntilDestroyed(this.destroyRef))
      // Sem a lista de contas o campo fica sem opções: a conta padrão é opcional.
      .subscribe({ next: (accounts) => this.accounts.set(accounts), error: () => undefined });

    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((card) => {
      this.toast.show(
        interpolate(this.editing() ? this.t().cards.toast.updated : this.t().cards.toast.created, {
          name: card.name,
        }),
      );
      this.changes.notify('cards');
      void this.router.navigate(this.backUrl());
    });
  }

  /** Para onde o modal volta: a lista (criar) ou a página de origem (editar). */
  private backUrl(): string[] {
    return this.editing() ? ['/cards', this.id() as string] : ['/cards'];
  }

  /** Fechar sem salvar (já confirmado, se havia alterações). */
  protected close(): void {
    void this.router.navigate(this.backUrl());
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const institution = value.institution.trim();
    const base: CardInput = {
      name: value.name.trim(),
      institution: institution === '' ? null : institution,
      limit: value.limit === null || value.limit.trim() === '' ? null : value.limit,
      closingDay: value.closingDay ?? 0,
      dueDay: value.dueDay ?? 0,
      defaultPaymentAccountId: value.defaultPaymentAccountId,
    };
    const card = this.card();
    const id = this.id();

    if (id !== undefined && card) {
      const preview = this.billing.data();
      // Mudou um dia e a prévia atual não chegou: não envia (o botão já está desabilitado).
      if (this.daysChanged() && preview === null) return;
      this.facade.save({
        kind: 'update',
        id,
        input: {
          ...base,
          version: card.version,
          confirmedEffectiveFrom: this.daysChanged()
            ? (preview?.effectiveFromClosingDate ?? null)
            : null,
        },
      });
      return;
    }
    this.facade.save({ kind: 'create', input: base });
  }

  protected retryLoad(): void {
    const id = this.id();
    if (id !== undefined) this.facade.load(id);
  }

  protected retryBillingPreview(): void {
    this.updateBillingPreview();
  }

  /** Dias inteiros 1..31 nos dois campos e diferentes dos do cartão: pede a prévia; senão, limpa. */
  private updateBillingPreview(): void {
    const card = this.card();
    const id = this.id();
    const { closingDay, dueDay } = this.form.getRawValue();
    const valid = (day: number | null): day is number =>
      day !== null && Number.isInteger(day) && day >= 1 && day <= MAX_DAY;
    const changed =
      id !== undefined &&
      card !== null &&
      valid(closingDay) &&
      valid(dueDay) &&
      (closingDay !== card.closingDay || dueDay !== card.dueDay);
    this.daysChanged.set(changed);
    this.billing.request(
      id ?? '',
      changed ? { closingDay: closingDay as number, dueDay: dueDay as number } : null,
    );
  }
}
