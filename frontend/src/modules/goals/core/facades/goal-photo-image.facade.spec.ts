import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { GoalPhotoCache } from '~/modules/goals/core/facades/goal-photo-cache';
import { GoalPhotoImageFacade } from '~/modules/goals/core/facades/goal-photo-image.facade';
import { failWith } from '~/testing/accounts-testing';
import { GoalPhotosGatewayStub, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';

function setup(photos = new GoalPhotosGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideGoalsStub(new GoalsGatewayStub(), photos), GoalPhotoImageFacade],
  });
  return {
    photos,
    cache: TestBed.inject(GoalPhotoCache),
    facade: TestBed.inject(GoalPhotoImageFacade),
  };
}

describe('GoalPhotoImageFacade', () => {
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

  it('Dado uma foto, então busca pela porta (com Bearer do interceptor) e expõe o blob URL', () => {
    const { facade, photos } = setup();

    facade.show('g', 'p', 'thumb');

    expect(photos.contentCalls).toEqual(['g/p/thumb']);
    expect(facade.state()).toEqual({ status: 'ready', url: 'blob:sintetico-1' });
  });

  it('Dado a mesma foto em outra instância, então vem do cache sem nova requisição', () => {
    const { facade, photos } = setup();

    facade.show('g', 'p', 'thumb');
    facade.show('g', 'p', 'thumb');

    expect(photos.contentCalls).toHaveLength(1);
  });

  it('Dado falha, então o estado é erro tipado e "tentar de novo" busca de novo', () => {
    const photos = new GoalPhotosGatewayStub();
    photos.content$ = failWith(404, 'GOAL_PHOTO_NOT_FOUND');
    const { facade } = setup(photos);

    facade.show('g', 'p', 'thumb');
    expect(facade.state()).toMatchObject({
      status: 'error',
      problem: { code: 'GOAL_PHOTO_NOT_FOUND' },
    });

    photos.content$ = null;
    facade.retry();

    expect(facade.state().status).toBe('ready');
  });

  it('Dado trocar de foto antes de a primeira chegar, então a antiga é descartada', () => {
    const photos = new GoalPhotosGatewayStub();
    const first = new Subject<Blob>();
    photos.content$ = first;
    const { facade } = setup(photos);
    facade.show('g', 'a', 'thumb');

    photos.content$ = null;
    facade.show('g', 'b', 'thumb');
    first.next(new Blob(['x']));

    expect(facade.state()).toEqual({ status: 'ready', url: 'blob:sintetico-1' });
    expect(photos.contentCalls).toEqual(['g/a/thumb', 'g/b/thumb']);
  });

  it('Dado destruir a facade, então solta a imagem para o cache poder revogar', () => {
    const { facade, cache } = setup();
    facade.show('g', 'p', 'thumb');
    const release = vi.spyOn(cache, 'release');

    TestBed.resetTestingModule();

    expect(release).toHaveBeenCalledWith('g/p/thumb');
  });

  it('Dado preload, então aquece o cache sem mudar a imagem exibida e engole falhas', () => {
    const { facade, photos } = setup();
    facade.show('g', 'a', 'thumb');

    facade.preload('g', 'b', 'thumb');
    photos.content$ = failWith(500, 'INTERNAL_ERROR');
    expect(() => facade.preload('g', 'c', 'thumb')).not.toThrow();

    expect(photos.contentCalls).toEqual(['g/a/thumb', 'g/b/thumb', 'g/c/thumb']);
    expect(facade.state()).toEqual({ status: 'ready', url: 'blob:sintetico-1' });
    expect(revoked).toEqual([]);
  });
});
