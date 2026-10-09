import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';

/**
 * Botão "Adicionar fotos" (ADR-018): abre o seletor de arquivos do sistema e entrega **vários** arquivos.
 * Mesma exceção nativa do `FilePicker` (FE-S-119): o seletor é do sistema operacional e não tem substituto,
 * então o `<input type="file">` fica **escondido** (`hidden`, fora da tabulação e da árvore de acessibilidade)
 * e é acionado pelo clique do botão próprio (um gesto do usuário, o que o iOS exige). A guarda de controles
 * nativos só aceita esse `input` neste arquivo. Não valida nada: quem usa decide (o servidor, em última instância).
 * Presentational.
 */
@Component({
  selector: 'app-files-button',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #native
      type="file"
      hidden
      multiple
      tabindex="-1"
      aria-hidden="true"
      [attr.accept]="accept() ?? null"
      [attr.data-cy]="cy() + '-native'"
      (change)="onNative($event)"
    />
    <button
      type="button"
      class="button"
      [disabled]="disabled()"
      [attr.data-cy]="cy()"
      (click)="open()"
    >
      <app-icon [name]="icon()" [size]="18" />
      {{ label() }}
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .button {
      gap: var(--space-2);
    }
  `,
})
export class FilesButtonComponent {
  readonly label = input.required<string>();
  readonly cy = input.required<string>();
  /** Atributo `accept` (`.jpg,.jpeg,.png`). */
  readonly accept = input<string>();
  readonly disabled = input(false);
  readonly icon = input<'image' | 'plus'>('image');

  /** Arquivos escolhidos (um ou vários). */
  readonly picked = output<File[]>();

  private readonly native = viewChild.required<ElementRef<HTMLInputElement>>('native');

  /** Só chamar de dentro de um clique (gesto do usuário). */
  open(): void {
    if (!this.disabled()) this.native().nativeElement.click();
  }

  protected onNative(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Permite escolher o mesmo arquivo de novo.
    input.value = '';
    if (files.length > 0) this.picked.emit(files);
  }
}
