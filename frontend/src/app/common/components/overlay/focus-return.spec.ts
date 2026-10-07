import {
  focusReturnTarget,
  trackPointerTarget,
} from '~/app/common/components/overlay/focus-return';

function pointerDown(target: Element): void {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

describe('focusReturnTarget', () => {
  beforeEach(() => trackPointerTarget(document));
  afterEach(() => {
    document.body.replaceChildren();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  });

  it('Dado um elemento com foco, então é ele o alvo', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    expect(focusReturnTarget(document)).toBe(button);
  });

  it('Dado o Safari (clique não foca o botão), então o último alvo de toque é o alvo', () => {
    const button = document.createElement('button');
    const label = document.createElement('span');
    button.append(label);
    document.body.append(button);
    (document.activeElement as HTMLElement | null)?.blur();

    pointerDown(label);

    expect(document.activeElement).toBe(document.body);
    expect(focusReturnTarget(document)).toBe(button);
  });

  it('Dado o toque numa área sem controle, então não há alvo', () => {
    const area = document.createElement('div');
    document.body.append(area);

    pointerDown(area);

    expect(focusReturnTarget(document)).toBeNull();
  });

  it('Dado o alvo removido do documento, então não há alvo', () => {
    const button = document.createElement('button');
    document.body.append(button);
    pointerDown(button);
    button.remove();

    expect(focusReturnTarget(document)).toBeNull();
  });

  it('Dado uma tecla depois do toque, então o toque antigo é esquecido', () => {
    const button = document.createElement('button');
    document.body.append(button);
    pointerDown(button);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));

    expect(focusReturnTarget(document)).toBeNull();
  });

  it('Dado o foco num ancestral do botão tocado (main com tabindex), então o botão é o alvo', () => {
    const main = document.createElement('main');
    main.tabIndex = -1;
    const button = document.createElement('button');
    main.append(button);
    document.body.append(main);
    main.focus();

    pointerDown(button);

    expect(focusReturnTarget(document)).toBe(button);
  });

  it('Dado o foco em outro campo (não ancestral), então o foco real vence o toque antigo', () => {
    const button = document.createElement('button');
    const input = document.createElement('input');
    document.body.append(button, input);
    pointerDown(button);
    input.focus();

    expect(focusReturnTarget(document)).toBe(input);
  });
});
