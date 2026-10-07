import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { insightLines } from '~/app/features/ai/insight-text';
import type { Insight } from '~/modules/ai/core/types/ai';

/** Quantos insights o Início mostra; os demais ficam em `/insights`. */
const HOME_LIMIT = 3;

/**
 * O cartão de insight só aparece com dado real: sem nenhum insight traduzível não há o que dizer, e o front
 * **não inventa** uma frase.
 */
export function hasInsight(insights: readonly Insight[]): boolean {
  return insights.length > 0;
}

/**
 * Insights do mês no Início (Etapa 8): frases montadas pela `key` e `params` de `GET /v1/insights`, calculadas
 * pelos dados do usuário e rotuladas "Insight" (não "IA"). "Ver todos" leva a `/insights`; "Perguntar à IA" só
 * fica habilitado com a IA ligada no servidor e pede o diálogo de consentimento (quem hospeda o abre).
 * Presentational.
 */
@Component({
  selector: 'app-insight-card',
  imports: [RouterLink, SectionContainerComponent, IconComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-section-container
      [heading]="t().dashboard.insight.title"
      [description]="t().ai.insights.source"
    >
      <ul class="ic__list" data-cy="home-insight-text">
        @for (line of lines(); track line.id) {
          <li class="ic__text">{{ line.text }}</li>
        }
      </ul>
      <div class="ic__actions">
        <a class="button button--soft" routerLink="/insights" data-cy="home-insight-analysis">
          {{ t().dashboard.insight.viewAll }}
        </a>
        <button
          type="button"
          class="button"
          [attr.aria-disabled]="aiEnabled() ? null : 'true'"
          [appTooltip]="aiEnabled() ? '' : t().dashboard.insight.askAiHint"
          data-cy="home-insight-ask-ai"
          (click)="aiEnabled() && askAi.emit()"
        >
          <app-icon name="sparkle" [size]="16" />
          {{ t().dashboard.insight.askAi }}
        </button>
      </div>
    </app-section-container>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .ic__list {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .ic__text {
      font-size: var(--text-md);
      line-height: var(--leading-normal);
      text-wrap: pretty;
    }

    .ic__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class InsightCardComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly insights = input.required<readonly Insight[]>();
  readonly aiEnabled = input(false);
  readonly askAi = output<void>();

  protected readonly lines = computed(() =>
    insightLines(this.insights(), this.t().ai.insights, HTML_LANG[this.i18n.language()]).slice(
      0,
      HOME_LIMIT,
    ),
  );
}
