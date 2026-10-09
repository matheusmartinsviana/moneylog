import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { MenuComponent, type MenuItem } from '~/app/common/components/menu/menu.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { MAIN_MODES, type QuickAddMode } from '~/app/features/quick-add/quick-add-mode';

/** Atalhos do menu do botão: os modos do Novo registro que o Início oferecia (receita, cartão, "Emprestei"). */
const SHORTCUTS = ['income', 'credit', 'loan'] as const satisfies readonly QuickAddMode[];

/**
 * "+ Registrar" do Início (presentational): o único botão primário da tela. O clique abre o modal de Novo registro
 * (a mesma rota da sidebar) e o menu ao lado abre o mesmo modal já no tipo escolhido (receita, compra no cartão,
 * "Emprestei"). Não grava nada: o formulário é o do modal.
 */
@Component({
  selector: 'app-register-button',
  imports: [RouterLink, IconComponent, MenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rb" data-cy="home-register">
      <a
        class="button button--primary rb__main"
        routerLink="/quick-add"
        data-cy="home-register-open"
      >
        <app-icon name="plus" [size]="18" />
        {{ t().brief.register }}
      </a>
      <app-menu
        fieldId="home-register-menu"
        [label]="t().brief.registerMore"
        icon="chevronDown"
        [items]="items()"
        (selected)="choose($event)"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .rb {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .rb__main {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.75rem;
      padding-inline: var(--space-5);
      text-decoration: none;
    }
  `,
})
export class RegisterButtonComponent {
  private readonly router = inject(Router);
  protected readonly t = inject(I18nService).t;

  protected readonly items = computed<readonly MenuItem[]>(() =>
    SHORTCUTS.map((mode) => ({ id: mode, label: this.t().quickAdd.modes[mode] })),
  );

  protected choose(id: string): void {
    const mode = MAIN_MODES.find((candidate) => candidate === id);
    if (mode) void this.router.navigate(['/quick-add'], { queryParams: { mode } });
  }
}
