import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { ToastService } from '~/app/common/services/toast.service';
import { DebtFormComponent } from '~/app/features/quick-add/components/debt-form/debt-form.component';
import type { Category } from '~/modules/categories/core/types/category';
import { DebtFormFacade } from '~/modules/debts/core/facades/debt-form.facade';
import type { Debt, DebtInput } from '~/modules/debts/core/types/debt';
import { type PersonRef } from '~/util/debt';
import { counterpartyName } from '~/util/debt-name';
import { formatMoney } from '~/util/money';

/**
 * "Nova dívida" no `/quick-add` (smart): liga o formulário à facade de dívidas (só existe neste modo, então
 * os demais modos não dependem do módulo). Salvar usa a dívida devolvida pelo backend: o aviso mostra o
 * valor e a pessoa dela e oferece "Ver dívida". O formulário mantém os dados em caso de erro.
 */
@Component({
  selector: 'app-debt-entry',
  imports: [DebtFormComponent],
  providers: [DebtFormFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-debt-form
      [people]="people()"
      [categories]="categories()"
      [createPerson]="createPerson()"
      [defaultPersonId]="defaultPersonId()"
      [saving]="facade.saving()"
      [problem]="facade.problem()"
      [canRetry]="canRetry()"
      [resetToken]="resetToken()"
      [focusToken]="focusToken()"
      (submitted)="facade.save($event)"
      (retry)="facade.retry()"
    />
  `,
})
export class DebtEntryComponent {
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(DebtFormFacade);

  readonly people = input.required<readonly PersonRef[]>();
  readonly categories = input.required<readonly Category[]>();
  readonly createPerson = input<((name: string) => Observable<PersonRef>) | null>(null);
  readonly defaultPersonId = input<string | null>(null);

  protected readonly resetToken = signal(0);
  protected readonly focusToken = signal(0);
  /** Dívida criada (a da resposta): a página recarrega "Receber" se ela é de quem me deve. */
  readonly saved = output<Debt>();
  /** Falha ambígua (rede, 5xx, `CONFLICT`): o "tentar de novo" reenvia com a mesma `Idempotency-Key`. */
  protected readonly canRetry = this.facade.canRetry;

  constructor() {
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe((debt) => {
      this.saved.emit(debt);
      this.resetToken.update((value) => value + 1);
      const copy = this.t().quickAdd.toast;
      this.toast.show(
        interpolate(this.t().lending.debt.toast, {
          amount: formatMoney(debt.principal),
          name: counterpartyName(debt),
        }),
        {
          actions: [
            {
              id: 'view',
              label: copy.viewDebt,
              run: () => void this.router.navigate(['/debts', debt.id]),
            },
            {
              id: 'new',
              label: copy.newEntry,
              run: () =>
                void this.router.navigate(['/quick-add'], { queryParams: { mode: 'debt' } }),
            },
          ],
        },
      );
    });
  }

  protected save(input: DebtInput): void {
    this.facade.save(input);
  }
}
