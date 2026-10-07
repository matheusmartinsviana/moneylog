import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import type { Problem } from '~/util/api/problem';

/**
 * Estado de erro de carregamento (FE 02): título, a mensagem do `code` e "tentar de novo". Presentational.
 * `role="alert"` para o leitor de tela anunciar a falha.
 */
@Component({
  selector: 'app-error-state',
  imports: [EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="alert" data-cy="error-state">
      <app-empty-state
        [heading]="t().errors.load.title"
        [description]="description()"
        [actions]="actions()"
        (action)="retry.emit()"
        illustration="document"
      />
    </div>
  `,
})
export class ErrorStateComponent {
  protected readonly t = inject(I18nService).t;

  readonly problem = input<Problem | null>(null);
  readonly retry = output<void>();

  protected readonly description = computed(() => {
    const problem = this.problem();
    return problem ? problemMessage(problem, this.t().errors) : this.t().errors.load.description;
  });

  protected readonly actions = computed<readonly EmptyStateAction[]>(() => [
    { id: 'retry', label: this.t().errors.load.retry, available: true, primary: true },
  ]);
}
