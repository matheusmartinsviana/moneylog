import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

import { refractionFilter } from '~/app/common/components/liquid-glass/liquid-glass-filter';

/**
 * Lente de vidro líquido (DS 03): em Chromium desktop (`<html data-glass="refract">`) mede o elemento e aplica o
 * `backdrop-filter` de deslocamento, que refrata o fundo na borda arredondada (ResizeObserver + cache por tamanho).
 * Nos demais modos nada acontece: o CSS de `.glass-lens` já cai em desfoque barato ou em superfície sólida.
 * Use só em elementos **pequenos e isolados** (item ativo da sidebar, botões de ícone, tooltip); nunca empilhe
 * várias lentes grandes. Sem lógica financeira.
 */
@Directive({
  selector: '[appLiquidGlass]',
  host: { class: 'glass-lens' },
})
export class LiquidGlassDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly radius = input(14, { alias: 'appLiquidGlassRadius' });
  readonly strength = input(46, { alias: 'appLiquidGlassStrength' });

  constructor() {
    afterNextRender(() => {
      const element = this.el.nativeElement;
      const doc = element.ownerDocument;
      if (doc.documentElement.getAttribute('data-glass') !== 'refract') return;
      if (typeof ResizeObserver === 'undefined') return;
      const draw = (): void => {
        const rect = element.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width < 8 || height < 8) return;
        element.style.backdropFilter = refractionFilter({
          width,
          height,
          radius: Math.min(this.radius(), Math.min(width, height) / 2),
          depth: 5,
          strength: this.strength(),
          chromaticAberration: 4,
        });
      };
      draw();
      const observer = new ResizeObserver(draw);
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
