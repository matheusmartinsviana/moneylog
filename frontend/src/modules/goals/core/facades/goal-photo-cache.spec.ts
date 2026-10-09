import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';

import {
  GOAL_PHOTO_CACHE_LIMIT,
  GoalPhotoCache,
  photoKey,
} from '~/modules/goals/core/facades/goal-photo-cache';

const blob = () => new Blob(['x'], { type: 'image/jpeg' });

describe('GoalPhotoCache', () => {
  let counter = 0;
  let revoked: string[] = [];
  beforeEach(() => {
    counter = 0;
    revoked = [];
    URL.createObjectURL = vi.fn(() => `blob:sintetico-${++counter}`);
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
  });

  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(GoalPhotoCache);
  }

  it('Dado a mesma foto pedida duas vezes, então busca uma vez só e devolve o mesmo URL', () => {
    const cache = setup();
    const loader = vi.fn(() => of(blob()));
    const urls: string[] = [];

    cache.fetch('g/p/thumb', loader).subscribe((url) => urls.push(url));
    cache.fetch('g/p/thumb', loader).subscribe((url) => urls.push(url));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(urls).toEqual(['blob:sintetico-1', 'blob:sintetico-1']);
  });

  it('Dado dois pedidos enquanto o primeiro ainda carrega, então compartilha a mesma requisição', () => {
    const cache = setup();
    const pending = new Subject<Blob>();
    const loader = vi.fn(() => pending);
    const urls: string[] = [];

    cache.fetch('g/p/thumb', loader).subscribe((url) => urls.push(url));
    cache.fetch('g/p/thumb', loader).subscribe((url) => urls.push(url));
    pending.next(blob());
    pending.complete();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(urls).toHaveLength(2);
    expect(counter).toBe(1);
  });

  it('Dado o limite de imagens, então revoga a mais antiga que ninguém usa', () => {
    const cache = setup();
    for (let i = 0; i < GOAL_PHOTO_CACHE_LIMIT + 1; i++) {
      cache.fetch(`g/p${i}/thumb`, () => of(blob())).subscribe();
    }

    expect(cache.size).toBe(GOAL_PHOTO_CACHE_LIMIT);
    expect(revoked).toEqual(['blob:sintetico-1']);
  });

  it('Dado uma imagem em uso na tela, então ela nunca é revogada pelo limite', () => {
    const cache = setup();
    cache.fetch('g/p0/thumb', () => of(blob())).subscribe();
    cache.hold('g/p0/thumb');
    for (let i = 1; i <= GOAL_PHOTO_CACHE_LIMIT + 2; i++) {
      cache.fetch(`g/p${i}/thumb`, () => of(blob())).subscribe();
    }

    expect(revoked).not.toContain('blob:sintetico-1');
    cache.release('g/p0/thumb');
    expect(cache.size).toBeLessThanOrEqual(GOAL_PHOTO_CACHE_LIMIT);
  });

  it('Dado o logout (clear), então revoga todos os URLs e esvazia o cache', () => {
    const cache = setup();
    cache.fetch('g/a/thumb', () => of(blob())).subscribe();
    cache.fetch('g/b/display', () => of(blob())).subscribe();
    cache.hold('g/a/thumb');

    cache.clear();

    expect(revoked.sort()).toEqual(['blob:sintetico-1', 'blob:sintetico-2']);
    expect(cache.size).toBe(0);
  });

  it('Dado um envio em andamento no logout, então a imagem que chega depois não fica guardada', () => {
    const cache = setup();
    const pending = new Subject<Blob>();
    cache.fetch('g/a/thumb', () => pending).subscribe();

    cache.clear();
    pending.next(blob());

    expect(cache.size).toBe(0);
    expect(revoked).toEqual(['blob:sintetico-1']);
  });

  it('Dado uma foto removida, então as duas versões são revogadas (ou na hora de soltar, se em uso)', () => {
    const cache = setup();
    cache.fetch(photoKey('g', 'p', 'thumb'), () => of(blob())).subscribe();
    cache.fetch(photoKey('g', 'p', 'display'), () => of(blob())).subscribe();
    cache.hold(photoKey('g', 'p', 'display'));

    cache.forgetPhoto('g', 'p');
    expect(revoked).toEqual(['blob:sintetico-1']);
    cache.release(photoKey('g', 'p', 'display'));

    expect(revoked).toEqual(['blob:sintetico-1', 'blob:sintetico-2']);
    expect(cache.size).toBe(0);
  });

  it('Dado erro ao carregar, então nada fica guardado e o próximo pedido tenta de novo', () => {
    const cache = setup();
    const failing = new Subject<Blob>();
    const errors: unknown[] = [];
    cache.fetch('g/p/thumb', () => failing).subscribe({ error: (e: unknown) => errors.push(e) });
    failing.error(new Error('rede'));

    const urls: string[] = [];
    cache.fetch('g/p/thumb', () => of(blob())).subscribe((url) => urls.push(url));

    expect(errors).toHaveLength(1);
    expect(urls).toEqual(['blob:sintetico-1']);
  });
});
