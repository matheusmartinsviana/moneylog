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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { EmptyStateComponent } from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { EntityChanges } from '~/app/common/services/entity-changes';
import { ToastService } from '~/app/common/services/toast.service';
import { AccountFormFacade } from '~/modules/accounts/core/facades/account-form.facade';
import { ACCOUNT_TYPES, AccountType } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import { todayIso } from '~/util/date';

/** Códigos de regra que o backend atribui a um campo do formulário. */
const CODE_TO_FIELD = { ACCOUNT_OPENING_LOCKED: 'type' } as const;

/**
 * Criar (`/accounts/new`) e editar (`/accounts/:id/edit`) uma conta. Com `openingEditable: false`,
 * tipo, saldo inicial e data ficam desabilitados com a explicação (T36 CA4). `409 VERSION_CONFLICT`
 * avisa e recarrega. Salvar usa a conta devolvida pela API. Smart: só a facade de negócio (FE 01).
 */
@Component({
  selector: 'app-account-form-page',
  imports: [
    ReactiveFormsModule,
    FormModalComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TextFieldComponent,
    SelectComponent,
    MoneyInputComponent,
    DatePickerComponent,
    DisclosureComponent,
  ],
  providers: [AccountFormFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-form.page.html',
  styleUrl: './account-form.page.css',
})
export class AccountFormPage {
  private readonly router = inject(Router);
  private readonly changes = inject(EntityChanges);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(AccountFormFacade);
  protected readonly currency = ACCOUNT_CURRENCY;

  /** `:id` da rota; ausente em `/accounts/new`. */
  readonly id = input<string>();

  protected readonly editing = computed(() => this.id() !== undefined);
  /** Saldo inicial e data de abertura ficam recolhidos ao criar (omitidos se vazios). */
  protected readonly moreOpen = signal(false);
  protected readonly account = this.facade.account;
  protected readonly locked = computed(() => {
    const account = this.account();
    return this.editing() && account !== null && !account.openingEditable;
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    type: new FormControl<string | null>('CHECKING', { validators: [Validators.required] }),
    institution: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    openingBalance: new FormControl<string | null>(null),
    openingDate: new FormControl<string | null>(null),
  });

  /** Alterações digitadas e não salvas: fechar pede confirmação. */
  protected readonly dirty = dirtySignal(this.form);

  protected readonly typeOptions = computed<readonly ChoiceOption[]>(() =>
    ACCOUNT_TYPES.map((type) => ({ value: type, label: this.t().accounts.types[type] })),
  );

  /** A falha do salvar já foi para os campos (então não precisa do aviso geral)? */
  private readonly fieldHandled = signal(false);

  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || problem.code === 'VERSION_CONFLICT' || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });
  protected readonly conflict = computed(() => this.facade.problem()?.code === 'VERSION_CONFLICT');
  protected readonly loadProblem = computed(() => {
    const state = this.facade.loadStatus();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly notFound = computed(() => this.loadProblem()?.status === 404);

  private fieldProblem = false;
  private readonly formFieldProblem = computed(
    () => this.facade.problem() !== null && this.fieldProblem,
  );

  constructor() {
    // Edição: carrega a conta; a cada versão nova (inclusive depois de um conflito) repõe o formulário.
    effect(() => {
      const id = this.id();
      if (id !== undefined) untracked(() => this.facade.load(id));
    });
    effect(() => {
      const account = this.account();
      if (!account) return;
      untracked(() => {
        this.moreOpen.set(true);
        this.form.setValue({
          name: account.name,
          type: account.type,
          institution: account.institution ?? '',
          openingBalance: account.openingBalance.amount,
          openingDate: account.openingDate,
        });
        this.setOpeningLocked(!account.openingEditable);
      });
    });
    // Falha do salvar: marca os campos que o backend apontou; 409 recarrega a conta.
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
      });
    });

    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((account) => {
      this.toast.show(
        interpolate(
          this.editing() ? this.t().accounts.toast.updated : this.t().accounts.toast.created,
          { name: account.name },
        ),
      );
      this.changes.notify('accounts');
      void this.router.navigate(this.backUrl());
    });
  }

  /** Para onde o modal volta: a lista (criar) ou a página de origem (editar). */
  private backUrl(): string[] {
    return this.editing() ? ['/accounts'] : ['/accounts'];
  }

  /** Fechar sem salvar (já confirmado, se havia alterações). */
  protected close(): void {
    void this.router.navigate(this.backUrl());
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const institution = value.institution.trim() === '' ? null : value.institution.trim();
    const account = this.account();
    const id = this.id();

    if (id !== undefined && account) {
      this.facade.save({
        kind: 'update',
        id,
        input: {
          name: value.name.trim(),
          institution,
          version: account.version,
          // Só leva a abertura quando ela ainda pode ser corrigida (senão, 422 ACCOUNT_OPENING_LOCKED).
          ...(account.openingEditable
            ? {
                type: value.type as AccountType,
                openingBalance: value.openingBalance ?? '0.00',
                openingDate: value.openingDate ?? todayIso(),
              }
            : {}),
        },
      });
      return;
    }
    this.facade.save({
      kind: 'create',
      input: {
        name: value.name.trim(),
        type: value.type as AccountType,
        institution,
        // Vazios são omitidos: o servidor usa saldo zero e a data de hoje.
        ...(value.openingBalance ? { openingBalance: value.openingBalance } : {}),
        ...(value.openingDate ? { openingDate: value.openingDate } : {}),
      },
    });
  }

  protected retryLoad(): void {
    const id = this.id();
    if (id !== undefined) this.facade.load(id);
  }

  private setOpeningLocked(locked: boolean): void {
    for (const name of ['type', 'openingBalance', 'openingDate'] as const) {
      const control = this.form.controls[name];
      if (locked) control.disable({ emitEvent: false });
      else control.enable({ emitEvent: false });
    }
  }
}
