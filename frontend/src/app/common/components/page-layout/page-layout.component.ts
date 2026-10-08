import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
  `,
})
export class PageLayoutComponent {
  readonly heading = input.required<string>();
  readonly description = input<string>();
}
