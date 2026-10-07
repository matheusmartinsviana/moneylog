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
import type { VoidBlockedBy } from '~/modules/transactions/core/types/transaction-enums';
import type { Problem } from '~/util/api/problem';

/** Falhas de estorno que repetem o motivo de `voidBlockedBy` (S-88, S-89, S-122). */
const BLOCKED_BY_CODE: Readonly<Record<string, VoidBlockedBy>> = {
  ACCOUNT_ARCHIVED: 'ACCOUNT_ARCHIVED',
  TRANSACTION_HAS_ACTIVE_REFUNDS: 'HAS_ACTIVE_REFUNDS',
  TRANSACTION_IN_CLOSED_INVOICE: 'TRANSACTION_IN_CLOSED_INVOICE',
};

/**
 * Ação "Estornar" (presentational). Com `voidable`, abre o diálogo com motivo obrigatório e emite o
 * motivo; sem `voidable`, fica desabilitada com o texto de `voidBlockedBy` (traduzido por `code`,
 * nunca por mensagem do backend; `TRANSACTION_IN_CLOSED_INVOICE` explica que o caminho é cancelar as
 * parcelas restantes). Os `422` equivalentes mostram o mesmo texto. Sem `voidBlockedBy`
 * (ex.: já estornada), não mostra nada.
 */
@Component({
  selector: 'app-void-action',
  imports: [ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (voidable()) {
      <button
        type="button"
        class="button"
        data-cy="void-open"
        [disabled]="busy()"
        (click)="open.set(true)"
      >
        {{ t().transactions.detail.void.action }}
      </button>
    } @else if (blockedText(); as text) {
      <button
        type="button"
        class="button"
        data-cy="void-open"
        aria-disabled="true"
        aria-describedby="void-blocked-hint"
        (click)="$event.preventDefault()"
      >
        {{ t().transactions.detail.void.action }}
      </button>
      <p class="hint" id="void-blocked-hint" data-cy="void-blocked">{{ text }}</p>
    }
    @if (failure(); as message) {
      <p class="banner" role="alert" data-cy="void-error">{{ message }}</p>
    }

    <app-confirm-dialog
      [open]="open()"
      [heading]="t().transactions.detail.void.title"
      [description]="t().transactions.detail.void.description"
      [confirmLabel]="t().transactions.detail.void.confirm"
      [requireReason]="true"
      [reasonLabel]="t().transactions.detail.void.reasonLabel"
      [reasonMaxLength]="500"
      tone="risk"
      [busy]="busy()"
      (confirmed)="voided.emit($event)"
      (cancelled)="open.set(false)"
    />
  `,
  styles: `
    :host {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
    }

    .hint {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class VoidActionComponent {
  protected readonly t = inject(I18nService).t;

  readonly voidable = input.required<boolean>();
  readonly blockedBy = input<VoidBlockedBy | null>(null);
  readonly busy = input(false);
  /** Falha do último estorno. */
  readonly problem = input<Problem | null>(null);
  /** Motivo confirmado no diálogo. */
  readonly voided = output<string>();

  protected readonly open = signal(false);

  protected readonly blockedText = computed(() => {
    const reason = this.blockedBy();
    return reason ? this.t().transactions.detail.void.blocked[reason] : null;
  });

  protected readonly failure = computed(() => {
    const problem = this.problem();
    if (!problem) return null;
    const reason = BLOCKED_BY_CODE[problem.code];
    return reason
      ? this.t().transactions.detail.void.blocked[reason]
      : problemMessage(problem, this.t().errors);
  });

  constructor() {
    // Uma falha fecha o diálogo e mostra o motivo; o que foi digitado some com ele (um novo estorno
    // pede o motivo de novo).
    effect(() => {
      if (this.problem()) untracked(() => this.open.set(false));
    });
  }
}
