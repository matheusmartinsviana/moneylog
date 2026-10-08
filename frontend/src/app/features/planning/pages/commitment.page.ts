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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import { CommitmentDetailFacade } from '~/modules/commitments/core/facades/commitment-detail.facade';
import {
  COMMITMENT_CURRENCY,
  type CommitmentItem,
} from '~/modules/commitments/core/types/commitment';
import { formatCompetence, formatIsoDate, todayIso } from '~/util/date';
import { formatRatio } from '~/util/ratio';

/**
 * Detalhe do compromisso (`/planning/commitments/:id`, smart): resumo e cronograma **como o servidor
 * calculou**, "marcar parcela paga" (só acompanhamento: nenhuma conta é movimentada) e, no empréstimo de
 * terceiro, "atualizar progresso" (só o que o usuário informa; não há saldo restante). A resposta do
 * backend é o novo estado; conflito de versão relê o compromisso.
 */
@Component({
  selector: 'app-commitment-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FormModalComponent,
    MoneyComponent,
    NumberStepperComponent,
    MoneyInputComponent,
    DatePickerComponent,
    TextFieldComponent,
    PlanningNavComponent,
  ],
  providers: [CommitmentDetailFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commitment.page.html',
  styleUrl: './commitment.page.css',
})
export class CommitmentPage {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(CommitmentDetailFacade);
  protected readonly currency = COMMITMENT_CURRENCY;

  /** `:id` da rota. */
  readonly id = input.required<string>();

  protected readonly commitment = this.facade.commitment;
  protected readonly paying = signal<CommitmentItem | null>(null);
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly payForm = new FormGroup({
    paidOn: new FormControl<string | null>(todayIso()),
  });
  protected readonly payDirty = dirtySignal(this.payForm);
  protected readonly progressForm = new FormGroup({
    installmentsPaid: new FormControl<number | null>(0),
    paidAmount: new FormControl<string | null>(null),
    nextDueDate: new FormControl<string | null>(null),
    notes: new FormControl('', { nonNullable: true }),
  });

  protected readonly notFoundActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'back',
      label: this.t().commitments.detail.back,
      available: true,
      primary: true,
      link: '/planning/commitments',
    },
  ]);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly progressText = computed(() => {
    const value = this.commitment()?.progress ?? null;
    return value === null ? null : formatRatio(value, this.locale());
  });
  protected readonly payDescription = computed(() =>
    interpolate(this.t().commitments.detail.schedule.dialog.description, {
      label: this.paying()?.label ?? '',
    }),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.load(id));
    });
    // A tela de progresso começa com o que o backend devolveu (e acompanha cada resposta nova).
    effect(() => {
      const c = this.commitment();
      untracked(() => {
        if (c === null) return;
        this.progressForm.reset({
          installmentsPaid: c.installmentsPaid ?? 0,
          paidAmount: c.paid?.amount ?? null,
          nextDueDate: c.nextDueDate,
          notes: c.notes ?? '',
        });
      });
    });
    this.facade.changed$.pipe(takeUntilDestroyed()).subscribe(() => {
      const wasPaying = this.paying() !== null;
      this.paying.set(null);
      this.toast.show(
        wasPaying
          ? this.t().commitments.detail.schedule.toast
          : this.t().commitments.detail.progressForm.toast,
      );
    });
  }

  protected retry(): void {
    this.facade.load(this.id());
  }

  protected askPay(item: CommitmentItem): void {
    this.facade.clearProblem();
    this.payForm.reset({ paidOn: todayIso() });
    this.paying.set(item);
  }

  protected closePay(): void {
    if (!this.facade.busy()) this.paying.set(null);
  }

  protected confirmPay(): void {
    const item = this.paying();
    const paidOn = this.payForm.controls.paidOn.value;
    this.payForm.markAllAsTouched();
    if (!item || paidOn === null) return;
    this.facade.payItem(item.position, paidOn);
  }

  protected saveProgress(): void {
    const value = this.progressForm.getRawValue();
    if (this.progressForm.invalid || value.installmentsPaid === null) return;
    this.facade.updateProgress({
      installmentsPaid: value.installmentsPaid,
      paidAmount: value.paidAmount,
      nextDueDate: value.nextDueDate,
      notes: value.notes,
    });
  }

  protected date(value: string): string {
    return formatIsoDate(value, this.locale(), 'long');
  }

  protected month(value: string): string {
    return formatCompetence(value, this.locale());
  }

  protected installments(paid: number | null, total: number | null): string {
    return interpolate(this.t().commitments.row.installments, {
      paid: String(paid ?? 0),
      total: String(total ?? 0),
    });
  }

  protected due(item: CommitmentItem): string {
    return item.dueDate === null
      ? this.t().commitments.detail.schedule.noDate
      : interpolate(this.t().commitments.detail.schedule.due, { date: this.date(item.dueDate) });
  }

  protected paidOn(item: CommitmentItem): string {
    return item.paidOn === null
      ? this.t().commitments.detail.schedule.pending
      : interpolate(this.t().commitments.detail.schedule.paidOn, { date: this.date(item.paidOn) });
  }

  protected markLabel(item: CommitmentItem): string {
    return interpolate(this.t().commitments.detail.schedule.markPaidFor, { label: item.label });
  }
}
