import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import {
  MODE_GROUPS,
  QUICK_ADD_MODES,
  QuickAddMode,
} from '~/app/features/quick-add/quick-add-mode';

/**
 * Seletor de tipo do `/quick-add` (presentational): um único `app-select` com opções agrupadas
 * (Gastos, Entradas, Entre contas, Pessoas, Outros). Quem manda no modo é a URL (`?mode=`).
 */
@Component({
  selector: 'app-mode-switch',
  imports: [ReactiveFormsModule, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mode-switch.component.html',
  styleUrl: './mode-switch.component.css',
})
export class ModeSwitchComponent {
  protected readonly t = inject(I18nService).t;

  readonly mode = input.required<QuickAddMode>();
  readonly modeChange = output<QuickAddMode>();

  protected readonly control = new FormControl<string | null>(null);

  protected readonly options = computed<readonly ChoiceOption[]>(() => {
    const copy = this.t().quickAdd.modes;
    return MODE_GROUPS.flatMap((group) =>
      group.modes.map((mode) => ({
        value: mode,
        label: copy[mode],
        group: copy.groups[group.key],
      })),
    );
  });

  constructor() {
    effect(() => {
      const mode = this.mode();
      untracked(() => this.control.setValue(mode, { emitEvent: false }));
    });
    this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const mode = QUICK_ADD_MODES.find((candidate) => candidate === value);
      if (mode) this.modeChange.emit(mode);
    });
  }
}
