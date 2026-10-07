import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/**
 * Bloco de conteúdo em superfície elevada, com título `<h2>` e descrição opcional. `interactive` é para o
 * cartão inteiro que leva a algum lugar: sobe até 2px no hover (só com mouse e movimento permitido, `.lift`).
 */
@Component({
  selector: 'app-section-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="section"
      [class.lift]="interactive()"
      [attr.aria-labelledby]="headingId"
      data-cy="section"
    >
      <header class="section__header">
        <h2 class="section__title" [id]="headingId">{{ heading() }}</h2>
        @if (description()) {
          <p class="section__description">{{ description() }}</p>
        }
      </header>
      <div class="section__body">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .section {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-5);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
      box-shadow: var(--shadow-1);
    }

    /* O box-shadow de .section empata em especificidade com .lift:hover e vence por ordem. */
    @media (hover: hover) {
      .section.lift:hover {
        box-shadow: var(--shadow-2);
      }
    }

    .section__header {
      display: grid;
      gap: var(--space-1);
    }

    .section__description {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .section__body {
      display: grid;
      gap: var(--space-4);
    }
  `,
})
export class SectionContainerComponent {
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly interactive = input(false, { transform: booleanAttribute });

  protected readonly headingId = `section-title-${++nextId}`;
}
