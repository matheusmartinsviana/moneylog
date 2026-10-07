import { activeModal, lockModal } from '~/app/common/components/overlay/modal-lock';

const releases: (() => void)[] = [];

function lock(modal: HTMLElement): () => void {
  const release = lockModal(modal);
  releases.push(release);
  return release;
}

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('lockModal', () => {
  afterEach(() => {
    for (const release of releases.splice(0)) release();
    document.body.replaceChildren();
    document.body.removeAttribute('style');
  });

  it('Dado um modal, quando trava, então o resto da página fica inert e o modal não', () => {
    const app = mount('<main id="page"><button id="x">x</button></main>');
    const modal = mount('<div id="modal"><button>ok</button></div>');

    const release = lock(modal);

    expect(app).toHaveAttribute('inert');
    expect(modal).not.toHaveAttribute('inert');
    expect(activeModal()).toBe(modal);

    release();
    expect(app).not.toHaveAttribute('inert');
    expect(activeModal()).toBeNull();
  });

  it('Dado um modal dentro do app, quando trava, então só os irmãos do caminho ficam inert', () => {
    const app = mount(
      '<header id="head"></header><section id="holder"><div id="modal"></div><p id="other"></p></section>',
    );
    const modal = app.querySelector<HTMLElement>('#modal')!;

    lock(modal);

    expect(app.querySelector('#head')).toHaveAttribute('inert');
    expect(app.querySelector('#other')).toHaveAttribute('inert');
    expect(app.querySelector('#holder')).not.toHaveAttribute('inert');
    expect(modal).not.toHaveAttribute('inert');
  });

  it('Dado uma região segura (avisos), quando trava, então ela continua acessível', () => {
    const app = mount('<main id="page"></main><div id="toasts" data-modal-safe></div>');
    const modal = mount('<div></div>');

    lock(modal);

    expect(app.querySelector('#page')).toHaveAttribute('inert');
    expect(app.querySelector('#toasts')).not.toHaveAttribute('inert');
  });

  it('Dado uma região segura aninhada, quando trava, então só o que não a contém fica inert', () => {
    const app = mount(
      '<div id="shell"><nav id="nav"></nav><div id="toasts" data-modal-safe></div></div>',
    );
    const modal = mount('<div></div>');

    lock(modal);

    expect(app.querySelector('#shell')).not.toHaveAttribute('inert');
    expect(app.querySelector('#nav')).toHaveAttribute('inert');
    expect(app.querySelector('#toasts')).not.toHaveAttribute('inert');
  });

  it('Dado dois modais empilhados, quando fecha o do topo, então o de baixo volta a ser o ativo', () => {
    const app = mount('<main></main>');
    const first = mount('<div></div>');
    const second = mount('<div></div>');

    const releaseFirst = lock(first);
    const releaseSecond = lock(second);
    expect(activeModal()).toBe(second);
    expect(first).toHaveAttribute('inert');

    releaseSecond();
    expect(activeModal()).toBe(first);
    expect(first).not.toHaveAttribute('inert');
    expect(app).toHaveAttribute('inert');

    releaseFirst();
    expect(app).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('Dado soltar duas vezes, quando repete, então é inofensivo', () => {
    const modal = mount('<div></div>');
    const release = lock(modal);

    release();
    release();

    expect(activeModal()).toBeNull();
  });
});
