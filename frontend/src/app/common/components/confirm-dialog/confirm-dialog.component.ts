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

import { DialogComponent } from '~/app/common/components/dialog/dialog.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

export type ConfirmTone = 'default' | 'risk';

let nextId = 0;

/**
 * Diálogo de confirmação (T32), usado em estornar, arquivar e ações que pedem motivo. Composto
 * sobre o `Dialog` (T164): modal de verdade, foco preso, fundo `inert`, Esc cancela e, ao fechar, o
 * foco volta para quem abriu. Com `requireReason`, o confirmar só habilita com um motivo preenchido.
 * Presentational: quem usa controla `open` e reage a `confirmed`/`cancelled`.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent {
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input<string>();
  readonly requireReason = input(false);
  readonly reasonLabel = input<string>();
  readonly reasonMaxLength = input(200);
  /** `risk` para ações que mudam saldo (ex.: estornar): botão de confirmar em vermelho discreto. */
  readonly tone = input<ConfirmTone>('default');
  /** Ação em andamento: bloqueia os botões para evitar envio duplicado. */
  readonly busy = input(false);

  /** Confirmado; emite o motivo sem espaços nas pontas ('' quando não há motivo). */
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  private readonly uid = ++nextId;
  protected readonly reasonId = `confirm-dialog-reason-${this.uid}`;
  protected readonly reasonHintId = `confirm-dialog-reason-hint-${this.uid}`;

  protected readonly reason = signal('');
  protected readonly canConfirm = computed(
    () => !this.busy() && (!this.requireReason() || this.reason().trim() !== ''),
  );

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.reason.set(''));
    });
  }

  protected onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected confirm(): void {
    if (this.canConfirm()) this.confirmed.emit(this.reason().trim());
  }

  protected cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }
}
