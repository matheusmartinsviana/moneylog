import {
  afterNextRender,
  DestroyRef,
  ElementRef,
  inject,
  type Signal,
  signal,
} from '@angular/core';

/**
 * Animação de entrada dos gráficos (DS 02: "gráficos animam ao entrar na viewport"). Devolve `pending`:
 * `true` até o elemento entrar na viewport (uma vez só); `false` desde o início quando não há como animar
 * (sem `IntersectionObserver` ou com `prefers-reduced-motion`). O estado final dos gráficos já está no DOM:
 * `pending` só esconde o traço por CSS, então axe e E2E enxergam sempre a mesma coisa.
 * Chamar no construtor (precisa de contexto de injeção).
 */
export function revealOnEnter(): Signal<boolean> {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const destroyRef = inject(DestroyRef);
  const animate =
    typeof IntersectionObserver !== 'undefined' &&
    !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pending = signal(animate);
  if (animate) {
    afterNextRender(() => {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          pending.set(false);
          observer.disconnect();
        }
      });
      observer.observe(host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
  return pending.asReadonly();
}
