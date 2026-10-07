import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
  OnInit,
} from '@angular/core';

import { Revealer } from '~/app/common/motion/reveal-engine';

/**
 * Cascata dos filhos diretos: cada filho entra (opacidade + deslocamento) quando aparece na viewport,
 * na ordem de leitura. Filhos que chegam depois (dados do backend, `@if`) animam ao entrar no DOM;
 * os que já existiam não reanimam em refresh. `data-motion-skip` exclui um filho.
 */
@Directive({ selector: '[appStagger]' })
export class MotionStaggerDirective implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly revealer = new Revealer(inject(DOCUMENT));
  /** Posição inicial na cascata. */
  readonly appStaggerOffset = input(0, {
    transform: (value: unknown) => numberAttribute(value, 0),
  });
  private mutations: MutationObserver | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.mutations?.disconnect();
      this.revealer.disconnect();
    });
  }

  ngOnInit(): void {
    this.revealer.setOffset(this.appStaggerOffset());
    this.scan();
    if (typeof MutationObserver !== 'undefined') {
      this.mutations = new MutationObserver(() => this.scan());
      this.mutations.observe(this.host, { childList: true });
    }
  }

  private scan(): void {
    for (const child of Array.from(this.host.children)) this.revealer.observe(child);
  }
}
