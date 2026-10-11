import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import type { IconName } from '~/app/common/components/icon/icons';
import { OverlayPanelComponent } from '~/app/common/components/overlay/overlay-panel.component';
import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';

/** Item do `Menu`. `checked` definido faz dele um `menuitemcheckbox` (o menu continua aberto). */
export interface MenuItem {
  /** Identificador devolvido em `selected` e sufixo do `data-cy` (`<fieldId>-item-<id>`). */
  readonly id: string;
  /** Texto já traduzido. Um item destrutivo precisa dizer a ação no texto ("Excluir"), não só na cor. */
  readonly label: string;
  readonly disabled?: boolean;
  /** Ação que desfaz dados ou muda saldo: estilo de risco. */
  readonly destructive?: boolean;
  readonly checked?: boolean;
  /** Ícone à esquerda do rótulo (decorativo). */
  readonly icon?: IconName;
}

let nextId = 0;

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Menu de ações (padrão menu button do APG): um botão (`aria-haspopup="menu"`) que abre uma lista
 * `role="menu"`. `Enter`, `Espaço` e `↓` abrem e focam o primeiro item (`↑`, o último); `↑`/`↓`
 * andam em círculo, `Home`/`End`, digitar pula ao item que começa com as letras, `Esc` fecha e
 * devolve o foco ao botão, `Tab` fecha. Itens desabilitados são pulados. Em tela compacta (até
 * 640 px) abre como folha inferior (mesmo `OverlayPanel`), com alvos de 44 px.
 * `selected` emite o `id` do item depois de fechar e devolver o foco ao botão, de modo que a
 * ação escolhida (abrir um diálogo, por exemplo) já encontra o foco no lugar certo.
 * Presentational.
 */
