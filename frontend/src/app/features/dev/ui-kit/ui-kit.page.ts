import { ChangeDetectionStrategy, Component } from '@angular/core';

import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { UiKitMatrixComponent } from '~/app/features/dev/ui-kit/ui-kit-matrix.component';

/**
 * UI Kit (`/dev/ui-kit`): cada componente de base em todos os estados e nos dois temas, para revisão
 * visual e testes de acessibilidade. Só existe nos builds de desenvolvimento e mock (ver
 * `config/dev-routes.dev.ts`); é uma ferramenta de quem desenvolve, por isso os textos ficam
 * aqui e não no contrato de i18n do produto. Os painéis (calendário, listas) abrem com o tema do
 * app, não o da coluna: troque o tema em Configurações para vê-los no outro.
 */
@Component({
  selector: 'app-ui-kit-page',
  imports: [PageLayoutComponent, SectionContainerComponent, UiKitMatrixComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout
      heading="UI Kit"
      description="Componentes de base em todos os estados, nos dois temas. Só em desenvolvimento."
    >
      <!-- Cartão que leva a algum lugar: o único cartão interativo do app hoje (as telas da fatia C o usarão). -->
      <app-section-container
        class="kit-lift"
        heading="Cartão interativo"
        description="Passe o mouse: sobe até 2 px e ganha sombra."
        interactive
        data-cy="ui-kit-lift-card"
      >
        <p>Só com mouse e movimento permitido.</p>
      </app-section-container>
      <div class="kit-themes" data-cy="ui-kit">
        <app-ui-kit-matrix scope="light" />
        <app-ui-kit-matrix scope="dark" />
      </div>
    </app-page-layout>
  `,
  styles: `
    .kit-lift {
      margin-bottom: var(--space-6);
    }

    .kit-themes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
      gap: var(--space-6);
      align-items: start;
    }
  `,
})
export class UiKitPage {}
