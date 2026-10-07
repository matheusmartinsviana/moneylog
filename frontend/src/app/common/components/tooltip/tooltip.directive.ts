import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';

import { computePosition } from '~/app/common/components/overlay/popover-positioner';

const HOVER_DELAY_MS = 400;
const LONG_PRESS_MS = 500;
/** Tempo para o ponteiro ir do gatilho ao balão sem ele sumir (WCAG 1.4.13, conteúdo "hoverable"). */
const HOVER_GRACE_MS = 150;
const TOUCH_LINGER_MS = 1800;
const MAX_LENGTH = 120;

let nextId = 0;
/** Tooltip aberto no momento: só um por vez, e sem atraso ao passar de um para outro. */
let current: { hide: () => void } | null = null;
let lastShownAt = 0;

/**
 * Dica de ajuda própria, no lugar do atributo `title`. Aparece no hover (com atraso de 400 ms) e no
 * foco por teclado, some com `Esc`, no blur e ao rolar; no toque, só com pressão longa (não rouba o
 * clique). Só complementa: a informação essencial nunca vive só aqui (FE-S-118). Texto curto, sem HTML.
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(pointerenter)': 'onEnter($event)',
    '(pointerleave)': 'onLeave($event)',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointerup)': 'cancelPress()',
    '(pointercancel)': 'cancelPress()',
    '(focusin)': 'onFocus()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TooltipDirective {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Texto da dica; vazio ou `null` desliga. */
  readonly text = input<string | null | undefined>(undefined, { alias: 'appTooltip' });
  /** Liga o balão ao elemento por `aria-describedby` (desligue se o texto já é descrito por outro id). */
  readonly describes = input(true, { alias: 'appTooltipDescribes' });
  /** Lado preferido do balão: acima do gatilho (padrão) ou à direita dele (itens de uma coluna lateral). */
  readonly side = input<'above' | 'end'>('above', { alias: 'appTooltipSide' });

  private readonly id = `tooltip-${++nextId}`;
  private bubble: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;
  private lingerTimer: ReturnType<typeof setTimeout> | undefined;
  private longPressed = false;
  private readonly scroll = () => this.hide();
  private readonly handle = { hide: () => this.hide() };

  constructor() {
    effect(() => {
      const text = this.text();
      if (text && text.length > MAX_LENGTH) {
        console.error(`appTooltip: texto com mais de ${MAX_LENGTH} caracteres.`);
      }
      if (this.bubble) {
        if (text) this.bubble.textContent = text;
        else this.hide();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      clearTimeout(this.pressTimer);
      clearTimeout(this.lingerTimer);
    });
  }

  protected onEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    clearTimeout(this.graceTimer);
    clearTimeout(this.timer);
    const quick = current !== null || Date.now() - lastShownAt < 300;
    this.timer = setTimeout(() => this.show(), quick ? 0 : HOVER_DELAY_MS);
  }

  /** O ponteiro saiu do gatilho: o balão fica um instante para dar tempo de alcançá-lo. */
  protected onLeave(event: PointerEvent): void {
    if (event.pointerType === 'touch' || !this.bubble) {
      this.hide();
      return;
    }
    clearTimeout(this.timer);
    clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => this.hide(), HOVER_GRACE_MS);
  }

  protected onFocus(): void {
    // Só foco de teclado: o clique do mouse não deve abrir a dica.
    if (this.host.nativeElement.matches(':focus-visible')) this.show();
  }

  protected onPointerDown(event: PointerEvent): void {
    this.longPressed = false;
    if (event.pointerType !== 'touch') return;
    clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      this.show();
    }, LONG_PRESS_MS);
  }

  protected cancelPress(): void {
    clearTimeout(this.pressTimer);
    if (this.bubble && this.longPressed) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = setTimeout(() => this.hide(), TOUCH_LINGER_MS);
    }
  }

  protected onContextMenu(event: Event): void {
    // A pressão longa do toque dispara o menu do sistema: a dica já a substitui.
    if (this.longPressed) event.preventDefault();
  }

  protected show(): void {
    const text = this.text();
    if (!text || this.bubble) return;
    current?.hide();
    const bubble = this.document.createElement('div');
    bubble.id = this.id;
    bubble.setAttribute('role', 'tooltip');
    bubble.className = 'tooltip';
    bubble.textContent = text;
    // Balão "hoverable": o ponteiro pode entrar nele sem que ele suma; sair dele fecha.
    bubble.addEventListener('pointerenter', () => clearTimeout(this.graceTimer));
    bubble.addEventListener('pointerleave', () => this.hide());
    this.document.body.appendChild(bubble);
    this.bubble = bubble;
    current = this.handle;
    if (this.describes()) {
      const ids = (this.host.nativeElement.getAttribute('aria-describedby') ?? '').split(' ');
      this.host.nativeElement.setAttribute(
        'aria-describedby',
        [...ids.filter(Boolean), this.id].join(' '),
      );
    }
    this.place(bubble);
    this.document.defaultView?.addEventListener('scroll', this.scroll, true);
  }

  hide(): void {
    clearTimeout(this.timer);
    clearTimeout(this.graceTimer);
    if (!this.bubble) return;
    this.bubble.remove();
    this.bubble = null;
    if (current === this.handle) {
      current = null;
      lastShownAt = Date.now();
    }
    const host = this.host.nativeElement;
    const ids = (host.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter((id) => id && id !== this.id);
    if (ids.length > 0) host.setAttribute('aria-describedby', ids.join(' '));
    else host.removeAttribute('aria-describedby');
    this.document.defaultView?.removeEventListener('scroll', this.scroll, true);
  }

  private place(bubble: HTMLElement): void {
    const view = this.document.defaultView;
    if (!view) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (this.side() === 'end') {
      const margin = 8;
      const left = Math.min(rect.right + 8, view.innerWidth - bubble.offsetWidth - margin);
      const centered = rect.top + rect.height / 2 - bubble.offsetHeight / 2;
      const top = Math.min(centered, view.innerHeight - bubble.offsetHeight - margin);
      bubble.style.top = `${Math.max(top, margin)}px`;
      bubble.style.left = `${Math.max(left, margin)}px`;
      return;
    }
    const position = computePosition({
      anchor: rect,
      width: bubble.offsetWidth,
      height: bubble.offsetHeight,
      viewport: { width: view.innerWidth, height: view.innerHeight },
      prefer: 'above',
      align: 'center',
      gap: 8,
    });
    bubble.style.top = `${position.top}px`;
    bubble.style.left = `${position.left}px`;
  }
}
