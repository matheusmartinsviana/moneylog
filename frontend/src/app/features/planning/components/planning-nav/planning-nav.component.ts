import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '~/app/common/i18n/i18n.service';

/** As telas de Planejamento (links, como as abas de Cartões): recorrências, pendentes, resumo, projeções. */
@Component({
  selector: 'app-planning-nav',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    /*
     * Oito abas não cabem numa linha de celular: ficam em UMA linha que rola na horizontal dentro da pílula (regra
     * global de .tabs, com sombra nas pontas) e a aba ativa é trazida para a vista ao abrir a tela.
     */
    .tabs {
      max-width: 100%;
    }
  `,
  template: `
    <nav class="tabs" [attr.aria-label]="t().recurrences.tabsLabel" data-cy="planning-tabs">
      <a
        class="tab"
        routerLink="/planning/overview"
        data-cy="planning-tab-overview"
        [attr.aria-current]="current() === 'overview' ? 'page' : null"
      >
        {{ t().recurrences.tabs.overview }}
      </a>
      <a
        class="tab"
        routerLink="/planning/recurrences"
        data-cy="planning-tab-recurrences"
        [attr.aria-current]="current() === 'recurrences' ? 'page' : null"
      >
        {{ t().recurrences.tabs.recurrences }}
      </a>
      <a
        class="tab"
        routerLink="/planning/occurrences"
        data-cy="planning-tab-pending"
        [attr.aria-current]="current() === 'pending' ? 'page' : null"
      >
        {{ t().recurrences.tabs.pending }}
      </a>
      <a
        class="tab"
        routerLink="/planning/summary"
        data-cy="planning-tab-summary"
        [attr.aria-current]="current() === 'summary' ? 'page' : null"
      >
        {{ t().recurrences.tabs.summary }}
      </a>
      <a
        class="tab"
        routerLink="/planning/projections"
        data-cy="planning-tab-projections"
        [attr.aria-current]="current() === 'projections' ? 'page' : null"
      >
        {{ t().recurrences.tabs.projections }}
      </a>
      <a
        class="tab"
        routerLink="/planning/debts"
        data-cy="planning-tab-debts"
        [attr.aria-current]="current() === 'debts' ? 'page' : null"
      >
        {{ t().recurrences.tabs.debts }}
      </a>
      <a
        class="tab"
        routerLink="/planning/third-parties"
        data-cy="planning-tab-third-parties"
        [attr.aria-current]="current() === 'thirdParties' ? 'page' : null"
      >
        {{ t().recurrences.tabs.thirdParties }}
      </a>
      <a
        class="tab"
        routerLink="/planning/commitments"
        data-cy="planning-tab-commitments"
        [attr.aria-current]="current() === 'commitments' ? 'page' : null"
      >
        {{ t().recurrences.tabs.commitments }}
      </a>
    </nav>
  `,
})
export class PlanningNavComponent {
  protected readonly t = inject(I18nService).t;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      const active = this.host.nativeElement.querySelector<HTMLElement>('[aria-current="page"]');
      active?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    });
  }

  readonly current = input.required<
    | 'overview'
    | 'recurrences'
    | 'pending'
    | 'summary'
    | 'projections'
    | 'debts'
    | 'thirdParties'
    | 'commitments'
  >();
}
