import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { NotesGateway } from '~/modules/notes/core/interfaces/notes.gateway';
import { NOTES_ENDPOINTS } from '~/modules/notes/infra/endpoints';
import { NotesRequestsFacade } from '~/modules/notes/infra/facades/notes-requests.facade';
import { provideNotes } from '~/modules/notes/infra/notes.providers';
import { MOCK_NOTE_SEED_PREFIX } from '~/modules/notes/mock-data/empty-notes';
import { aLinkResponse, aNoteResponse, aSummaryResponse } from '~/testing/notes-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideNotes(),
    ],
  });
  return { gateway: TestBed.inject(NotesGateway), http: TestBed.inject(HttpTestingController) };
}

describe('NotesRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta NotesGateway é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(NotesRequestsFacade));
  });

  it('Dado o mock e uma nota semeada pelo E2E no sessionStorage, então get a devolve (e só ela)', async () => {
    const { gateway } = setup(true);
    window.sessionStorage.setItem(
      `${MOCK_NOTE_SEED_PREFIX}semente`,
      JSON.stringify(aNoteResponse({ id: 'semente', body: '*a '.repeat(10) })),
    );

    const note = await firstValueFrom(gateway.get('semente'));

    expect(note).toMatchObject({ id: 'semente', body: '*a '.repeat(10) });
    await expect(firstValueFrom(gateway.get('outra'))).rejects.toMatchObject({
      problem: { status: 404 },
    });
  });

  it('Dado o mock, então a lista é vazia, criar devolve a nota sem persistir e o resto dá 404, sem HTTP', async () => {
    const { gateway, http } = setup(true);

    expect(await firstValueFrom(gateway.list({ page: 1, pageSize: 10 }))).toEqual({
      items: [],
      hasNext: false,
    });
    const created = await firstValueFrom(
      gateway.create({ path: 'reviews/x.md', body: '# x' }, 'key-1'),
    );
    expect(created).toMatchObject({ id: 'key-1', title: 'x', version: 0, body: '# x' });
    expect(await firstValueFrom(gateway.tags())).toEqual([]);
    expect(await firstValueFrom(gateway.backlinks('n', 1, 10))).toEqual({
      items: [],
      hasNext: false,
    });
    expect(
      await firstValueFrom(gateway.linkedTo({ type: 'GOAL', id: 'g', page: 1, pageSize: 5 })),
    ).toEqual({
      items: [],
      hasNext: false,
    });
    await expect(firstValueFrom(gateway.get('n'))).rejects.toMatchObject({
      problem: { status: 404, code: 'NOTE_NOT_FOUND' },
    });
    await expect(firstValueFrom(gateway.update('n', 'x', 1))).rejects.toBeTruthy();
    await expect(firstValueFrom(gateway.move('n', 'a.md', 1))).rejects.toBeTruthy();
    await expect(firstValueFrom(gateway.trash('n'))).rejects.toBeTruthy();
    await expect(firstValueFrom(gateway.restore('n'))).rejects.toBeTruthy();
    await expect(firstValueFrom(gateway.setLinks('n', [], 1))).rejects.toBeTruthy();
    await firstValueFrom(gateway.emptyTrash());
    http.expectNone(() => true);
  });

  it('Dado a lista, então manda os filtros na query e mapeia o resumo (sem corpo)', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(
      gateway.list({
        q: 'mac',
        tag: 'trabalho',
        folder: 'projetos',
        status: 'TRASHED',
        sort: 'RELEVANCE',
        page: 2,
        pageSize: 50,
      }),
    );

    const req = http.expectOne((r) => r.url === NOTES_ENDPOINTS.collection);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.toString()).toBe(
      'page=2&pageSize=50&q=mac&tag=trabalho&folder=projetos&status=TRASHED&sort=RELEVANCE',
    );
    req.flush({ items: [aSummaryResponse()], hasNext: true });

    const slice = await result;
    expect(slice.hasNext).toBe(true);
    expect(slice.items[0]).toEqual(aSummaryResponse());
    expect(Object.keys(slice.items[0]!)).not.toContain('body');
  });

  it('Dado criar, então POST com Idempotency-Key, vínculos tipados e a nota mapeada', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(
      gateway.create(
        {
          path: 'a.md',
          body: 'x',
          links: [
            { type: 'TRANSACTION', id: 'tx-1' },
            { type: 'MONTHLY_SUMMARY', key: '2026-10' },
          ],
        },
        'chave-1',
      ),
    );

    const req = http.expectOne(NOTES_ENDPOINTS.collection);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('chave-1');
    expect(req.request.body).toEqual({
      path: 'a.md',
      body: 'x',
      links: [
        { type: 'TRANSACTION', id: 'tx-1' },
        { type: 'MONTHLY_SUMMARY', key: '2026-10' },
      ],
    });
    req.flush(aNoteResponse({ links: [aLinkResponse({ state: 'PENDING', target: null })] }), {
      status: 201,
      statusText: 'Created',
    });

    const note = await result;
    expect(note.links[0]).toMatchObject({ state: 'PENDING', target: null, origin: 'WIKILINK' });
  });

  it('Dado criar sem vínculos, então o corpo não leva "links"', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.create({ path: 'a.md', body: 'x' }, 'k'));

    const req = http.expectOne(NOTES_ENDPOINTS.collection);
    expect(req.request.body).toEqual({ path: 'a.md', body: 'x' });
    req.flush(aNoteResponse());
    await result;
  });

  it('Dado salvar, mover, lixeira, restaurar e vínculos, então usam os caminhos e corpos do contrato', async () => {
    const { gateway, http } = setup(false);

    const update = firstValueFrom(gateway.update('n 1', 'texto', 3));
    const putReq = http.expectOne(NOTES_ENDPOINTS.item('n 1'));
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ body: 'texto', version: 3 });
    putReq.flush(aNoteResponse({ version: 4 }));
    expect((await update).version).toBe(4);

    const move = firstValueFrom(gateway.move('n1', 'novo/caminho.md', 4));
    const moveReq = http.expectOne(NOTES_ENDPOINTS.move('n1'));
    expect(moveReq.request.body).toEqual({ newPath: 'novo/caminho.md', version: 4 });
    moveReq.flush({
      note: aNoteResponse({ path: 'novo/caminho.md' }),
      rewrittenNotes: [{ id: 'n2', path: 'b.md', title: 'b' }],
    });
    const moved = await move;
    expect(moved.rewrittenNotes).toEqual([{ id: 'n2', path: 'b.md', title: 'b' }]);

    const trash = firstValueFrom(gateway.trash('n1'));
    const trashReq = http.expectOne(NOTES_ENDPOINTS.trashNote('n1'));
    expect(trashReq.request.method).toBe('POST');
    trashReq.flush(aNoteResponse({ trashedAt: '2026-10-06T10:00:00Z' }));
    expect((await trash).trashedAt).not.toBeNull();

    const restore = firstValueFrom(gateway.restore('n1'));
    http.expectOne(NOTES_ENDPOINTS.restore('n1')).flush(aNoteResponse());
    await restore;

    const links = firstValueFrom(gateway.setLinks('n1', [{ type: 'GOAL', id: 'g1' }], 5));
    const linksReq = http.expectOne(NOTES_ENDPOINTS.links('n1'));
    expect(linksReq.request.method).toBe('PUT');
    expect(linksReq.request.body).toEqual({ links: [{ type: 'GOAL', id: 'g1' }], version: 5 });
    linksReq.flush(aNoteResponse());
    await links;
  });

  it('Dado esvaziar a lixeira, então DELETE /v1/notes/trash', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.emptyTrash());

    const req = http.expectOne(NOTES_ENDPOINTS.trash);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(await result).toBeUndefined();
  });

  it('Dado backlinks, vinculadas e tags, então mapeia as respostas', async () => {
    const { gateway, http } = setup(false);

    const backlinks = firstValueFrom(gateway.backlinks('n1', 1, 50));
    http
      .expectOne((r) => r.url === NOTES_ENDPOINTS.backlinks('n1'))
      .flush({
        items: [{ noteId: 'n2', path: 'x.md', title: 'x', context: 'trecho' }],
        hasNext: false,
      });
    expect((await backlinks).items[0]).toEqual({
      noteId: 'n2',
      path: 'x.md',
      title: 'x',
      context: 'trecho',
    });

    const linked = firstValueFrom(
      gateway.linkedTo({ type: 'MONTHLY_SUMMARY', key: '2026-10', page: 1, pageSize: 20 }),
    );
    const req = http.expectOne((r) => r.url === NOTES_ENDPOINTS.linked);
    expect(req.request.params.toString()).toBe(
      'targetType=MONTHLY_SUMMARY&page=1&pageSize=20&targetKey=2026-10',
    );
    req.flush({ items: [aSummaryResponse()], hasNext: false });
    expect((await linked).items).toHaveLength(1);

    const tags = firstValueFrom(gateway.tags());
    http.expectOne(NOTES_ENDPOINTS.tags).flush([{ tag: 'revisao', count: 2 }]);
    expect(await tags).toEqual([{ tag: 'revisao', count: 2 }]);
  });

  it('Dado 409 VERSION_CONFLICT, então vira ProblemError tipado', async () => {
    const { gateway, http } = setup(false);
    const result = firstValueFrom(gateway.update('n1', 'x', 1));

    http
      .expectOne(NOTES_ENDPOINTS.item('n1'))
      .flush({ code: 'VERSION_CONFLICT', status: 409 }, { status: 409, statusText: 'Conflict' });

    await expect(result).rejects.toMatchObject({
      problem: { status: 409, code: 'VERSION_CONFLICT' },
    });
  });
});
