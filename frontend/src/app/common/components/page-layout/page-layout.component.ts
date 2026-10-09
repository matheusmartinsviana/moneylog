import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MotionRevealDirective } from '~/app/common/motion/motion-reveal.directive';
import { MotionStaggerDirective } from '~/app/common/motion/motion-stagger.directive';

/**
 * Esqueleto de toda página: o landmark `<main>` e o único `<h1>` da tela.
 * O shell não renderiza `<main>`; cada página traz o seu por aqui.
 */
@Component({
  selector: 'app-page-layout',
  imports: [MotionRevealDirective, MotionStaggerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fit]': 'fit()',
    '[attr.data-fit-page]': "fit() ? '' : null",
  },
  template: `
    <main id="main-content" class="page m-page" tabindex="-1" data-cy="page">
      <header class="page__header" [appReveal]="0">
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
      <div class="page__content" appStagger [appStaggerOffset]="1" data-cy="page-content">
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
      gap: var(--page-gap);
      width: 100%;
      max-width: var(--page-max-width);
      margin: 0 auto;
      padding: var(--page-pad-top) var(--page-gutter) var(--page-pad-bottom);
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
      gap: var(--section-gap);
      min-width: 0;
    }

    /*
     * Página "sucinta" (fit): ocupa só a altura que sobra na janela (sem altura fixa em px) e o conteúdo se
     * reparte nela; o título e a descrição ficam numa linha e a página nunca rola (src/styles/README.md).
     */
    :host(.fit) {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }

    :host(.fit) .page {
      flex: 1 1 auto;
      grid-template-rows: auto minmax(0, 1fr);
      gap: var(--space-3);
      min-height: 0;
      padding-top: var(--space-2);
      padding-bottom: var(--space-3);
    }

    :host(.fit) .page__header {
      flex-wrap: nowrap;
      align-items: center;
    }

    :host(.fit) .page__heading {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 var(--space-3);
    }

    :host(.fit) .page__title {
      font-size: var(--text-xl);
    }

    :host(.fit) .page__description {
      font-size: var(--text-sm);
    }

    @media (width < 30rem) {
      :host(.fit) .page__description {
        display: none;
      }
    }

    :host(.fit) .page__content {
      grid-template-rows: minmax(0, 1fr);
      row-gap: 0; /* só o primeiro item ocupa a linha; folhas e diálogos (altura 0) não somam espaço */
      min-height: 0;
    }
  `,
})
export class PageLayoutComponent {
  readonly heading = input.required<string>();
  readonly description = input<string>();
  /** Página "sucinta": cabe na tela sem rolar a página (a lista principal rola dentro do próprio painel). */
  readonly fit = input(false, { transform: booleanAttribute });
}
