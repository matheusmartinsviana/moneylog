import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/**
 * Bloco de conteúdo em superfície elevada, com título `<h2>` e descrição opcional. `interactive` é para o
 * cartão inteiro que leva a algum lugar: sobe até 2px no hover (só com mouse e movimento permitido, `.lift`).
 */
@Component({
  selector: 'app-section-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.fill]': 'fill()' },
  template: `
    <section
      class="section"
      [class.lift]="interactive()"
      [class.section--glow]="glow()"
      [class.glass]="glow()"
      [class.glass--strong]="glow()"
      [class.section--fill]="fill()"
      [class.section--dense]="dense()"
      [class.section--scroll]="scroll()"
      [attr.aria-labelledby]="headingId"
      data-cy="section"
    >
      <header class="section__header">
        <div class="section__heading">
          <h2 class="section__title" [id]="headingId">{{ heading() }}</h2>
          @if (description()) {
            <p class="section__description">{{ description() }}</p>
          }
        </div>
        <div class="section__actions">
          <ng-content select="[sectionActions]" />
        </div>
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

    /* Preenche a altura do pai (telas "sucintas"): o corpo reparte o que sobra, sem altura fixa em px. */
    :host(.fill) {
      height: 100%;
      min-height: 0;
    }

    /* Denso (telas "sucintas"): menos respiro e título menor; o resto é igual. */
    .section--dense {
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
    }

    .section--dense .section__title {
      font-size: var(--text-md);
    }

    .section--dense .section__body {
      gap: var(--space-2);
    }

    /* Denso e estreito (celular): o título fica só para leitores de tela e o controle sobe para a linha dele. */
    @container (width < 40rem) {
      .section--dense .section__title {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    .section--fill {
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
    }

    .section--fill .section__body {
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
    }

    /* Conteúdo mais alto que o painel rola dentro dele (barra fina do app), não a página. */
    .section--fill.section--scroll .section__body {
      position: relative;
      grid-template-rows: none;
      overflow-y: auto;
    }

    /* O box-shadow de .section empata em especificidade com .lift:hover e vence por ordem. */
    @media (hover: hover) {
      .section.lift:hover {
        box-shadow: var(--shadow-2);
      }
    }

    .section__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2) var(--space-3);
    }

    .section__heading {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .section__actions:empty {
      display: none;
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
  /** Ocupa a altura do pai e dá ao corpo o que sobra (páginas "sucintas"). */
  readonly fill = input(false, { transform: booleanAttribute });
  /** Com `fill`, o corpo rola dentro do painel quando o conteúdo é mais alto que o espaço. */
  readonly scroll = input(false, { transform: booleanAttribute });
  /** Espaçamento e título menores (telas "sucintas"); em tela estreita o título só fica para leitores de tela. */
  readonly dense = input(false, { transform: booleanAttribute });

  protected readonly headingId = `section-title-${++nextId}`;
}
