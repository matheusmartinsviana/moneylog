import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Container de modal para formulários de cadastro (criar/editar), montado por rotas-filhas da lista:
 * a URL (`/accounts/new`) continua sendo o deep link e a lista fica atrás. Compõe o `Sheet`
 * (folha inferior no celular, diálogo central no desktop): `role=dialog` com o título como nome,
 * foco preso, `Esc` e fundo pedem o fechamento, e o foco volta ao gatilho ao destruir.
 *
 * Com `dirty`, qualquer pedido de fechamento (Esc, fundo, X, "Cancelar" via `requestClose()`) abre o
 * `ConfirmDialog` "Descartar as alterações?" antes de emitir `closed`. Quem usa navega de volta em
 * `closed`. Presentational.
 */
@Component({
  selector: 'app-form-modal',
  imports: [SheetComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      cy="form-modal"
      [open]="true"
      [heading]="heading()"
      [dismissable]="!busy()"
      (closed)="requestClose()"
    >
      <ng-content />
    </app-sheet>
    <app-confirm-dialog
      [open]="confirming()"
      [heading]="t().form.discard.title"
      [description]="t().form.discard.description"
      [confirmLabel]="t().form.discard.confirm"
      [cancelLabel]="t().form.discard.stay"
      tone="risk"
      (confirmed)="discard()"
      (cancelled)="confirming.set(false)"
    />
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class FormModalComponent {
  protected readonly t = inject(I18nService).t;

  /** Título (já traduzido): nome acessível do diálogo. */
  readonly heading = input.required<string>();
  /** Há alterações não salvas: fechar pede confirmação. */
  readonly dirty = input(false);
  /** Salvando: bloqueia o fechamento por Esc e fundo. */
  readonly busy = input(false);

  /** Fechamento confirmado (sem alterações, ou descartadas): navegue de volta. */
  readonly closed = output<void>();

  protected readonly confirming = signal(false);

  /** Pedido de fechar (também chamável pelo "Cancelar" do formulário via template ref). */
  requestClose(): void {
    if (this.busy()) return;
    if (this.dirty()) this.confirming.set(true);
    else this.closed.emit();
  }

  protected discard(): void {
    this.confirming.set(false);
    this.closed.emit();
  }
}
