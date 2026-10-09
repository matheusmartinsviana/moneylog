import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { MonthPickerComponent } from '~/app/common/components/forms/month-picker/month-picker.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { PlanningNavComponent } from '~/app/features/planning/components/planning-nav/planning-nav.component';
import {
  ReceiptPersonOption,
  ThirdPartyReceiptModalComponent,
} from '~/app/features/planning/components/third-party-receipt-modal/third-party-receipt-modal.component';
import { ThirdPartyReceiptFacade } from '~/modules/third-parties/core/facades/third-party-receipt.facade';
import { ThirdPartyReceivablesFacade } from '~/modules/third-parties/core/facades/third-party-receivables.facade';
import type { ThirdPartyItem } from '~/modules/third-parties/core/types/third-party';
import { formatCompetence, formatIsoDate } from '~/util/date';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIN_MONTH = '2000-01';
const MAX_MONTH = '2100-12';

/**
 * Dinheiro a receber de terceiros (smart): por pessoa, o combinado, o recebido e o pendente, e o bloco
 * "gasto bruto x terceiros x líquido do mês" **como o servidor devolve**. Fica separado de patrimônio, renda
 * e despesas pessoais; o front não soma nem recalcula nada. O seletor de mês pede ao servidor.
 */
@Component({
  selector: 'app-third-parties-page',
  imports: [
    DisclosureComponent,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    MonthPickerComponent,
    MoneyComponent,
    PlanningNavComponent,
    ConfirmDialogComponent,
    ThirdPartyReceiptModalComponent,
  ],
  providers: [ThirdPartyReceivablesFacade, ThirdPartyReceiptFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './third-parties.page.html',
  styleUrl: './third-parties.page.css',
})
export class ThirdPartiesPage implements OnInit {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly receivables = inject(ThirdPartyReceivablesFacade);
  protected readonly receipts = inject(ThirdPartyReceiptFacade);
  private readonly toast = inject(ToastService);
  protected readonly receiptOpen = signal(false);
  /** Recebimento que o usuário pediu para remover (aguardando a confirmação). */
  protected readonly pendingRemove = signal<string | null>(null);
  protected readonly removeError = computed(() => {
    const problem = this.receipts.problem();
    return problem && !this.receiptOpen() ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly receiptPeople = computed<readonly ReceiptPersonOption[]>(() =>
    (this.receivables.data()?.people ?? []).map((person) => ({
      id: person.personId,
      name: person.name,
      expenses: person.items
        .filter((item) => item.source === 'EXPENSE')
        .map((item) => ({
          id: item.refId,
          label: item.description ?? this.t().thirdParties.people.noDescription,
        })),
    })),
  );
  protected readonly minMonth = MIN_MONTH;
  protected readonly maxMonth = MAX_MONTH;
  protected readonly picker = new FormControl<string | null>(null);

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly emptyActions = computed<readonly EmptyStateAction[]>(() => [
    {
      id: 'transactions',
      label: this.t().thirdParties.empty.action,
      available: true,
      primary: true,
      link: '/transactions',
    },
  ]);
  protected readonly monthLabel = computed(() => {
    const competence = this.receivables.data()?.month.competence;
    return competence ? formatCompetence(competence, this.locale()) : '';
  });

  constructor() {
    // O mês que o servidor devolveu é o que o seletor mostra (o padrão é o mês atual dele).
    effect(() => {
      const competence = this.receivables.data()?.month.competence ?? null;
      untracked(() => {
        if (competence !== null && MONTH.test(competence)) {
          this.picker.setValue(competence, { emitEvent: false });
        }
      });
    });
    // Falha ao remover: fecha a confirmação e mostra o aviso na página (a lista segue como estava).
    effect(() => {
      if (this.receipts.problem() !== null) untracked(() => this.pendingRemove.set(null));
    });
    this.receipts.removed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.pendingRemove.set(null);
      this.toast.show(this.t().thirdParties.receipts.toast.removed);
      this.receivables.load();
    });
    this.picker.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (
        value !== null &&
        MONTH.test(value) &&
        value !== this.receivables.data()?.month.competence
      ) {
        this.receivables.load(value);
      }
    });
  }

  ngOnInit(): void {
    this.receivables.load(null);
  }

  /** Registrado no modal: relê o a-receber do backend (nada é ajustado no front). */
  protected afterRecorded(): void {
    this.receiptOpen.set(false);
    this.toast.show(this.t().thirdParties.receipts.toast.recorded);
    this.receivables.load();
  }

  protected askRemove(id: string): void {
    this.receipts.clearProblem();
    this.pendingRemove.set(id);
  }

  protected confirmRemove(): void {
    const id = this.pendingRemove();
    if (id !== null) this.receipts.remove(id);
  }

  protected cancelRemove(): void {
    this.pendingRemove.set(null);
  }

  protected openRegister(): void {
    this.receipts.clearProblem();
    this.receiptOpen.set(true);
  }

  protected retry(): void {
    this.receivables.load();
  }

  protected asOf(date: string): string {
    return interpolate(this.t().thirdParties.total.asOf, {
      date: formatIsoDate(date, this.locale(), 'long'),
    });
  }

  protected expected(date: string | null): string | null {
    return date === null
      ? null
      : interpolate(this.t().thirdParties.people.expected, {
          date: formatIsoDate(date, this.locale(), 'long'),
        });
  }

  /** Para onde o item leva: a dívida ou a movimentação marcada (o recebimento a confirmar não tem destino). */
  protected link(item: ThirdPartyItem): readonly string[] | null {
    if (item.source === 'DEBT') return ['/debts', item.refId];
    return item.source === 'EXPENSE' ? ['/transactions', item.refId] : null;
  }
}
