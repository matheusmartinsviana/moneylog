import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '~/app/common/i18n/i18n.service';

export interface EmptyStateAction {
  /** Identificador estável: vira o `data-cy` e é o valor emitido no clique. */
  readonly id: string;
  readonly label: string;
  /** Ação ainda não implementada: aparece desabilitada com a dica "disponível em breve" (S-33). */
  readonly available: boolean;
  readonly primary?: boolean;
  /** Quando informado, a ação é um link de navegação (sempre disponível). */
  readonly link?: string;
}

export type EmptyStateIllustration = 'log' | 'grid' | 'timeline' | 'document';

let nextId = 0;

/**
 * Estado vazio (DS 01): ilustração abstrata e mínima, título, texto e as ações para começar.
 * Presentational: só `input()`/`output()`; o i18n é usado apenas para a dica de indisponível.
 */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.css',
})
export class EmptyStateComponent {
  protected readonly t = inject(I18nService).t;

  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly actions = input<readonly EmptyStateAction[]>([]);
  readonly illustration = input<EmptyStateIllustration>('log');

  readonly action = output<string>();

  protected readonly headingId = `empty-state-title-${++nextId}`;
  protected readonly hintId = `empty-state-hint-${nextId}`;
  protected readonly hasUnavailable = computed(() =>
    this.actions().some((a) => !a.available && !a.link),
  );

  protected trigger(item: EmptyStateAction): void {
    if (item.available) this.action.emit(item.id);
  }
}
