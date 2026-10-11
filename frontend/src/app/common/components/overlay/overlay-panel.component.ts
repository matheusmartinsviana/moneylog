import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import {
  focusReturnTarget,
  trackPointerTarget,
} from '~/app/common/components/overlay/focus-return';
import { focusableElements, trapTab } from '~/app/common/components/overlay/focus-trap';
import { lockModal } from '~/app/common/components/overlay/modal-lock';
import { computePosition } from '~/app/common/components/overlay/popover-positioner';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { I18nService } from '~/app/common/i18n/i18n.service';

/** `modal`: sempre modal (diálogo, folha), nunca popover. `sheet` e `auto` são os de sempre. */
export type OverlayMode = 'auto' | 'popover' | 'sheet' | 'modal';

/**
 * Onde o modal aparece: `bottom` (folha inferior, largura toda), `center` (diálogo central) ou
 * `side` (painel lateral à direita). Os `responsive-*` são folha inferior em tela compacta
 * (<= 640 px) e `center`/`side` nas demais.
 */
export type OverlayLayout = 'bottom' | 'center' | 'side' | 'responsive-center' | 'responsive-side';

export type ModalRole = 'dialog' | 'alertdialog';

/** Saída animada: carregada na primeira abertura (fora do bundle inicial) e síncrona ao fechar. */
let ghostExit: typeof import('~/app/common/motion/ghost-exit') | null = null;

/** Pilha de painéis abertos: `Esc` fecha só o do topo. */
const stack: object[] = [];

/**
 * Painel flutuante dos controles próprios (lista do `Select`, calendário, meses). Em tela larga é um
 * popover ancorado ao gatilho (portal no `body`, flip e shift pela área visível); em tela compacta
 * vira uma folha inferior modal (foco preso, fundo travado, botão "Fechar"). `Esc` e toque fora
 * pedem o fechamento (`closed`); quem usa controla `open` e devolve o foco ao gatilho.
 * O conteúdo deve ser projetado dentro de `@if (open())` para só existir enquanto aberto.
 * Um elemento com `data-autofocus` recebe o foco na abertura.
 *
 * É também o primitivo de `Dialog`, `Sheet` e `Menu` (compostos a partir dele, sem segunda pilha de
 * overlays): `mode="modal"` + `layout` dão o diálogo central, a folha inferior e o painel lateral.
 */
