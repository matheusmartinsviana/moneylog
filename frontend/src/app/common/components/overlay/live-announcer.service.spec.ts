import { TestBed } from '@angular/core/testing';

import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { lockModal } from '~/app/common/components/overlay/modal-lock';

const region = () => document.querySelector<HTMLElement>('[data-cy="live-announcer"]');

describe('LiveAnnouncer', () => {
  // Outro spec do mesmo worker pode ter deixado uma região no body: começa sempre limpo.
  beforeEach(() => document.body.replaceChildren());

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('Dado o primeiro anúncio, então cria uma região aria-live educada no body', () => {
    TestBed.inject(LiveAnnouncer).announce('3 opções');

    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveAttribute('aria-atomic', 'true');
    expect(region()?.parentElement).toBe(document.body);
    expect(region()).toHaveTextContent('3 opções');
  });

  it('Dado a mesma mensagem em sequência, então o texto alterna para ser lido de novo', () => {
    const announcer = TestBed.inject(LiveAnnouncer);

    announcer.announce('outubro');
    const first = region()?.textContent;
    announcer.announce('outubro');

    expect(region()?.textContent).not.toBe(first);
    expect(region()?.textContent?.trim()).toBe('outubro');
  });

  it('Dado um modal aberto, então a região se muda para dentro dele e anuncia de lá', () => {
    vi.useFakeTimers();
    const announcer = TestBed.inject(LiveAnnouncer);
    announcer.announce('antes');
    const modal = document.createElement('div');
    document.body.append(modal);
    const release = lockModal(modal);

    announcer.announce('novembro');
    vi.advanceTimersByTime(60);

    expect(region()?.parentElement).toBe(modal);
    expect(region()?.textContent?.trim()).toBe('novembro');

    release();
    announcer.announce('depois');
    vi.advanceTimersByTime(60);
    expect(region()?.parentElement).toBe(document.body);
  });

  it('Dado dois anúncios em menos de 50 ms com a região recém-movida, então o texto novo vence o antigo', () => {
    vi.useFakeTimers();
    const announcer = TestBed.inject(LiveAnnouncer);
    announcer.announce('antes');
    const modal = document.createElement('div');
    document.body.append(modal);
    const release = lockModal(modal);

    announcer.announce('velho');
    vi.advanceTimersByTime(10);
    announcer.announce('novo');
    vi.advanceTimersByTime(100);

    expect(region()?.textContent?.trim()).toBe('novo');
    release();
  });

  it('Dado a região removida do documento, então ela é recriada no próximo anúncio', () => {
    const announcer = TestBed.inject(LiveAnnouncer);
    announcer.announce('a');
    region()?.remove();

    announcer.announce('b');

    expect(region()).toHaveTextContent('b');
  });

  it('Dado a região segura, então o modal não a deixa inert', () => {
    TestBed.inject(LiveAnnouncer).announce('a');
    const modal = document.createElement('div');
    document.body.append(modal);

    const release = lockModal(modal);

    expect(region()).not.toHaveAttribute('inert');
    release();
  });
});
