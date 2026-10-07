import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Cartão "Orçamento mensal" (T208, D3 = "em breve"): **nenhum número, nenhuma barra, nenhum botão que finja**.
 * Só diz que os orçamentos por categoria chegam em breve e leva à página `/budgets`, que diz o mesmo. Tom neutro,
 * `aria-disabled`. Presentational.
 */
@Component({
  selector: 'app-budget-card',
  imports: [RouterLink, SectionContainerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container [heading]="t().dashboard.budget.title">
      <div class="bc" aria-disabled="true" data-cy="home-budget">
        <span class="bc__soon">{{ t().dashboard.budget.soon }}</span>
        <p class="bc__text">{{ t().dashboard.budget.description }}</p>
      </div>
      <a class="bc__link" routerLink="/budgets" data-cy="home-budget-link">{{
        t().dashboard.budget.learnMore
      }}</a>
    </app-section-container>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .bc {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
      padding: var(--space-4);
      border-radius: var(--radius-control);
      background-color: var(--color-surface-muted);
      color: var(--color-text-muted);
    }

    .bc__soon {
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .bc__text {
      font-size: var(--text-sm);
    }

    .bc__link {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      min-height: 2.75rem;
      color: var(--color-accent);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      text-decoration: none;
    }

    .bc__link:hover {
      text-decoration: underline;
    }

    .bc__link:focus-visible {
      border-radius: 4px;
      outline: none;
      box-shadow: var(--focus-ring);
    }
  `,
})
export class BudgetCardComponent {
  protected readonly t = inject(I18nService).t;
}
