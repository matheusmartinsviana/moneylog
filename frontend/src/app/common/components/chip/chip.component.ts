import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';

/**
 * Chip (DS 01): rótulo curto em forma de pílula. Três formas:
 * - **alternável** (`pressed` definido): `<button aria-pressed>`; um filtro que liga e desliga (tag da lista);
 * - **removível** (`removeLabel` definido): o texto e um botão "Remover ..." com nome acessível próprio;
 * - **estático** (nenhum dos dois): só informa (tag de uma nota).
 * `count` opcional em números tabulares. O estado nunca é só cor: o alternável ligado também ganha o traço
 * de borda mais forte e o `aria-pressed`. Presentational.
 */
@Component({
  selector: 'app-chip',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pressed() !== null) {
      <button
        type="button"
        class="chip chip--button"
        [class.is-pressed]="pressed()"
        [attr.aria-pressed]="pressed()"
        [attr.data-cy]="cy()"
        (click)="toggled.emit(!pressed())"
      >
        <span class="chip__label">{{ label() }}</span>
        @if (count() !== null) {
          <span class="chip__count num">{{ count() }}</span>
        }
      </button>
    } @else {
      <span class="chip" [attr.data-cy]="cy()">
        <span class="chip__label">{{ label() }}</span>
        @if (count() !== null) {
          <span class="chip__count num">{{ count() }}</span>
        }
        @if (removeLabel(); as remove) {
          <button
            type="button"
            class="chip__remove"
            [attr.aria-label]="remove"
            [attr.data-cy]="cy() + '-remove'"
            (click)="removed.emit()"
            (keydown.backspace)="removed.emit()"
            (keydown.delete)="removed.emit()"
          >
            <app-icon name="close" [size]="14" />
          </button>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      max-width: 100%;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      max-width: 100%;
      min-height: 1.75rem;
      padding: 0 var(--space-3);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-pill);
      background-color: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-sm);
      line-height: var(--leading-tight);
    }

    .chip--button {
      min-height: 2.25rem;
      cursor: pointer;
      transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
    }

    @media (width <= 640px), (pointer: coarse) {
      .chip--button {
        min-height: var(--touch-min);
      }
    }

    .chip--button:hover {
      background-color: var(--color-hover-soft);
    }

    .chip--button:focus-visible,
    .chip__remove:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .chip.is-pressed {
      border-color: var(--color-accent);
      background-color: var(--color-surface-muted);
      box-shadow: inset 0 0 0 1px var(--color-accent);
      font-weight: var(--weight-medium);
    }

    .chip__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chip__count {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .chip__remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      margin-right: calc(var(--space-2) * -1);
      border: 0;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
    }

    .chip__remove:hover {
      color: var(--color-text);
    }

    @media (width <= 640px), (pointer: coarse) {
      .chip--button {
        min-height: 2.75rem;
      }
    }
  `,
})
export class ChipComponent {
  readonly label = input.required<string>();
  /** Definido = alternável (`aria-pressed`). */
  readonly pressed = input<boolean | null>(null);
  readonly count = input<number | null>(null);
  /** Definido = removível; é o nome acessível do botão ("Remover filtro: Alimentação"). */
  readonly removeLabel = input<string>();
  readonly cy = input('chip');

  readonly toggled = output<boolean>();
  readonly removed = output<void>();
}
