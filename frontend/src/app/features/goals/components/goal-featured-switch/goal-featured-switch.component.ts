import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Interruptor "Meta em destaque na tela inicial" (presentational). Avisa que só uma meta fica em destaque
 * por vez (marcar esta desmarca a anterior). O estado exibido é o que o pai manda (a resposta do backend);
 * a mudança sai em `changed` e o pai decide (na criação, só guarda a intenção). Interruptor próprio, sem nativo.
 */
@Component({
  selector: 'app-goal-featured-switch',
  imports: [ReactiveFormsModule, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-switch
      [formControl]="control"
      [fieldId]="cy()"
      [label]="t().goals.photos.featured.label"
      [hint]="t().goals.photos.featured.hint"
      [showState]="true"
    />
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `,
})
export class GoalFeaturedSwitchComponent {
  protected readonly t = inject(I18nService).t;

  readonly featured = input.required<boolean>();
  /** Meta arquivada: o interruptor fica inativo. */
  readonly disabled = input(false);
  readonly cy = input('goal-featured');

  readonly changed = output<boolean>();

  protected readonly control = new FormControl(false, { nonNullable: true });

  constructor() {
    effect(() => {
      const featured = this.featured();
      untracked(() => this.control.setValue(featured, { emitEvent: false }));
    });
    effect(() => {
      const disabled = this.disabled();
      untracked(() =>
        disabled
          ? this.control.disable({ emitEvent: false })
          : this.control.enable({ emitEvent: false }),
      );
    });
    // O estado exibido é sempre o do pai (resposta do backend): a mudança só sai como pedido.
    this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.control.setValue(this.featured(), { emitEvent: false });
      this.changed.emit(value);
    });
  }
}
