import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { CardClosingFacade } from '~/modules/cards/core/facades/card-closing.facade';
import type { Card } from '~/modules/cards/core/types/card';

/**
 * "Confirmar fechamento" (modal): mostra o dia de fechamento e o de vencimento que estão salvos e
 * pergunta se batem com o documento do cartão. Confirmar chama o `POST closing-confirmation` e usa o cartão
 * da resposta. Se os dias estão errados, o caminho é "Ajustar os dias" (edição do cartão, com a prévia).
 */
@Component({
  selector: 'app-closing-confirm-modal',
  imports: [FormModalComponent, RouterLink],
  providers: [CardClosingFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-modal
      #modal
      [heading]="t().cards.closing.modalTitle"
      [busy]="facade.saving()"
      (closed)="closed.emit()"
    >
      <div class="body" data-cy="closing-modal">
        <p class="hint">{{ t().cards.closing.modalDescription }}</p>
        <dl class="days">
          <div>
            <dt>{{ t().cards.form.closingDay }}</dt>
            <dd data-cy="closing-modal-closing">{{ dayText(card().closingDay) }}</dd>
          </div>
          <div>
            <dt>{{ t().cards.form.dueDay }}</dt>
            <dd data-cy="closing-modal-due">{{ dayText(card().dueDay) }}</dd>
          </div>
        </dl>
        <p class="hint">{{ t().cards.closing.hint }}</p>
        @if (banner(); as message) {
          <p class="banner" role="alert" data-cy="closing-modal-error">{{ message }}</p>
        }
        <div class="actions">
          <a
            class="button"
            data-cy="closing-modal-edit"
            [routerLink]="['/cards', card().id, 'edit']"
          >
            {{ t().cards.closing.adjust }}
          </a>
          <button
            type="button"
            class="button"
            data-cy="closing-modal-cancel"
            [disabled]="facade.saving()"
            (click)="modal.requestClose()"
          >
            {{ t().cards.form.cancel }}
          </button>
          <button
            type="button"
            class="button button--primary"
            data-cy="closing-modal-confirm"
            [disabled]="facade.saving()"
            [attr.aria-busy]="facade.saving()"
            (click)="facade.confirm(card().id, card().version)"
          >
            {{ facade.saving() ? t().cards.closing.confirming : t().cards.closing.confirm }}
          </button>
        </div>
      </div>
    </app-form-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .body {
      display: grid;
      gap: var(--space-4);
    }

    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .days {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      margin: 0;
    }

    .days dt {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .days dd {
      margin: 0;
      font-weight: var(--weight-medium);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class ClosingConfirmModalComponent {
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(CardClosingFacade);

  readonly card = input.required<Card>();
  readonly closed = output<void>();
  /** Confirmado (cartão do backend): quem usa relê e avisa. */
  readonly confirmed = output<Card>();

  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  constructor() {
    this.facade.confirmed$
      .pipe(takeUntilDestroyed())
      .subscribe((card) => this.confirmed.emit(card));
  }

  protected dayText(day: number): string {
    return interpolate(this.t().cards.form.dayValue, { day: String(day) });
  }
}
