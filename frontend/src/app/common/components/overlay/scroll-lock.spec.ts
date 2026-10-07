import { lockScroll } from '~/app/common/components/overlay/scroll-lock';

describe('lockScroll', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
  });

  it('Dado um bloqueio, quando solta, então o corpo volta exatamente ao estilo anterior', () => {
    document.body.style.overflow = 'auto';

    const release = lockScroll(document.body);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');

    release();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.position).toBe('');
  });

  it('Dado dois bloqueios aninhados, quando solta o primeiro, então continua travado até soltar o último', () => {
    const first = lockScroll(document.body);
    const second = lockScroll(document.body);

    first();
    expect(document.body.style.overflow).toBe('hidden');

    second();
    expect(document.body.style.overflow).toBe('');
  });

  it('Dado soltar duas vezes a mesma trava, quando repete, então não destrava a outra', () => {
    const first = lockScroll(document.body);
    const second = lockScroll(document.body);

    first();
    first();
    expect(document.body.style.overflow).toBe('hidden');

    second();
    expect(document.body.style.overflow).toBe('');
  });

  it('Dado a página rolada, quando trava e solta, então a posição de rolagem é restaurada', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });

    const release = lockScroll(document.body);
    expect(document.body.style.top).toBe('-240px');

    release();
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
    expect(document.body.style.top).toBe('');

    scrollTo.mockRestore();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
