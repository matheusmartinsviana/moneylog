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
      [class.section--glow]="glow()"
      [class.glass]="glow()"
      [class.glass--strong]="glow()"
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
      border-radius: var(--radius-panel);
    }

    /* Painéis comuns: superfície sólida; os de destaque (glow) recebem o vidro global (.glass). */
    .section:not(.glass) {
      border: var(--border-width) solid var(--color-border);
      background-color: var(--color-surface);
      box-shadow: var(--shadow-1);
    }

    /* Painel em destaque (gráfico): halo lilás por trás, decorativo (token). */
    .section--glow {
      background-image: var(--glass-sheen), var(--gradient-panel-glow);
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
  /** Halo lilás de destaque (gráfico principal). */
  readonly glow = input(false, { transform: booleanAttribute });

  protected readonly headingId = `section-title-${++nextId}`;
}
