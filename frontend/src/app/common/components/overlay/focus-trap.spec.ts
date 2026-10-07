import { focusableElements, trapTab } from '~/app/common/components/overlay/focus-trap';

function container(html: string): HTMLElement {
  const root = document.createElement('div');
  root.tabIndex = -1;
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function tab(shift = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, cancelable: true });
}

describe('focus-trap', () => {
  afterEach(() => document.body.replaceChildren());

  it('Dado o contêiner, então lista só os focáveis visíveis, não inertes e habilitados', () => {
    const root = container(`
      <button id="a">a</button>
      <button disabled>b</button>
      <button hidden>c</button>
      <div inert><button>d</button></div>
      <button aria-hidden="true">e</button>
      <input id="f" />
      <button tabindex="-1">g</button>
      <a href="#x" id="h">h</a>`);

    expect(focusableElements(root).map((el) => el.id)).toEqual(['a', 'f', 'h']);
  });

  it('Dado Tab no último, então volta ao primeiro; Shift+Tab no primeiro vai ao último', () => {
    const root = container('<button id="a">a</button><button id="b">b</button>');
    const [first, last] = Array.from(root.querySelectorAll('button')) as HTMLElement[];

    last?.focus();
    const forward = tab();
    expect(trapTab(forward, root, document)).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = tab(true);
    expect(trapTab(backward, root, document)).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('Dado Tab no meio, então o foco anda para o próximo (o navegador não é consultado)', () => {
    const root = container(
      '<button id="a">a</button><button id="m">m</button><button id="z">z</button>',
    );
    root.querySelector<HTMLElement>('#m')?.focus();

    const forward = tab();
    expect(trapTab(forward, root, document)).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('z');

    expect(trapTab(tab(true), root, document)).toBe(true);
    expect(document.activeElement?.id).toBe('m');
    expect(trapTab(tab(true), root, document)).toBe(true);
    expect(document.activeElement?.id).toBe('a');
  });

  it('Dado o foco num item fora da ordem de Tab (tabindex -1, como em um menu), então Tab vai ao primeiro e Shift+Tab ao último', () => {
    const root = container(
      '<button id="close">x</button><div><button id="item" tabindex="-1">i</button></div><button id="end">e</button>',
    );
    const item = root.querySelector<HTMLElement>('#item');

    item?.focus();
    expect(trapTab(tab(), root, document)).toBe(true);
    expect(document.activeElement?.id).toBe('close');

    item?.focus();
    expect(trapTab(tab(true), root, document)).toBe(true);
    expect(document.activeElement?.id).toBe('end');
  });

  it('Dado contêiner sem focáveis, então o foco fica no próprio contêiner', () => {
    const root = container('<p>só texto</p>');
    const event = tab();

    expect(trapTab(event, root, document)).toBe(true);
    expect(document.activeElement).toBe(root);
  });

  it('Dado outra tecla, então ignora', () => {
    const root = container('<button>a</button>');
    expect(
      trapTab(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }), root, document),
    ).toBe(false);
  });
});
