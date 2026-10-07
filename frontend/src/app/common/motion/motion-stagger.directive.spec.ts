import { Component } from '@angular/core';
import { render } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MotionRevealDirective } from '~/app/common/motion/motion-reveal.directive';
import { MotionStaggerDirective } from '~/app/common/motion/motion-stagger.directive';

@Component({
  selector: 'app-host',
  imports: [MotionStaggerDirective, MotionRevealDirective],
  template: `
    <div appStagger data-cy="list">
      <p data-cy="a">A</p>
      <p data-cy="b">B</p>
      <p data-cy="skip" data-motion-skip>S</p>
    </div>
    <p appReveal data-cy="single">single</p>
  `,
})
class HostComponent {}

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

describe('Movimento: appStagger e appReveal', () => {
  const callbacks: Callback[] = [];
  const callback: Callback = (entries) => callbacks.forEach((cb) => cb(entries));
  const observed: Element[] = [];

  beforeEach(() => {
    document.documentElement.removeAttribute('data-motion');
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callbacks.push(cb);
        }
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {
          // stub
        }
        disconnect() {
          // stub
        }
      },
    );
  });

  afterEach(() => {
    observed.length = 0;
    callbacks.length = 0;
    document.documentElement.setAttribute('data-motion', 'off');
    vi.unstubAllGlobals();
  });

  it('Dado movimento ligado, quando renderiza, então os filhos ficam pendentes (menos o marcado para pular)', async () => {
    const { getByTestId } = await render(HostComponent);

    expect(getByTestId('a')).toHaveClass('m-pending');
    expect(getByTestId('b')).toHaveClass('m-pending');
    expect(getByTestId('skip')).not.toHaveClass('m-pending');
    expect(getByTestId('single')).toHaveClass('m-pending');
  });

  it('Dado que o observer avisa a interseção, então troca para m-enter em ordem de leitura e só uma vez', async () => {
    const { getByTestId } = await render(HostComponent);

    callback([
      { target: getByTestId('a'), isIntersecting: true },
      { target: getByTestId('b'), isIntersecting: true },
    ]);

    expect(getByTestId('a')).toHaveClass('m-enter');
    expect(getByTestId('a').style.getPropertyValue('--m-i')).toBe('0');
    expect(getByTestId('b').style.getPropertyValue('--m-i')).toBe('1');
    expect(getByTestId('a')).not.toHaveClass('m-pending');

    getByTestId('a').dispatchEvent(new Event('animationend'));
    expect(getByTestId('a')).not.toHaveClass('m-enter');
  });

  it('Dado um filho que chega depois, então só o novo fica pendente', async () => {
    const { getByTestId, container } = await render(HostComponent);
    callback([{ target: getByTestId('a'), isIntersecting: true }]);
    getByTestId('a').dispatchEvent(new Event('animationend'));

    const late = document.createElement('p');
    getByTestId('list').appendChild(late);
    await new Promise((resolve) => setTimeout(resolve));

    expect(late).toHaveClass('m-pending');
    expect(getByTestId('a')).not.toHaveClass('m-pending');
    expect(container).toBeTruthy();
  });

  it('Dado data-motion="off", então nada é escondido', async () => {
    document.documentElement.setAttribute('data-motion', 'off');
    const { getByTestId } = await render(HostComponent);

    expect(getByTestId('a')).not.toHaveClass('m-pending');
    expect(getByTestId('single')).not.toHaveClass('m-pending');
  });

  it('Dado prefers-reduced-motion, então nada é escondido', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { getByTestId } = await render(HostComponent);

    expect(getByTestId('a')).not.toHaveClass('m-pending');
  });
});
