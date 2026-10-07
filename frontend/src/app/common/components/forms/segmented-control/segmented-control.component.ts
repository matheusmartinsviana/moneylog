import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

import {
  ChoiceOption,
  edgeEnabled,
  nextEnabled,
} from '~/app/common/components/forms/choice-option';
import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';

/**
 * Controle segmentado (T32) para escolher um entre poucos modos (ex.: Despesa · Pix · Débito ·
 * Receita · Transferência). Semântica de grupo de rádio (WAI-ARIA APG): Tab entra no item marcado,
 * as setas, Home e End movem e marcam, Enter e Espaço marcam o item com foco.
 */
@Component({
  selector: 'app-segmented-control',
  imports: [FieldErrorComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SegmentedControlComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => SegmentedControlComponent),
      multi: true,
    },
  ],
  templateUrl: './segmented-control.component.html',
  styleUrl: './segmented-control.component.css',
})
export class SegmentedControlComponent extends FieldControl<string | null> implements Validator {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<readonly ChoiceOption[]>();
  readonly mandatory = input(true);
  /** Esconde o rótulo visualmente (ele continua sendo o nome acessível do grupo). */
  readonly hideLabel = input(false);

  protected readonly value = signal<string | null>(null);

  /** Item que recebe o Tab: o marcado ou, sem marcação, o primeiro habilitado. */
  protected readonly tabStop = computed(() => {
    const options = this.options();
    const selected = options.find((o) => o.value === this.value() && !o.disabled);
    return selected?.value ?? options[edgeEnabled(options, 'first')]?.value ?? null;
  });

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  validate(): ValidationErrors | null {
    return this.mandatory() && this.value() === null ? { required: true } : null;
  }

  protected optionId(option: ChoiceOption): string {
    return `${this.controlId()}-${option.value}`;
  }

  protected select(option: ChoiceOption): void {
    if (option.disabled || this.disabled() || option.value === this.value()) return;
    this.value.set(option.value);
    this.onChange(option.value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    const current = options.findIndex((o) => o.value === this.tabStop());
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = nextEnabled(options, current, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        target = nextEnabled(options, current, -1);
        break;
      case 'Home':
        target = edgeEnabled(options, 'first');
        break;
      case 'End':
        target = edgeEnabled(options, 'last');
        break;
      default:
        return;
    }
    event.preventDefault();
    const option = options[target];
    if (!option || this.disabled()) return;
    this.select(option);
    this.host.nativeElement
      .querySelector<HTMLElement>(`#${CSS.escape(this.optionId(option))}`)
      ?.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.onTouched();
  }
}
