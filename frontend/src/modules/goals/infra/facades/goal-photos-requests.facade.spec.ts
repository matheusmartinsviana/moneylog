import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, toArray } from 'rxjs';

import { GoalPhotosGateway } from '~/modules/goals/core/interfaces/goal-photos.gateway';
import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import { GoalPhotosRequestsFacade } from '~/modules/goals/infra/facades/goal-photos-requests.facade';
import { toGoal } from '~/modules/goals/infra/facades/goals-response.mapper';
import { provideGoals } from '~/modules/goals/infra/goals.providers';
import { aGoalResponse } from '~/testing/goals-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks = false) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideGoals(),
    ],
  });
  return {
    gateway: TestBed.inject(GoalPhotosGateway),
    goals: TestBed.inject(GoalsGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

const PHOTO = {
  id: 'photo-1',
  position: 0,
  width: 640,
  height: 360,
  createdAt: '2026-10-10T12:00:00Z',
};

describe('GoalPhotosRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta de fotos é a facade de requisições', () => {
    const { gateway } = setup();
    expect(gateway).toBe(TestBed.inject(GoalPhotosRequestsFacade));
  });

  it('Dado o envio, então POST multipart no campo "file" com Idempotency-Key, devolvendo progresso e a foto', async () => {
    const { gateway, http } = setup();
    const file = new File(['bytes'], 'carro.jpg', { type: 'image/jpeg' });

    const events = firstValueFrom(
      gateway.upload('g 1', file, 'carro.jpg', 'key-1').pipe(toArray()),
    );
    const req = http.expectOne('/v1/goals/g%201/photos');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.reportProgress).toBe(true);
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('carro.jpg');
    // O Content-Type multipart (com boundary) é do navegador: o app não o fixa.
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    req.flush(PHOTO, { status: 201, statusText: 'Created' });

    expect(await events).toEqual([
      { kind: 'progress', percent: 50 },
      { kind: 'done', photo: PHOTO },
    ]);
  });

  it('Dado erro do servidor no envio, então vira ProblemError com o code do contrato', async () => {
    const { gateway, http } = setup();

    const result = firstValueFrom(gateway.upload('g', new File(['x'], 'a.jpg'), 'a.jpg', 'k'));
    http.expectOne('/v1/goals/g/photos').flush(
      { type: 'about:blank', title: 'x', status: 422, code: 'GOAL_PHOTO_LIMIT_REACHED' },
      {
        status: 422,
        statusText: 'Unprocessable',
        headers: { 'Content-Type': 'application/problem+json' },
      },
    );

    await expect(result).rejects.toMatchObject({
      problem: { status: 422, code: 'GOAL_PHOTO_LIMIT_REACHED' },
    });
  });

  it('Dado o conteúdo, então GET como Blob com a variante e sem token na URL', async () => {
    const { gateway, http } = setup();

    const result = firstValueFrom(gateway.content('g', 'p', 'display'));
    const req = http.expectOne((r) => r.url === '/v1/goals/g/photos/p/content');
    expect(req.request.params.get('variant')).toBe('display');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.urlWithParams).not.toMatch(/token|bearer|access/i);
    req.flush(new Blob(['x'], { type: 'image/jpeg' }));

    expect(await result).toBeInstanceOf(Blob);
  });

  it('Dado falha no conteúdo (corpo Blob com problem+json), então preserva o code', async () => {
    const { gateway, http } = setup();

    const result = firstValueFrom(gateway.content('g', 'p', 'thumb'));
    http
      .expectOne((r) => r.url === '/v1/goals/g/photos/p/content')
      .flush(
        new Blob([JSON.stringify({ status: 404, code: 'GOAL_PHOTO_NOT_FOUND' })], {
          type: 'application/problem+json',
        }),
        { status: 404, statusText: 'Not Found' },
      );

    await expect(result).rejects.toMatchObject({ problem: { code: 'GOAL_PHOTO_NOT_FOUND' } });
  });

  it('Dado reordenar, capa e remover, então devolvem a meta mapeada da resposta', async () => {
    const { gateway, http } = setup();
    const response = aGoalResponse({
      id: 'g',
      featured: true,
      coverPhotoId: 'p2',
      photos: [PHOTO],
    });

    const order = firstValueFrom(gateway.reorder('g', ['p2', 'p1']));
    const orderReq = http.expectOne('/v1/goals/g/photos/order');
    expect(orderReq.request.method).toBe('PUT');
    expect(orderReq.request.body).toEqual({ photoIds: ['p2', 'p1'] });
    orderReq.flush(response);
    expect(await order).toMatchObject({ featured: true, coverPhotoId: 'p2', photos: [PHOTO] });

    const cover = firstValueFrom(gateway.setCover('g', 'p2'));
    const coverReq = http.expectOne('/v1/goals/g/photos/p2/cover');
    expect(coverReq.request.method).toBe('PUT');
    coverReq.flush(response);
    await cover;

    const remove = firstValueFrom(gateway.remove('g', 'p2'));
    const removeReq = http.expectOne('/v1/goals/g/photos/p2');
    expect(removeReq.request.method).toBe('DELETE');
    removeReq.flush(response);
    await remove;
  });

  it('Dado o destaque, então PUT /featured com o corpo e a meta da resposta', async () => {
    const { goals, http } = setup();

    const result = firstValueFrom(goals.setFeatured('g', true));
    const req = http.expectOne('/v1/goals/g/featured');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ featured: true });
    req.flush(aGoalResponse({ id: 'g', featured: true }));

    expect((await result).featured).toBe(true);
  });

  it('Dado a lista de destaque, então envia featured=true', async () => {
    const { goals, http } = setup();

    const result = firstValueFrom(
      goals.list({ status: 'ACTIVE', featured: true, page: 1, pageSize: 10 }),
    );
    const req = http.expectOne((r) => r.url === '/v1/goals');
    expect(req.request.params.get('featured')).toBe('true');
    req.flush({ items: [], hasNext: false });

    expect((await result).items).toEqual([]);
  });

  it('Dado resposta de servidor antigo (sem fotos nem destaque), então vira false, null e lista vazia', () => {
    setup();
    const legacy: Record<string, unknown> = { ...aGoalResponse() };
    delete legacy['featured'];
    delete legacy['coverPhotoId'];
    delete legacy['photos'];

    expect(toGoal(legacy as unknown as ReturnType<typeof aGoalResponse>)).toMatchObject({
      featured: false,
      coverPhotoId: null,
      photos: [],
    });
  });

  it('Dado o mock, então as fotos respondem 404 sem requisição', async () => {
    const { gateway, http } = setup(true);

    await expect(firstValueFrom(gateway.content('g', 'p', 'thumb'))).rejects.toMatchObject({
      problem: { status: 404 },
    });
    await expect(
      firstValueFrom(gateway.upload('g', new File(['x'], 'a.jpg'), 'a.jpg', 'k')),
    ).rejects.toMatchObject({ problem: { status: 404 } });
    http.expectNone(() => true);
  });
});
