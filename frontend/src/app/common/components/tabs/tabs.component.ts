import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { TabPanelDirective } from '~/app/common/components/tabs/tab-panel.directive';
import { SlideIndicatorDirective } from '~/app/common/motion/slide-indicator.directive';

/** Aba do `Tabs`. O texto já vem traduzido. */
export interface TabItem {
  /** Valor de `active`, sufixo do `data-cy` e ligação com o painel (`appTabPanel`). */
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

let nextId = 0;

/**
 * Abas (padrão tabs com ativação automática do APG): `role="tablist"`, roving tabindex, `←` `→`
 * `Home` `End` movem o foco **e** abrem a aba, `aria-selected`/`aria-controls`, painéis
 * `role="tabpanel"` com `aria-labelledby`. `[(active)]` liga a aba aberta a quem usa (por exemplo
 * ao `?tab=` da URL). Com muitas abas, a lista rola na horizontal e uma sombra (nunca gradiente,
 * FE-S-121) nas bordas avisa que há mais; a aba com foco entra na vista. Painéis são projetados
 * com `<ng-template appTabPanel="id">`; sem painel, o `Tabs` serve só de seletor (a rota troca o
 * conteúdo). Presentational.
 */
@Component({
  selector: 'app-tabs',
  imports: [NgTemplateOutlet, SlideIndicatorDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-tabs" [attr.data-cy]="fieldId()">
      <div
        class="ui-tabs__bar"
        [class.has-start]="canScrollStart()"
        [class.has-end]="canScrollEnd()"
      >
        <div
          #list
          class="ui-tabs__list"
          appSlideIndicator
          role="tablist"
          [attr.aria-label]="label()"
          (scroll)="measure()"
        >
          @for (tab of tabs(); track tab.id) {
            <button
              type="button"
              role="tab"
              class="ui-tabs__tab"
              [id]="tabId(tab.id)"
              [class.is-active]="tab.id === current()"
              [attr.aria-selected]="tab.id === current()"
              [attr.aria-controls]="hasPanel(tab.id) ? panelId(tab.id) : null"
              [attr.aria-disabled]="tab.disabled || null"
              [attr.data-tab]="tab.id"
              [attr.data-cy]="fieldId() + '-tab-' + tab.id"
              [tabIndex]="tab.id === current() ? 0 : -1"
              (click)="select(tab)"
              (focus)="reveal($event)"
              (keydown)="onKeydown($event)"
            >
              {{ tab.label }}
            </button>
          }
        </div>
      </div>
      @for (panel of panels(); track panel.id()) {
        @if (visited().has(panel.id())) {
          <div
            role="tabpanel"
            class="ui-tabs__panel"
            tabindex="0"
            [id]="panelId(panel.id())"
            [hidden]="panel.id() !== current()"
            [attr.aria-labelledby]="tabId(panel.id())"
            [attr.data-cy]="fieldId() + '-panel-' + panel.id()"
          >
            <ng-container [ngTemplateOutlet]="panel.template" />
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .ui-tabs__bar {
      position: relative;
      overflow: hidden;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .ui-tabs__list {
      position: relative;
      display: flex;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .ui-tabs__list::-webkit-scrollbar {
      display: none;
    }

    /* Sombra (não gradiente) nas bordas quando a lista rola: um elemento sem largura projeta o
       blur sobre as abas; o contêiner recorta no seu retângulo. */
    .ui-tabs__bar::before,
    .ui-tabs__bar::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 1;
      width: 0;
      box-shadow: 0 0 10px 6px var(--color-shadow-strong);
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--duration-fast) var(--ease-standard);
    }

    .ui-tabs__bar::before {
      left: 0;
    }

    .ui-tabs__bar::after {
      right: 0;
    }

    .ui-tabs__bar.has-start::before,
    .ui-tabs__bar.has-end::after {
      opacity: 1;
    }

    .ui-tabs__tab {
      flex: none;
      min-height: 2.75rem;
      padding: 0 var(--space-4);
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--color-text-muted);
      font-size: var(--text-md);
      font-weight: var(--weight-medium);
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }

    .ui-tabs__tab:hover:not([aria-disabled='true']) {
      color: var(--color-text);
    }

    .ui-tabs__tab.is-active {
      color: var(--color-text);
    }

    .ui-tabs__list:not([data-ind-on]) .ui-tabs__tab.is-active {
      border-bottom-color: var(--color-accent);
    }

    /* Sublinhado deslizante (diretiva appSlideIndicator). */
    .ui-tabs__list[data-ind-on]::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: var(--ind-w);
      height: 2px;
      background-color: var(--color-accent);
      pointer-events: none;
      transform: translateX(var(--ind-x));
    }

    .ui-tabs__list[data-ind-ready]::after {
      transition: transform var(--duration-base) var(--ease-emphasized);
    }

    /* O anel de foco por dentro: a lista rola e recortaria o anel por fora. */
    .ui-tabs__tab:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px var(--color-focus);
    }

    .ui-tabs__tab[aria-disabled='true'] {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .ui-tabs__panel {
      padding-top: var(--space-4);
    }

    .ui-tabs__panel:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    @media (forced-colors: active) {
      .ui-tabs__tab.is-active {
        border-bottom-color: Highlight;
      }
    }
  `,
})
export class TabsComponent {
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs = input.required<readonly TabItem[]>();
  /** Nome da lista de abas (`aria-label`). Já traduzido. */
  readonly label = input.required<string>();
  /** Base do `data-cy`: abas `<fieldId>-tab-<id>`, painéis `<fieldId>-panel-<id>`. */
  readonly fieldId = input.required<string>();
  /** Aba aberta (`[(active)]`). Vazia ou inválida: a primeira habilitada. */
  readonly active = model<string | null>(null);

  protected readonly panels = contentChildren(TabPanelDirective);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  private readonly uid = ++nextId;
  protected readonly visited = signal<ReadonlySet<string>>(new Set());
  protected readonly canScrollStart = signal(false);
  protected readonly canScrollEnd = signal(false);

  protected readonly current = computed(() => {
    const tabs = this.tabs();
    const wanted = tabs.find((tab) => tab.id === this.active() && !tab.disabled);
    return (wanted ?? tabs.find((tab) => !tab.disabled))?.id ?? null;
  });

  constructor() {
    // Painéis montados preguiçosamente: a aba aberta entra no conjunto e fica.
    effect(() => {
      const id = this.current();
      if (id === null) return;
      untracked(() => {
        if (!this.visited().has(id)) this.visited.update((set) => new Set(set).add(id));
      });
    });
    // A aba aberta por fora (URL) entra na vista; a lista é medida de novo quando as abas mudam.
    effect(() => {
      this.current();
      this.tabs();
      afterNextRender(
        () => {
          this.measure();
          this.list()
            ?.nativeElement.querySelector<HTMLElement>('[aria-selected="true"]')
            ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        },
        { injector: this.injector },
      );
    });
    afterNextRender(() => {
      const list = this.list()?.nativeElement;
      if (!list || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(list);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected tabId(id: string): string {
    return `tab-${this.uid}-${id}`;
  }

  protected panelId(id: string): string {
    return `tabpanel-${this.uid}-${id}`;
  }

  protected hasPanel(id: string): boolean {
    return this.panels().some((panel) => panel.id() === id);
  }

  protected select(tab: TabItem): void {
    if (tab.disabled) return;
    this.active.set(tab.id);
  }

  protected measure(): void {
    const list = this.list()?.nativeElement;
    if (!list) return;
    this.canScrollStart.set(list.scrollLeft > 1);
    this.canScrollEnd.set(list.scrollLeft + list.clientWidth < list.scrollWidth - 1);
  }

  protected reveal(event: FocusEvent): void {
    (event.target as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const enabled = tabs.filter((tab) => !tab.disabled);
    if (enabled.length === 0) return;
    const index = enabled.findIndex((tab) => tab.id === this.current());
    let target: TabItem | undefined;
    switch (event.key) {
      case 'ArrowRight':
        target = enabled[(index + 1) % enabled.length];
        break;
      case 'ArrowLeft':
        target = enabled[(index - 1 + enabled.length) % enabled.length];
        break;
      case 'Home':
        target = enabled[0];
        break;
      case 'End':
        target = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (!target) return;
    this.select(target);
    this.list()
      ?.nativeElement.querySelector<HTMLElement>(`[data-tab="${CSS.escape(target.id)}"]`)
      ?.focus();
  }
}
