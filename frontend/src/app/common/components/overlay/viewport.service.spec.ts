import { TestBed } from '@angular/core/testing';

import { COMPACT_QUERY, ViewportService } from '~/app/common/components/overlay/viewport.service';

type Listener = () => void;

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initial,
    media: COMPACT_QUERY,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList);
  return {
    listeners,
    set(value: boolean) {
      query.matches = value;
      for (const fn of listeners) fn();
    },
    restore: () => (window.matchMedia = original),
  };
}

describe('ViewportService', () => {
  it('Dado uma tela de até 640 px, então é compacta', () => {
    const media = stubMatchMedia(true);
    expect(TestBed.inject(ViewportService).compact()).toBe(true);
    media.restore();
  });

  it('Dado a rotação, quando a consulta muda, então o sinal acompanha', () => {
    const media = stubMatchMedia(false);
    const service = TestBed.inject(ViewportService);
    expect(service.compact()).toBe(false);

    media.set(true);
    expect(service.compact()).toBe(true);

    media.restore();
  });

  it('Dado o serviço destruído, então o ouvinte da consulta é removido', () => {
    const media = stubMatchMedia(false);
    TestBed.inject(ViewportService);
    expect(media.listeners.size).toBe(1);

    TestBed.resetTestingModule();

    expect(media.listeners.size).toBe(0);
    media.restore();
  });

  it('Dado um navegador sem matchMedia, então nunca é compacta', () => {
    const original = window.matchMedia;
    // @ts-expect-error simula um ambiente sem matchMedia
    window.matchMedia = undefined;

    expect(TestBed.inject(ViewportService).compact()).toBe(false);

    window.matchMedia = original;
  });
});
