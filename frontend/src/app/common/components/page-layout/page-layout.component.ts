import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Esqueleto de toda página: o landmark `<main>` e o único `<h1>` da tela.
 * O shell não renderiza `<main>`; cada página traz o seu por aqui.
 */
@Component({
  selector: 'app-page-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main-content" class="page" [class.page--wide]="wide()" tabindex="-1" data-cy="page">
      <header class="page__header">
        <div class="page__heading">
          <h1 class="page__title" data-cy="page-title">
            <bdi>{{ heading() }}</bdi>
          </h1>
          @if (description()) {
            <p class="page__description" data-cy="page-description">{{ description() }}</p>
          }
        </div>
        <div class="page__actions">
          <ng-content select="[pageActions]" />
        </div>
      </header>
      <div class="page__content">
        <ng-content />
      </div>
    </main>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      display: grid;
      gap: var(--space-6);
      width: 100%;
      max-width: var(--content-max-width);
      margin: 0 auto;
      padding: var(--space-6) var(--space-4) var(--space-8);
    }

    /* Início: mais largura para a grade de KPIs, gráficos e listas (a janela chega a 90rem). */
    .page--wide {
      max-width: var(--content-wide-max-width);
    }

    .page__header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .page__heading {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .page__description {
      color: var(--color-text-muted);
    }

    .page__actions:empty {
      display: none;
    }

    .page__content {
      display: grid;
      gap: var(--space-4);
      min-width: 0;
    }

    @media (width >= 768px) {
      .page {
        padding: var(--space-10) var(--space-8) var(--space-12);
      }
    }
  `,
})
export class PageLayoutComponent {
  readonly heading = input.required<string>();
  /** Largura maior (Início). */
  readonly wide = input(false, { transform: booleanAttribute });
  readonly description = input<string>();
}
