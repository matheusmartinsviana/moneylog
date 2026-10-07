import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  ModalRole,
  OverlayLayout,
  OverlayPanelComponent,
} from '~/app/common/components/overlay/overlay-panel.component';

let nextId = 0;

/**
 * Diálogo modal (padrão dialog/alertdialog do APG), composto a partir do `OverlayPanel` (mesma pilha
 * de overlays do `Select`, do calendário e da folha): foco preso, fundo `inert`, rolagem do
 * `body` travada, `Esc` e toque no fundo pedem o fechamento (`closed`), o título é anunciado ao
 * abrir e o foco volta a quem abriu ao fechar. Quem usa controla `open`.
 *
 * - `layout`: `responsive-center` (padrão: folha inferior até 640 px, diálogo central acima),
 *   `center`, `bottom`, `side` ou `responsive-side`.
 * - `dialogRole="alertdialog"` para ações que pedem uma resposta; com `dismissable=false`, `Esc` e o
 *   fundo são ignorados e o "Fechar" some (a resposta é um botão do conteúdo).
 * - Foco inicial: o elemento com `data-autofocus` (campo ou botão seguro); sem ele, o painel.
 * - O conteúdo é projetado e só existe enquanto aberto. Presentational.
 */
@Component({
  selector: 'app-dialog',
  imports: [OverlayPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overlay-panel
      mode="modal"
      [open]="open()"
      [label]="heading()"
      [modalRole]="dialogRole()"
      [layout]="layout()"
      [describedBy]="description() ? descriptionId : null"
      [dismissable]="dismissable()"
      [showClose]="showClose()"
      [scrollBody]="true"
      [cy]="cy()"
      [panelCy]="panelCy()"
      (closed)="closed.emit()"
    >
      @if (open()) {
        <div class="dialog__content">
          @if (description(); as text) {
            <p class="dialog__description" [id]="descriptionId">{{ text }}</p>
          }
          <ng-content />
        </div>
      }
    </app-overlay-panel>
  `,
  styles: `
    :host {
      display: contents;
    }

    .dialog__content {
      display: grid;
      gap: var(--space-4);
      padding: 0 var(--space-5) var(--space-5);
    }

    .dialog__description {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class DialogComponent {
  readonly open = input.required<boolean>();
  /** Título (já traduzido): nome acessível do diálogo. */
  readonly heading = input.required<string>();
  readonly description = input<string>();
  /** Papel do painel (nome distinto de `role`, que ficaria também como atributo do elemento hospedeiro). */
  readonly dialogRole = input<ModalRole>('dialog');
  readonly layout = input<OverlayLayout>('responsive-center');
  readonly dismissable = input(true);
  readonly showClose = input(true);
  /** Prefixo dos `data-cy`: `<cy>-backdrop`, `<cy>-panel`, `<cy>-close`. */
  readonly cy = input('dialog');
  /** `data-cy` do painel, quando precisa diferir de `<cy>-panel`. */
  readonly panelCy = input<string | null>(null);

  /** Pedido de fechamento (`Esc`, toque no fundo, "Fechar"). */
  readonly closed = output<void>();

  protected readonly descriptionId = `dialog-description-${++nextId}`;
}