@Component({
  selector: 'app-menu',
  imports: [IconComponent, OverlayPanelComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu" #wrapper>
      <button
        #trigger
        type="button"
        class="menu__trigger"
        aria-haspopup="menu"
        [class.menu__trigger--text]="showLabel()"
        [class.menu__trigger--avatar]="avatar()"
        [class.menu__trigger--rail]="variant() === 'rail'"
        [class.is-active]="active()"
        [class.is-open]="open()"
        [id]="triggerId"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? menuId : null"
        [attr.aria-label]="showLabel() ? null : label()"
        [attr.data-cy]="fieldId()"
        [disabled]="disabled()"
        [appTooltip]="variant() === 'rail' && !open() ? label() : null"
        appTooltipSide="end"
        [appTooltipDescribes]="false"
        (click)="toggle('first')"
        (keydown)="onTriggerKeydown($event)"
      >
        @if (showLabel()) {
          <span>{{ label() }}</span>
          <app-icon class="menu__chevron" name="chevronDown" [size]="16" />
        } @else {
          <app-icon [name]="icon()" [size]="20" />
        }
      </button>

      <app-overlay-panel
        [open]="open()"
        [anchor]="anchor()"
        [label]="label()"
        [popoverRole]="null"
        [align]="align()"
        [placement]="variant() === 'rail' ? 'inline' : 'block'"
        [cy]="fieldId() + '-panel'"
        (closed)="close()"
      >
        @if (open()) {
          <div
            class="menu__list"
            role="menu"
            [id]="menuId"
            [attr.aria-label]="label()"
            [attr.data-cy]="fieldId() + '-menu'"
          >
            @for (item of items(); track item.id; let i = $index) {
              <button
                type="button"
                class="menu__item"
                tabindex="-1"
                [class.menu__item--destructive]="item.destructive"
                [class.menu__item--check]="hasChecks()"
                [attr.role]="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
                [attr.aria-checked]="item.checked === undefined ? null : item.checked"
                [attr.aria-disabled]="item.disabled || null"
                [attr.data-autofocus]="i === startIndex() ? '' : null"
                data-menu-item
                [attr.data-cy]="fieldId() + '-item-' + item.id"
                (click)="choose(item)"
                (keydown)="onMenuKeydown($event)"
              >
                @if (item.icon) {
                  <app-icon class="menu__icon" [name]="item.icon" [size]="18" />
                }
                @if (hasChecks()) {
                  <span class="menu__check" aria-hidden="true">
                    @if (item.checked) {
                      <app-icon name="check" [size]="16" />
                    }
                  </span>
                }
                <span class="menu__label">{{ item.label }}</span>
              </button>
            }
          </div>
        }
      </app-overlay-panel>
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
      min-width: 0;
    }

    .menu__trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-width: 2.75rem;
      min-height: 2.75rem;
      padding: 0 var(--space-3);
      border: var(--border-width) solid transparent;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
      -webkit-tap-highlight-color: transparent;
    }

    /* Avatar genérico (DS 02): círculo em tinta de acento; não leva nome nem foto (D4). */
    .menu__trigger--avatar {
      min-width: 2.75rem;
      width: 2.75rem;
      min-height: 2.75rem;
      height: 2.75rem;
      padding: 0;
      border-color: var(--color-border);
      border-radius: var(--radius-icon);
      background-color: var(--color-accent-soft);
      color: var(--color-accent);
    }

    .menu__trigger--avatar:hover:not(:disabled),
    .menu__trigger--avatar.is-open {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }

    /* Trilho lateral (sidebar): quadrado de ícone igual aos itens do trilho; ativo = indicador deslizante atrás. */
    .menu__trigger--rail {
      width: 2.5rem;
      min-width: 2.5rem;
      height: 2.5rem;
      min-height: 2.5rem;
      padding: 0;
      border-color: var(--color-border);
      border-radius: var(--radius-icon);
      background-color: var(--color-surface-inset);
      color: var(--color-text);
    }

    @media (pointer: coarse) {
      .menu__trigger--rail {
        width: var(--touch-min);
        min-width: var(--touch-min);
        height: var(--touch-min);
        min-height: var(--touch-min);
      }
    }

    .menu__trigger--rail.is-active {
      border-color: transparent;
      background-color: transparent;
      color: var(--color-on-accent);
    }

    .menu__trigger--rail.is-active:hover:not(:disabled),
    .menu__trigger--rail.is-active.is-open {
      border-color: transparent;
      background-color: transparent;
      background-image: none;
      color: var(--color-on-accent);
    }

    .menu__trigger--rail:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .menu__icon {
      flex: none;
      color: var(--color-text-muted);
    }

    .menu__trigger--text {
      border-color: var(--color-control-border);
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    .menu__trigger:hover:not(:disabled),
    .menu__trigger.is-open {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }

    /* Trilho: o quadrado segue opaco; o hover só põe uma película azul por cima (igual aos links do trilho). */
    .menu__trigger--rail:hover:not(:disabled),
    .menu__trigger--rail.is-open {
      border-color: var(--color-hover-border);
      background-color: var(--color-surface-inset);
      background-image: var(--gradient-hover);
    }

    .menu__trigger:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .menu__chevron {
      color: var(--color-text-muted);
    }

    .menu__list {
      display: flex;
      flex-direction: column;
      min-width: 12rem;
      padding: var(--space-1);
      overflow-y: auto;
    }

    .menu__item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      min-height: 2.25rem;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: calc(var(--radius-control) - 2px);
      background: transparent;
      color: var(--color-text);
      font-size: var(--text-sm);
      text-align: left;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }

    @media (width <= 640px), (pointer: coarse) {
      .menu__item {
        min-height: var(--touch-min);
      }
    }

    .menu__item:hover:not([aria-disabled='true']),
    .menu__item:focus-visible {
      background-color: var(--color-hover-soft);
    }

    .menu__item[aria-disabled='true'] {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .menu__item--destructive {
      color: var(--color-risk);
    }

    .menu__label {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .menu__check {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1rem;
      height: 1rem;
      color: var(--color-accent);
    }

    @media (width <= 640px), (pointer: coarse) {
      .menu__trigger--avatar {
        width: 2.75rem;
        height: 2.75rem;
        min-height: 2.75rem;
      }

      .menu__item {
        min-height: 2.75rem;
        font-size: var(--text-md);
      }

      .menu__list {
        min-width: 0;
      }
    }

    @media (forced-colors: active) {
      .menu__item:focus-visible {
        outline: 2px solid Highlight;
      }
    }
  `,
})
export class MenuComponent {
  private readonly injector = inject(Injector);

  /** Nome do menu (e do botão, quando só mostra o ícone). Já traduzido. */
  readonly label = input.required<string>();
  /** Base do `data-cy`: o botão é `<fieldId>`, os itens `<fieldId>-item-<id>`. */
  readonly fieldId = input.required<string>();
  readonly items = input.required<readonly MenuItem[]>();
  /** Ícone do botão quando não mostra o `label` (padrão: "mais"). */
  readonly icon = input<IconName>('more');
  /** Botão redondo de avatar genérico (menu do perfil), em vez de botão de ícone. */
  readonly avatar = input(false);
  /** Mostra o `label` (com seta) no botão, em vez do ícone de "mais". */
  readonly showLabel = input(false);
  /** `rail`: botão quadrado do trilho da sidebar; o painel abre ao lado dele. */
  readonly variant = input<'default' | 'rail'>('default');
  /** Realça o botão (a rota atual está entre os itens do menu). */
  readonly active = input(false);
  readonly align = input<'start' | 'end'>('end');
  readonly disabled = input(false);

  /** Item escolhido (depois de fechar e devolver o foco ao botão; imediato para `checked`). */
  readonly selected = output<string>();

  private readonly uid = ++nextId;
  protected readonly triggerId = `menu-trigger-${this.uid}`;
  protected readonly menuId = `menu-${this.uid}`;

  private readonly wrapper = viewChild<ElementRef<HTMLElement>>('wrapper');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly anchor = computed(() => this.wrapper()?.nativeElement ?? null);

  protected readonly open = signal(false);
  private readonly initial = signal<'first' | 'last'>('first');
  private typed = '';
  private typedAt = 0;

  protected readonly hasChecks = computed(() => this.items().some((i) => i.checked !== undefined));
  /** Índice do item que recebe o foco ao abrir (o 1º ou o último habilitado). */
  protected readonly startIndex = computed(() => {
    const items = this.items();
    const indexes = items.map((_, i) => i).filter((i) => !items[i]?.disabled);
    return (this.initial() === 'first' ? indexes[0] : indexes[indexes.length - 1]) ?? -1;
  });

  protected toggle(initial: 'first' | 'last'): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.close();
      return;
    }
    this.initial.set(initial);
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (this.open()) return;
    this.toggle(event.key === 'ArrowDown' ? 'first' : 'last');
  }

  protected choose(item: MenuItem): void {
    if (item.disabled) return;
    if (item.checked !== undefined) {
      this.selected.emit(item.id);
      return;
    }
    this.close();
    // Depois da renderização: antes disso a folha (modal) ainda deixa o botão `inert`.
    afterNextRender(
      () => {
        this.trigger()?.nativeElement.focus();
        this.selected.emit(item.id);
      },
      { injector: this.injector },
    );
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const menu = (event.currentTarget as HTMLElement).closest<HTMLElement>('[role="menu"]');
    if (!menu) return;
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[data-menu-item]:not([aria-disabled="true"])'),
    );
    if (items.length === 0) return;
    const current = items.indexOf(event.target as HTMLElement);
    let target: number;
    switch (event.key) {
      case 'ArrowDown':
        target = (current + 1) % items.length;
        break;
      case 'ArrowUp':
        target = current <= 0 ? items.length - 1 : current - 1;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = items.length - 1;
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // Espaço sozinho ativa o item; só vira letra no meio de uma digitação em andamento.
          if (event.key === ' ' && Date.now() - this.typedAt > 500) return;
          target = this.typeahead(items, current, event.key);
          if (target < 0) return;
          break;
        }
        return;
    }
    event.preventDefault();
    items[target]?.focus();
  }

  /** Item cujo texto começa com o que foi digitado (letras em sequência, até 500 ms entre elas). */
  private typeahead(items: readonly HTMLElement[], current: number, key: string): number {
    const now = Date.now();
    this.typed = now - this.typedAt > 500 ? key : this.typed + key;
    this.typedAt = now;
    const query = normalize(this.typed);
    const from = this.typed.length === 1 ? current + 1 : Math.max(current, 0);
    for (let i = 0; i < items.length; i++) {
      const index = (from + i) % items.length;
      if (normalize(items[index]?.textContent?.trim() ?? '').startsWith(query)) {
        // `event.preventDefault()` no chamador: letra digitada não rola a página.
        return index;
      }
    }
    return -1;
  }
}
