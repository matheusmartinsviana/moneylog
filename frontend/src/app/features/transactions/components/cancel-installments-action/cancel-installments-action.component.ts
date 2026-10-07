import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import type { Problem } from '~/util/api/problem';

/**
 * Ação "Cancelar parcelas restantes" (T70 CA3, presentational): o caminho quando o estorno da compra no
 * cartão está bloqueado por fatura fechada. Abre a confirmação com **motivo obrigatório** (`ConfirmDialog`)
 * e emite o motivo; quem usa chama o backend e troca a compra pela resposta. As falhas (`CARD_NO_INSTALLMENTS_TO_CANCEL`,
 * `TRANSACTION_NOT_CANCELABLE`...) aparecem traduzidas pelo `code`. As parcelas de faturas fechadas não
 * mudam: a explicação manda registrar um reembolso no cartão.
 */
@Component({
  selector: 'app-cancel-installments-action',
  imports: [ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="button"
      data-cy="cancel-installments-open"
      [disabled]="busy()"
      (click)="open.set(true)"
    >
      {{ t().transactions.detail.cancel.action }}
    </button>
    @if (failure(); as message) {
      <p class="banner" role="alert" data-cy="cancel-installments-error">{{ message }}</p>
    }

    <app-confirm-dialog
      [open]="open()"
      [heading]="t().transactions.detail.cancel.title"
      [description]="t().transactions.detail.cancel.description"
      [confirmLabel]="t().transactions.detail.cancel.confirm"
      [requireReason]="true"
      [reasonLabel]="t().transactions.detail.cancel.reasonLabel"
      [reasonMaxLength]="500"
      tone="risk"
      [busy]="busy()"
      (confirmed)="canceled.emit($event)"
      (cancelled)="open.set(false)"
    />
  `,
  styles: `
    :host {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
    }
  `,
})
export class CancelInstallmentsActionComponent {
  protected readonly t = inject(I18nService).t;

  readonly busy = input(false);
  /** Falha do último cancelamento. */
  readonly problem = input<Problem | null>(null);
  /** Sobe a cada cancelamento concluído: fecha a confirmação. */
  readonly doneToken = input(0);
  /** Motivo confirmado no diálogo. */
  readonly canceled = output<string>();

  protected readonly open = signal(false);
  protected readonly failure = computed(() => {
    const problem = this.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  constructor() {
    // Uma falha fecha o diálogo e mostra o motivo (um novo cancelamento pede o motivo de novo).
    effect(() => {
      if (this.problem()) untracked(() => this.open.set(false));
    });
    // Sucesso: quem usa sobe `doneToken` e a confirmação fecha.
    effect(() => {
      if (this.doneToken() > 0) untracked(() => this.open.set(false));
    });
  }
}
