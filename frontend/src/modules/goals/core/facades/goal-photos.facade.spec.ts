import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { GoalPhotoCache } from '~/modules/goals/core/facades/goal-photo-cache';
import { GoalPhotosFacade } from '~/modules/goals/core/facades/goal-photos.facade';
import type { PhotoUploadEvent } from '~/modules/goals/core/interfaces/goal-photos.gateway';
import { GOAL_PHOTO_MAX_BYTES } from '~/modules/goals/core/types/goal';
import { failWith } from '~/testing/accounts-testing';
import {
  aDreamGoal,
  aGoal,
  aGoalPhoto,
  GoalPhotosGatewayStub,
  GoalsGatewayStub,
  provideGoalsStub,
} from '~/testing/goals-testing';

const jpg = (name: string, size = 10) => {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

function setup(photos = new GoalPhotosGatewayStub(), goals = new GoalsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideGoalsStub(goals, photos), GoalPhotosFacade],
  });
  return { photos, goals, facade: TestBed.inject(GoalPhotosFacade) };
}

const done = (id: string): PhotoUploadEvent => ({ kind: 'done', photo: aGoalPhoto({ id }) });

describe('GoalPhotosFacade', () => {
  describe('escolha de arquivos (validação só por conforto)', () => {
    it('Dado tipo, vazio e tamanho inválidos, então recusa cada um com o motivo, sem chamar a API', () => {
      const { facade, photos } = setup();

      facade.add([
        new File(['x'], 'nota.txt', { type: 'text/plain' }),
        jpg('vazio.jpg', 0),
        jpg('grande.jpg', GOAL_PHOTO_MAX_BYTES + 1),
        jpg('ok.jpg'),
      ]);

      expect(facade.rejections()).toEqual([
        { name: 'nota.txt', reason: 'type' },
        { name: 'vazio.jpg', reason: 'empty' },
        { name: 'grande.jpg', reason: 'size' },
      ]);
      expect(facade.queue().map((item) => item.file.name)).toEqual(['ok.jpg']);
      expect(photos.uploads).toHaveLength(0);
    });

    it('Dado arquivo sem tipo mas com extensão png, então aceita (alguns navegadores não informam o tipo)', () => {
      const { facade } = setup();

      facade.add([new File(['x'], 'sonho.PNG', { type: '' })]);

      expect(facade.queue()).toHaveLength(1);
    });

    it('Dado nove arquivos, então a nona é recusada pelo limite e o contador para em 8', () => {
      const { facade } = setup();

      facade.add(Array.from({ length: 9 }, (_, i) => jpg(`f${i}.jpg`)));

      expect(facade.count()).toBe(8);
      expect(facade.full()).toBe(true);
      expect(facade.rejections()).toEqual([{ name: 'f8.jpg', reason: 'limit' }]);
    });

    it('Dado fotos já na meta, então elas contam para o limite', () => {
      const { facade, photos } = setup();
      photos.controlUpload();
      facade.setGoal(aDreamGoal(7));

      facade.add([jpg('a.jpg'), jpg('b.jpg')]);

      expect(facade.count()).toBe(8);
      expect(facade.rejections()).toEqual([{ name: 'b.jpg', reason: 'limit' }]);
    });
  });

  describe('envio', () => {
    it('Dado a meta ainda não criada, então as fotos esperam e sobem na ordem quando a meta chega', () => {
      const { facade, photos } = setup();
      facade.add([jpg('a.jpg'), jpg('b.jpg')]);
      expect(photos.uploads).toHaveLength(0);

      facade.setGoal(aGoal({ id: 'goal-new', photos: [] }));

      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg', 'b.jpg']);
      expect(photos.uploads.every((upload) => upload.goalId === 'goal-new')).toBe(true);
      expect(new Set(photos.uploads.map((upload) => upload.key)).size).toBe(2);
      expect(facade.queue()).toEqual([]);
    });

    it('Dado várias fotos, então envia uma por vez e mostra o progresso', () => {
      const goals = new GoalsGatewayStub();
      goals.getResult = of(
        aGoal({
          id: 'g',
          photos: [aGoalPhoto({ id: 'p-a' }), aGoalPhoto({ id: 'p-b', position: 1 })],
        }),
      );
      const { facade, photos } = setup(new GoalPhotosGatewayStub(), goals);
      const first = photos.controlUpload();
      const second = photos.controlUpload();
      facade.setGoal(aGoal({ id: 'g', photos: [] }));

      facade.add([jpg('a.jpg'), jpg('b.jpg')]);
      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg']);
      first.next({ kind: 'progress', percent: 40 });
      expect(facade.queue()[0]).toMatchObject({ status: 'uploading', percent: 40 });
      first.next(done('p-a'));
      first.complete();

      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg', 'b.jpg']);
      second.next(done('p-b'));
      second.complete();
      expect(facade.queue()).toEqual([]);
      expect(facade.photos().map((photo) => photo.id)).toEqual(['p-a', 'p-b']);
    });

    it('Dado o fim do lote, então relê a meta do backend (capa e ordem vêm do servidor)', () => {
      const goals = new GoalsGatewayStub();
      goals.goals = [aDreamGoal(2, { id: 'g' })];
      const { facade } = setup(new GoalPhotosGatewayStub(), goals);
      facade.setGoal(aGoal({ id: 'g', photos: [] }));

      facade.add([jpg('a.jpg')]);

      expect(goals.calls).toContain('get:g');
      expect(facade.photos()).toHaveLength(2);
      expect(facade.coverPhotoId()).toBe('photo-1');
    });

    it('Dado cancelar durante o envio, então a foto sai da fila e a seguinte continua', () => {
      const { facade, photos } = setup();
      const first = photos.controlUpload();
      facade.setGoal(aGoal({ id: 'g', photos: [] }));
      facade.add([jpg('a.jpg'), jpg('b.jpg')]);
      const firstId = facade.queue()[0]!.localId;

      facade.cancel(firstId);

      expect(first.observed).toBe(false);
      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg', 'b.jpg']);
      expect(facade.queue()).toEqual([]);
    });

    it('Dado cancelar uma foto que ainda espera, então ela nunca é enviada', () => {
      const { facade, photos } = setup();
      photos.controlUpload();
      facade.setGoal(aGoal({ id: 'g', photos: [] }));
      facade.add([jpg('a.jpg'), jpg('b.jpg')]);
      const waiting = facade.queue()[1]!.localId;

      facade.cancel(waiting);

      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg']);
    });

    it('Dado falha numa foto, então só ela fica com erro tipado, as outras seguem e as enviadas permanecem', () => {
      const photos = new GoalPhotosGatewayStub();
      photos.uploadResults.push(of(done('p-a')), failWith(422, 'GOAL_PHOTO_UNSUPPORTED_TYPE'));
      const goals = new GoalsGatewayStub();
      goals.getResult = of(aGoal({ id: 'g', photos: [aGoalPhoto({ id: 'p-a' })] }));
      const { facade } = setup(photos, goals);
      facade.setGoal(aGoal({ id: 'g', photos: [] }));

      facade.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]);

      expect(facade.photos().map((photo) => photo.id)).toContain('p-a');
      expect(facade.failed()).toHaveLength(1);
      expect(facade.failed()[0]).toMatchObject({
        status: 'failed',
        problem: { code: 'GOAL_PHOTO_UNSUPPORTED_TYPE' },
      });
      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });

    it('Dado falha de rede, então "tentar de novo" reenvia o mesmo arquivo com a MESMA Idempotency-Key', () => {
      const photos = new GoalPhotosGatewayStub();
      photos.uploadResults.push(failWith(0, 'NETWORK'));
      const { facade } = setup(photos);
      facade.setGoal(aGoal({ id: 'g', photos: [] }));
      facade.add([jpg('a.jpg')]);
      const item = facade.failed()[0]!;

      facade.retry(item.localId);

      expect(photos.uploads).toHaveLength(2);
      expect(photos.uploads[1]).toEqual({ goalId: 'g', fileName: 'a.jpg', key: item.key });
      expect(facade.queue()).toEqual([]);
    });

    it('Dado várias falhas, então "tentar de novo" em todas reenvia só as que falharam', () => {
      const photos = new GoalPhotosGatewayStub();
      photos.uploadResults.push(failWith(0, 'NETWORK'), of(done('ok')), failWith(0, 'NETWORK'));
      const { facade } = setup(photos);
      facade.setGoal(aGoal({ id: 'g', photos: [] }));
      facade.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]);
      expect(facade.failed().map((item) => item.file.name)).toEqual(['a.jpg', 'c.jpg']);

      facade.retryAll();

      expect(photos.uploads.slice(3).map((upload) => upload.fileName)).toEqual(['a.jpg', 'c.jpg']);
      expect(facade.failed()).toEqual([]);
    });

    it('Dado o fim da fila, então avisa que assentou (settled$)', () => {
      const { facade } = setup();
      const settled = vi.fn();
      facade.settled$.subscribe(settled);
      facade.setGoal(aGoal({ id: 'g', photos: [] }));

      facade.add([jpg('a.jpg'), jpg('b.jpg')]);

      expect(settled).toHaveBeenCalledTimes(1);
      expect(facade.busy()).toBe(false);
    });
  });

  describe('antes de a meta existir (criação)', () => {
    it('Dado mover e definir capa, então só reordena a fila local, que é a ordem final', () => {
      const { facade } = setup();
      facade.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]);
      const [a, , c] = facade.queue();

      facade.moveQueued(a!.localId, 1);
      expect(facade.queue().map((item) => item.file.name)).toEqual(['b.jpg', 'a.jpg', 'c.jpg']);
      facade.makeQueuedCover(c!.localId);
      expect(facade.queue().map((item) => item.file.name)).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
      facade.moveQueued(facade.queue()[0]!.localId, -1);

      expect(facade.queue().map((item) => item.file.name)).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
    });

    it('Dado o destaque ligado antes de existir a meta, então guarda a intenção e aplica depois de criar', () => {
      const { facade, goals } = setup();

      facade.setFeatured(true);
      expect(facade.featured()).toBe(true);
      expect(facade.hasPending()).toBe(true);
      expect(goals.calls).not.toContain('featured:g:true');
      facade.setGoal(aGoal({ id: 'g', featured: false, photos: [] }));

      expect(goals.calls).toContain('featured:g:true');
    });
  });

  describe('escritas na meta existente (a resposta do backend vira o estado)', () => {
    it('Dado mover para a direita, então manda o conjunto exato na nova ordem e anuncia a posição', () => {
      const { facade, photos } = setup();
      facade.setGoal(aDreamGoal(3));
      const changed = vi.fn();
      facade.goalChanged$.subscribe(changed);

      facade.move('photo-1', 1);

      expect(photos.calls).toContain('reorder:goal-dream:photo-2,photo-1,photo-3');
      expect(facade.photos().map((photo) => photo.id)).toEqual(['photo-2', 'photo-1', 'photo-3']);
      expect(facade.lastMove()).toEqual({ photoId: 'photo-1', position: 2, total: 3 });
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('Dado mover no limite da lista, então não chama a API', () => {
      const { facade, photos } = setup();
      facade.setGoal(aDreamGoal(3));

      facade.move('photo-1', -1);
      facade.move('photo-3', 1);

      expect(photos.calls).toEqual([]);
    });

    it('Dado dois movimentos seguidos, então vão em fila e o segundo parte do resultado do primeiro', () => {
      const { facade, photos } = setup();
      facade.setGoal(aDreamGoal(3));

      facade.move('photo-1', 1);
      facade.move('photo-1', 1);

      expect(photos.calls).toEqual([
        'reorder:goal-dream:photo-2,photo-1,photo-3',
        'reorder:goal-dream:photo-2,photo-3,photo-1',
      ]);
    });

    it('Dado definir capa, então chama a capa; se já é a capa, não faz nada', () => {
      const { facade, photos } = setup();
      facade.setGoal(aDreamGoal(3));

      facade.makeCover('photo-1');
      facade.makeCover('photo-3');

      expect(photos.calls).toEqual(['cover:goal-dream:photo-3']);
      expect(facade.coverPhotoId()).toBe('photo-3');
    });

    it('Dado remover, então chama a API e esquece a foto no cache de imagens', () => {
      const { facade, photos } = setup();
      const forget = vi.spyOn(TestBed.inject(GoalPhotoCache), 'forgetPhoto');
      facade.setGoal(aDreamGoal(3));

      facade.remove('photo-2');

      expect(photos.calls).toEqual(['remove:goal-dream:photo-2']);
      expect(forget).toHaveBeenCalledWith('goal-dream', 'photo-2');
    });

    it('Dado falha ao reordenar, então mostra o motivo e relê a meta do backend', () => {
      const photos = new GoalPhotosGatewayStub();
      photos.next = failWith(422, 'GOAL_PHOTOS_ORDER_MISMATCH');
      const goals = new GoalsGatewayStub();
      goals.goals = [aDreamGoal(2)];
      const { facade } = setup(photos, goals);
      facade.setGoal(aDreamGoal(3));

      facade.move('photo-1', 1);

      expect(facade.problem()).toMatchObject({ code: 'GOAL_PHOTOS_ORDER_MISMATCH' });
      expect(goals.calls).toContain('get:goal-dream');
      expect(facade.photos()).toHaveLength(2);
    });

    it('Dado ligar o destaque em meta existente, então a meta da resposta vira o estado', () => {
      const { facade, goals } = setup();
      facade.setGoal(aGoal({ id: 'g', featured: false, photos: [] }));

      facade.setFeatured(true);

      expect(goals.calls).toContain('featured:g:true');
      expect(facade.featured()).toBe(true);
    });

    it('Dado destaque recusado (meta arquivada), então mostra o motivo e relê a meta', () => {
      const goals = new GoalsGatewayStub();
      goals.next = failWith(422, 'GOAL_ARCHIVED');
      const { facade } = setup(new GoalPhotosGatewayStub(), goals);
      facade.setGoal(aGoal({ id: 'g', featured: false, photos: [] }));

      facade.setFeatured(true);

      expect(facade.problem()).toMatchObject({ code: 'GOAL_ARCHIVED' });
      expect(facade.featured()).toBe(false);
    });
  });
});
