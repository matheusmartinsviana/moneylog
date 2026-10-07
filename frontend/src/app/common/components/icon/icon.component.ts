import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconName, ICONS } from '~/app/common/components/icon/icons';

/**
 * Ícone decorativo de traço fino. Fica oculto para leitores de tela: o rótulo acessível é sempre
 * o texto do controle que o contém.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [attr.data-icon]="name()"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);

  protected readonly paths = computed(() => ICONS[this.name()]);
}