@Component({
  selector: 'app-overlay-panel',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <!-- Folga do teclado virtual medida em tempo de execução: não cabe em classe CSS. -->
      <!-- eslint-disable-next-line @angular-eslint/template/no-inline-styles -->
      <div
        class="backdrop"
        role="presentation"
        [class.backdrop--modal]="modal()"
        [class.backdrop--dialog]="mode() === 'modal'"
        [class.backdrop--center]="kind() === 'center'"
        [class.backdrop--side]="kind() === 'side'"
        [attr.data-cy]="cy() + '-backdrop'"
        [style.padding-bottom.px]="
          kind() === 'center' && keyboardOffset() > 0 ? keyboardOffset() + 12 : null
        "
        (click)="onBackdropClick($event)"
      >
        <!-- Posição calculada em tempo de execução (flip/shift): não cabe em classe CSS. -->
        <!-- eslint-disable-next-line @angular-eslint/template/no-inline-styles -->
        <div
          #panel
          class="panel glass glass--strong"
          [class.panel--modal]="modal()"
          [class.panel--sheet]="kind() === 'bottom'"
          [class.panel--center]="kind() === 'center'"
          [class.panel--side]="kind() === 'side'"
          [class.panel--scroll]="scrollBody()"
          [attr.role]="role()"
          [attr.aria-modal]="modal() ? 'true' : null"
          [attr.aria-label]="role() ? label() : null"
          [attr.aria-describedby]="modal() ? describedBy() : null"
          [attr.tabindex]="modal() ? -1 : null"
          [attr.data-cy]="panelCy() ?? cy() + '-panel'"
          [style]="panelStyle()"
          [attr.data-side]="modal() ? (kind() === 'bottom' ? 'sheet' : kind()) : position().side"
          [attr.data-positioned]="positioned() ? 'true' : null"
          (keydown)="onKeydown($event)"
        >
          @if (modal()) {
            <div class="panel__header">
              <h2 class="panel__title">{{ label() }}</h2>
              @if (showClose() && dismissable()) {
                <button
                  type="button"
                  class="panel__close"
                  [attr.aria-label]="t().form.ui.close"
                  [attr.data-cy]="cy() + '-close'"
                  (click)="closed.emit()"
                >
                  <app-icon name="close" [size]="20" />
                </button>
              }
            </div>
          }
          <div class="panel__body">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: var(--z-popover);
      pointer-events: none;
    }

    .backdrop--modal {
      background-color: var(--color-scrim);
      pointer-events: auto;
      animation: overlay-fade var(--duration-base) var(--ease-standard);
    }

    /* Diálogo, folha como diálogo e painel lateral: abaixo do popover (um Select dentro do diálogo
       abre por cima). A folha dos campos (Select, calendário) segue na camada do popover. */
    .backdrop--dialog {
      z-index: var(--z-dialog);
    }

    /* Modal centralizado: margem lateral de 12 a 16 px (e a área segura), sobre o fundo escurecido. */
    .backdrop--center {
      display: grid;
      place-items: center;
      padding: max(var(--space-3), env(safe-area-inset-top))
        max(var(--space-3), env(safe-area-inset-right))
        max(var(--space-3), env(safe-area-inset-bottom))
        max(var(--space-3), env(safe-area-inset-left));
    }

    .panel {
      position: fixed;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      border-radius: var(--radius-card);
      pointer-events: auto;
      animation: overlay-pop var(--duration-fast) var(--ease-standard);
    }

    /* Invisível até a primeira posição calculada: sem quadro no canto (0, 0). Opacidade e não
       visibility: um elemento com visibility hidden recusa o foco, e o autofoco da abertura roda
       antes de o primeiro quadro posicionado ser pintado. */
    .panel:not(.panel--modal):not([data-positioned]) {
      opacity: 0;
    }

    .panel[data-side='above'] {
      animation-name: overlay-pop-up;
    }

    .panel[data-side='end'] {
      animation-name: overlay-pop-end;
    }

    .panel--sheet {
      right: 0;
      left: 0;
      max-height: min(92dvh, 48rem);
      overscroll-behavior: contain;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: var(--radius-panel) var(--radius-panel) 0 0;
      padding-bottom: env(safe-area-inset-bottom);
      animation: overlay-sheet var(--duration-slow) var(--ease-emphasized);
    }

    .panel--center {
      position: relative;
      width: min(100%, 28rem);
      max-height: min(90dvh, 40rem);
      overscroll-behavior: contain;
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-2);
      animation: overlay-dialog var(--duration-base) var(--ease-emphasized);
    }

    .panel--side {
      top: 0;
      right: 0;
      bottom: 0;
      width: min(100%, 26rem);
      border-top: 0;
      border-right: 0;
      border-bottom: 0;
      border-radius: var(--radius-panel) 0 0 var(--radius-panel);
      padding-bottom: env(safe-area-inset-bottom);
      overscroll-behavior: contain;
      animation: overlay-side var(--duration-slow) var(--ease-emphasized);
    }

    /* Conteúdo longo do diálogo/folha rola por dentro; cabeçalho e bordas ficam. */
    .panel--scroll .panel__body {
      overflow-y: auto;
      overscroll-behavior: contain;
      /* O campo focado não fica atrás do rodapé de ações fixo nem do teclado. */
      scroll-padding-block: var(--space-4) 6rem;
    }

    .panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-2) var(--space-5);
    }

    .panel__title {
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .panel__close {
      display: inline-grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text-muted);
    }

    .panel__close:hover {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }

    .panel__body {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }

    @keyframes overlay-fade {
      from {
        opacity: 0;
      }
    }

    @keyframes overlay-pop {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }

    /* Diálogo e folha central: entram como janela do macOS (escala 0,98 → 1 e opacidade). */
    @keyframes overlay-dialog {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
      }
    }

    @keyframes overlay-pop-end {
      from {
        opacity: 0;
        transform: translateX(-6px);
      }
    }

    @keyframes overlay-pop-up {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }

    @keyframes overlay-side {
      from {
        transform: translateX(24px);
        opacity: 0;
      }
    }

    @keyframes overlay-sheet {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
  `,
})
export class OverlayPanelComponent implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = inject(ViewportService);
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  readonly anchor = input<HTMLElement | null>(null);
  /** Nome acessível do painel (e título da folha). */
  readonly label = input.required<string>();
  readonly mode = input<OverlayMode>('auto');
  /** Papel do painel em modo popover (modal: `modalRole`); `null` deixa o painel sem papel. */
  readonly popoverRole = input<string | null>('dialog');
  /** Papel do painel modal. */
  readonly modalRole = input<ModalRole>('dialog');
  /** Onde o modal aparece (`bottom` é a folha inferior de sempre). */
  readonly layout = input<OverlayLayout>('bottom');
  /** `id` do texto que descreve o modal (`aria-describedby`). */
  readonly describedBy = input<string | null>(null);
  /** Modal: `false` ignora `Esc` e o toque no fundo e esconde "Fechar" (ação que exige resposta). */
  readonly dismissable = input(true);
  /** Modal: mostra o botão "Fechar" no cabeçalho. */
  readonly showClose = input(true);
  /** Modal: o conteúdo rola por dentro (diálogo e folha com conteúdo longo). */
  readonly scrollBody = input(false);
  /** `data-cy` do painel, quando precisa diferir de `<cy>-panel`. */
  readonly panelCy = input<string | null>(null);
  /** Largura do popover igual à do gatilho (listas) ou a natural do conteúdo (calendário). */
  readonly matchWidth = input(false);
  /** Largura do popover em px quando não acompanha o gatilho (calendário). */
  readonly panelWidth = input<number | null>(null);
  /** Largura mínima em px do popover que acompanha o gatilho (listas curtas em campos estreitos). */
  readonly minWidth = input(0);
  readonly align = input<'start' | 'end'>('start');
  /** `inline`: o popover abre ao lado do gatilho (trilho lateral), em vez de abaixo dele. */
  readonly placement = input<'block' | 'inline'>('block');
  /** Prefixo dos `data-cy` do painel. */
  readonly cy = input('overlay');

  /** Pedido de fechamento: `Esc`, toque fora ou botão "Fechar" da folha. */
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Modal (folha, diálogo, painel lateral): trava a rolagem, fundo `inert`, foco preso. */
  protected readonly modal = computed(
    () =>
      this.mode() === 'sheet' ||
      this.mode() === 'modal' ||
      (this.mode() === 'auto' && this.viewport.compact()),
  );
  /** Forma do painel: `popover` ou a do modal (`bottom`, `center`, `side`). */
  protected readonly kind = computed<'popover' | OverlayLayout>(() => {
    if (!this.modal()) return 'popover';
    const layout = this.layout();
    // Celular: modal de verdade (diálogo centralizado, com margem), nunca a "página que sobe de baixo".
    if (layout === 'responsive-center') return 'center';
    if (layout === 'responsive-side') return this.viewport.compact() ? 'center' : 'side';
    if (layout === 'bottom' && this.viewport.compact()) return 'center';
    return layout;
  });
  protected readonly role = computed(() => (this.modal() ? this.modalRole() : this.popoverRole()));
  protected readonly position = signal<{
    top: number;
    left: number;
    maxHeight: number;
    side: 'below' | 'above' | 'end';
  }>({ top: 0, left: 0, maxHeight: 360, side: 'below' });
  protected readonly width = signal<number | null>(null);
  protected readonly keyboardOffset = signal(0);
  /** Altura visível (descontado o teclado virtual): limita a folha, que não pode passar dela. */
  protected readonly visibleHeight = signal<number | null>(null);
  protected readonly positioned = signal(false);
  /** Posição calculada em tempo de execução (única parte que não cabe em classe CSS). */
  protected readonly panelStyle = computed(() => {
    if (this.kind() === 'center') {
      const visible = this.visibleHeight();
      return visible === null ? {} : { 'max-height': `min(90dvh, 40rem, ${visible - 24}px)` };
    }
    if (this.kind() === 'bottom') {
      const visible = this.visibleHeight();
      return {
        bottom: `${this.keyboardOffset()}px`,
        ...(visible === null ? {} : { 'max-height': `min(92dvh, 48rem, ${visible - 16}px)` }),
      };
    }
    if (this.modal()) return {};
    const { top, left, maxHeight } = this.position();
    const width = this.width();
    return {
      top: `${top}px`,
      left: `${left}px`,
      'max-height': `${maxHeight}px`,
      ...(width === null ? {} : { width: `${width}px` }),
    };
  });

  private readonly token = {};
  private marker: Comment | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    trackPointerTarget(this.document);
    effect((onCleanup) => {
      if (!this.open()) return;
      untracked(() => this.onOpen());
      const view = this.document.defaultView;
      const keydown = (event: KeyboardEvent) => this.onDocumentKeydown(event);
      const pointerdown = (event: PointerEvent) => this.onDocumentPointerDown(event);
      const focusin = (event: FocusEvent) => this.onDocumentFocusIn(event);
      const reposition = () => this.update();
      const visual = view?.visualViewport ?? null;
      this.document.addEventListener('keydown', keydown, true);
      this.document.addEventListener('pointerdown', pointerdown, true);
      this.document.addEventListener('focusin', focusin, true);
      view?.addEventListener('resize', reposition);
      view?.addEventListener('scroll', reposition, true);
      visual?.addEventListener('resize', reposition);
      visual?.addEventListener('scroll', reposition);
      onCleanup(() => {
        this.document.removeEventListener('keydown', keydown, true);
        this.document.removeEventListener('pointerdown', pointerdown, true);
        this.document.removeEventListener('focusin', focusin, true);
        view?.removeEventListener('resize', reposition);
        view?.removeEventListener('scroll', reposition, true);
        visual?.removeEventListener('resize', reposition);
        visual?.removeEventListener('scroll', reposition);
        untracked(() => {
          this.exitGhost();
          this.onClose();
        });
      });
    });

    // Folha = modal: trava a rolagem e deixa o fundo inerte. Acompanha a troca popover <-> folha
    // com o painel aberto (rotação, redimensionamento).
    effect((onCleanup) => {
      if (!this.open() || !this.modal()) return;
      this.portal();
      const release = lockModal(this.host.nativeElement);
      onCleanup(release);
    });

    // Recalcula quando o gatilho, o modo ou o tamanho do conteúdo mudam.
    effect(() => {
      this.anchor();
      this.kind();
      this.matchWidth();
      if (this.open()) afterNextRender(() => this.update(), { injector: this.injector });
    });
  }

  /** Saída animada (clone do fundo + painel): o conteúdo projetado já é removido pelo consumidor. */
  private exitGhost(): void {
    const panel = this.panel()?.nativeElement;
    const backdrop = panel?.parentElement;
    if (!panel || !backdrop?.isConnected) return;
    const kind = this.kind();
    const shape =
      kind === 'center'
        ? 'dialog'
        : kind === 'bottom'
          ? 'sheet'
          : kind === 'side'
            ? 'side'
            : 'popover';
    ghostExit?.playGhostExit(backdrop, panel, shape);
  }

  ngOnDestroy(): void {
    this.onClose();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (this.modal() && this.dismissable() && event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    if (!this.modal()) {
      // Popover: Tab fecha e devolve o foco ao gatilho (como o `Select`); Shift+Tab idem, voltando
      // ao campo. Sem isso o foco sairia para o fim do `body` (portal) e para a UI do navegador.
      event.preventDefault();
      this.closed.emit();
      this.focusTrigger();
      return;
    }
    trapTab(event, panel, this.document);
  }

  /** Foco de volta ao gatilho: o elemento que o tinha na abertura ou o 1º focável do `anchor`. */
  private focusTrigger(): void {
    const remembered = this.returnFocus;
    const anchor = this.anchor();
    const target =
      remembered?.isConnected === true
        ? remembered
        : anchor
          ? (focusableElements(anchor)[0] ?? null)
          : null;
    target?.focus();
  }

  private onOpen(): void {
    if (!ghostExit) void import('~/app/common/motion/ghost-exit').then((m) => (ghostExit = m));
    stack.push(this.token);
    this.returnFocus = focusReturnTarget(this.document);
    this.portal();
    afterNextRender(
      () => {
        this.update();
        const panel = this.panel()?.nativeElement;
        const target = panel?.querySelector<HTMLElement>('[data-autofocus]');
        if (target) target.focus({ preventScroll: true });
        else if (this.modal()) panel?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /** Portal: o painel sai de qualquer pai com `overflow`/`transform` e vai para o fim do `body`. */
  private portal(): void {
    const host = this.host.nativeElement;
    if (this.marker || !host.parentNode || host.parentNode === this.document.body) return;
    this.marker = this.document.createComment('overlay');
    host.parentNode.insertBefore(this.marker, host);
    this.document.body.appendChild(host);
  }

  private onClose(): void {
    const index = stack.indexOf(this.token);
    if (index >= 0) stack.splice(index, 1);
    this.positioned.set(false);
    const host = this.host.nativeElement;
    if (this.marker?.parentNode) {
      this.marker.parentNode.insertBefore(host, this.marker);
      this.marker.remove();
    }
    this.marker = null;
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target) {
      try {
        afterNextRender(
          () => {
            const active = this.document.activeElement;
            if ((!active || active === this.document.body) && target.isConnected) target.focus();
          },
          { injector: this.injector },
        );
      } catch {
        // A view já foi destruída (fechamento por navegação): não há foco a devolver.
      }
    }
  }

  private onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || stack[stack.length - 1] !== this.token) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.modal() && !this.dismissable()) return;
    this.closed.emit();
  }

  /** Rede de segurança: o foco foi para fora do painel e do gatilho (popover): pede o fechamento. */
  private onDocumentFocusIn(event: FocusEvent): void {
    if (this.modal() || stack[stack.length - 1] !== this.token) return;
    const target = event.target as Node | null;
    if (!target || target === this.document.body) return;
    if (this.panel()?.nativeElement.contains(target) || this.anchor()?.contains(target)) return;
    this.closed.emit();
  }

  private onDocumentPointerDown(event: PointerEvent): void {
    if (this.modal() || stack[stack.length - 1] !== this.token) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (this.panel()?.nativeElement.contains(target) || this.anchor()?.contains(target)) return;
    this.closed.emit();
  }

  private update(): void {
    const view = this.document.defaultView;
    const panel = this.panel()?.nativeElement;
    if (!view || !panel) return;
    const visual = view.visualViewport;
    if (this.modal()) {
      if (this.kind() !== 'bottom' && this.kind() !== 'center') return;
      // O teclado virtual do iOS não encolhe a janela: a folha sobe com o `visualViewport`.
      const hidden = visual ? view.innerHeight - (visual.offsetTop + visual.height) : 0;
      this.keyboardOffset.set(Math.max(0, Math.round(hidden)));
      this.visibleHeight.set(visual ? Math.round(visual.height) : null);
      return;
    }
    const anchor = this.anchor();
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = this.matchWidth() ? Math.max(rect.width, this.minWidth()) : this.panelWidth();
    this.width.set(width);
    // A largura vem antes da altura: o texto quebra conforme a largura, e a altura natural (usada
    // no flip) tem de ser medida já com ela aplicada.
    if (width !== null) panel.style.width = `${width}px`;
    const natural = panel.scrollHeight || 0;
    const result = computePosition({
      anchor: rect,
      width: width ?? panel.offsetWidth,
      height: natural,
      viewport: {
        width: visual?.width ?? view.innerWidth,
        height: visual ? visual.offsetTop + visual.height : view.innerHeight,
      },
      align: this.align(),
      placement: this.placement(),
    });
    this.position.set(result);
    this.positioned.set(true);
  }
}
