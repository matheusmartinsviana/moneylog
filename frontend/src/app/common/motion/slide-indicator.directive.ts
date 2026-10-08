import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';

import { motionEnabled } from '~/app/common/motion/motion';

const ACTIVE =
  '[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [aria-current="page"]';

/**
 * Indicador deslizante de abas e controles segmentados. Mede o item ativo do contêiner (`aria-checked`,
 * `aria-selected`, `aria-pressed` ou `aria-current`) e publica `--ind-x`, `--ind-w`, `--ind-y` e `--ind-h` (px) no
 * contêiner; o CSS desenha a pílula (`::before`) e anima o `transform`. Só leitura de layout: nenhum estado muda
 * aqui. O primeiro posicionamento não anima (`data-ind-ready` só chega depois). Sem movimento (preferência do
 * sistema ou `data-motion="off"`) a pílula salta direto, sem transição.
 */
@Directive({ selector: '[appSlideIndicator]' })
export class SlideIndicatorDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const injector = inject(Injector);
    const destroyRef = inject(DestroyRef);
    afterNextRender(
      () => {
        const el = this.host.nativeElement;
        let frame = 0;
        const measure = () => {
          frame = 0;
          const active = el.querySelector<HTMLElement>(ACTIVE);
          if (!active || active.offsetParent === null) {
            el.style.removeProperty('--ind-w');
            el.removeAttribute('data-ind-on');
            return;
          }
          el.style.setProperty('--ind-x', `${active.offsetLeft}px`);
          el.style.setProperty('--ind-y', `${active.offsetTop}px`);
          el.style.setProperty('--ind-w', `${active.offsetWidth}px`);
          el.style.setProperty('--ind-h', `${active.offsetHeight}px`);
          const first = !el.hasAttribute('data-ind-on');
          el.setAttribute('data-ind-on', '');
          if (first && motionEnabled(el.ownerDocument)) {
            requestAnimationFrame(() => el.setAttribute('data-ind-ready', ''));
          }
        };
        const schedule = () => {
          if (!frame) frame = requestAnimationFrame(measure);
        };
        measure();
        const mutations = new MutationObserver(schedule);
        mutations.observe(el, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            'aria-checked',
            'aria-selected',
            'aria-pressed',
            'aria-current',
            'class',
          ],
        });
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        resize?.observe(el);
        destroyRef.onDestroy(() => {
          mutations.disconnect();
          resize?.disconnect();
          if (frame) cancelAnimationFrame(frame);
        });
      },
      { injector },
    );
  }
}
