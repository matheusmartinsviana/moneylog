import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DialogComponent } from '~/app/common/components/dialog/dialog.component';

/**
 * Folha (FE-S-116): painel modal ancorado embaixo da tela até 640 px (cantos de 18 px no topo,
 * até 90 `dvh`, rolagem interna, respeita a área segura e o teclado virtual) e, em tela larga, um
 * painel central ou lateral (`desktop`). É um `Dialog` (mesmo `OverlayPanel`), então tem o mesmo
 * contrato: foco preso, fundo `inert`, `Esc`, foco devolvido, botão "Fechar".
 */
@Component({
  selector: 'app-sheet',
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog
      [open]="open()"
      [heading]="heading()"
      [description]="description()"
      [layout]="layout()"
      [dismissable]="dismissable()"
      [cy]="cy()"
      (closed)="closed.emit()"
    >
      <ng-content />
    </app-dialog>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class SheetComponent {
  readonly open = input.required<boolean>();
  readonly heading = input.required<string>();
  readonly description = input<string>();
  /** Em tela larga: painel `center` (padrão) ou `side` (lateral direito). */
  readonly desktop = input<'center' | 'side'>('center');
  readonly dismissable = input(true);
  readonly cy = input('sheet');
  readonly closed = output<void>();

  protected readonly layout = computed(() =>
    this.desktop() === 'side' ? ('responsive-side' as const) : ('responsive-center' as const),
  );
}
