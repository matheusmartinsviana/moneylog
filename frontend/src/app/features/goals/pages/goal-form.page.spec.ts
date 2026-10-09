import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { GoalFormPage } from '~/app/features/goals/pages/goal-form.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aDreamGoal,
  aGoal,
  aMetricGoal,
  GoalPhotosGatewayStub,
  GoalsGatewayStub,
  provideGoalsStub,
} from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(
  gateway = new GoalsGatewayStub(),
  id?: string,
  photos = new GoalPhotosGatewayStub(),
) {
  const result = await render(GoalFormPage, {
    inputs: { id },
    providers: [
      provideI18nTesting('pt'),
      provideGoalsStub(gateway, photos),
      provideRouter([
        { path: 'goals/:id', component: DummyComponent },
        { path: 'goals', component: DummyComponent },
      ]),
    ],
  });
  await result.fixture.whenStable();
  return {
    ...result,
    gateway,
    photos,
    toast: TestBed.inject(ToastService),
    router: TestBed.inject(Router),
  };
}

const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const type = async (id: string, value: string) => {
  await userEvent.clear(field(id));
  await userEvent.type(field(id), value);
};

describe('GoalFormPage', () => {
  it('Dado o formulário novo, então pede nome, alvo, prazo e descrição, com a prioridade recolhida, com a seção de fotos do sonho', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(pt.goals.form.createTitle);
    for (const id of [
      'goal-name',
      'goal-target',
      'goal-deadline',
      'goal-priority',
      'goal-description',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // O único `input` de arquivo é o escondido do botão "Adicionar fotos" (vários arquivos).
    const files = document.querySelectorAll('input[type="file"]');
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveAttribute('hidden');
    expect(files[0]?.closest('app-files-button')).not.toBeNull();
    expect(screen.getByTestId('goal-photos-count')).toHaveTextContent('0 de 8');
    expect(screen.getByTestId('goal-featured')).toHaveAttribute('aria-checked', 'false');
  });

  it('Dado a reserva de emergência, quando salvo, então cria com os valores digitados, avisa e volta para a lista', async () => {
    const { gateway, toast, router, fixture } = await setup();
    const navigate = vi.spyOn(router, 'navigate');

    await type('goal-name', 'Reserva de emergência');
    await type('goal-target', '20000,00');
    await userEvent.click(screen.getByTestId('goal-more-toggle'));
    await userEvent.click(screen.getByTestId('goal-priority-HIGH'));
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(gateway.creates[0]).toEqual({
      name: 'Reserva de emergência',
      target: '20000.00',
      deadline: null,
      priority: 'HIGH',
      description: null,
    });
    expect(gateway.createKeys).toHaveLength(1);
    expect(toast.toasts()[0]?.message).toBe(pt.goals.toast.created);
    expect(navigate).toHaveBeenCalledWith(['/goals']);
  });

  it('Dado a prioridade não escolhida, quando salvo, então ela não vai no envio', async () => {
    const { gateway, fixture } = await setup();

    await type('goal-name', 'Viagem');
    await type('goal-target', '1000,00');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(gateway.creates[0]).not.toHaveProperty('priority');
  });

  it('Dado nome vazio, quando salvo, então aponta o campo e não envia', async () => {
    const { gateway } = await setup();

    await type('goal-target', '100,00');
    await userEvent.click(screen.getByTestId('goal-form-save'));

    expect(field('goal-name')).toHaveAttribute('aria-invalid', 'true');
    expect(gateway.creates).toHaveLength(0);
  });

  it('Dado GOAL_TARGET_NOT_POSITIVE do backend, então o erro vai para o campo do alvo', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(422, 'GOAL_TARGET_NOT_POSITIVE');
    const { fixture } = await setup(gateway);

    await type('goal-name', 'Viagem');
    await type('goal-target', '1,00');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(field('goal-target')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('goal-form-error')).not.toBeInTheDocument();
  });

  it('Dado falha de rede, então o aviso é geral e o mesmo envio reusa a chave', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    const { fixture } = await setup(gateway);
    await type('goal-name', 'Viagem');
    await type('goal-target', '1000,00');

    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();
    expect(screen.getByTestId('goal-form-error')).toHaveTextContent(pt.errors.network);
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
  });

  it('Dado editar, então carrega a meta, repõe o formulário e envia a version', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ version: 5 })];
    const { fixture } = await setup(gateway, 'goal-1');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(pt.goals.form.editTitle);
    expect(field('goal-name').value).toBe('Reserva de emergência');
    await type('goal-name', 'Reserva');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(gateway.updates[0]).toMatchObject({ name: 'Reserva', version: 5, target: '20000.00' });
  });

  it('Dado editar meta de medida, então o nome é opcional e o PUT reenvia prazo e texto do plano para não apagá-los', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aMetricGoal({ id: 'goal-1', planNote: 'Pagar em dia', version: 7 })];
    const { fixture } = await setup(gateway, 'goal-1');

    expect(field('goal-name').value).toBe('');
    await type('goal-target', '3000,00');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(gateway.updates[0]).toMatchObject({
      kind: 'METRIC',
      name: '',
      target: '3000.00',
      deadline: '2027-04-30',
      planNote: 'Pagar em dia',
      version: 7,
    });
  });

  it('Dado VERSION_CONFLICT, então oferece recarregar sem perder o digitado antes da escolha', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal()];
    const { fixture } = await setup(gateway, 'goal-1');
    gateway.next = failWith(409, 'VERSION_CONFLICT');

    await type('goal-name', 'Outro nome');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();

    expect(screen.getByTestId('goal-form-conflict')).toBeInTheDocument();
    expect(field('goal-name').value).toBe('Outro nome');
    gateway.getResult = of(aGoal({ version: 2 }));
    await userEvent.click(screen.getByTestId('goal-form-reload'));
    await fixture.whenStable();
    expect(field('goal-name').value).toBe('Reserva de emergência');
  });

  it('Dado VERSION_CONFLICT, então "Manter o que digitei" atualiza só a versão e o próximo salvar leva os valores digitados', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ version: 1 })];
    const { fixture } = await setup(gateway, 'goal-1');
    gateway.next = failWith(409, 'VERSION_CONFLICT');
    await type('goal-name', 'Meu nome');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();
    expect(screen.getByTestId('goal-form-conflict')).toHaveTextContent(pt.goals.form.conflict);

    gateway.getResult = of(aGoal({ name: 'Nome do servidor', version: 7 }));
    gateway.next = null;
    await userEvent.click(screen.getByTestId('goal-form-keep'));
    await fixture.whenStable();

    expect(screen.queryByTestId('goal-form-conflict')).not.toBeInTheDocument();
    expect(field('goal-name').value).toBe('Meu nome');
    await userEvent.click(screen.getByTestId('goal-form-save'));
    await fixture.whenStable();
    expect(gateway.updates.at(-1)).toMatchObject({ name: 'Meu nome', version: 7 });
  });

  it('Dado meta arquivada, então o formulário fica desabilitado e explica', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.goals = [aGoal({ status: 'ARCHIVED' })];
    await setup(gateway, 'goal-1');

    expect(screen.getByTestId('goal-form-archived')).toBeInTheDocument();
    expect(screen.getByTestId('goal-form-save')).toBeDisabled();
  });

  it('Dado meta inexistente, então mostra "não encontrada" com o caminho de volta', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.getResult = failWith(404, 'GOAL_NOT_FOUND');
    await setup(gateway, 'x');

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.goals.detail.notFound.title,
    );
    expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/goals');
  });

  it('Dado erro ao carregar, então oferece "tentar de novo"', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.getResult = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway, 'x');

    expect(screen.getByTestId('empty-state-action-retry')).toBeInTheDocument();
  });

  it('Dado o formulário, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  describe('fotos do sonho', () => {
    const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

    /** O seletor de arquivos é do sistema: o teste entrega os arquivos ao `input` escondido. */
    const pick = (...files: File[]) => {
      const input = screen.getByTestId('goal-photos-add-native') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: files });
      fireEvent.change(input);
    };

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:sintetico');
      URL.revokeObjectURL = vi.fn();
    });

    it('Dado dois arquivos e a meta nova, quando salvo, então cria a meta, envia uma foto por vez na ordem escolhida e volta', async () => {
      const { gateway, photos, router, toast, fixture } = await setup();
      const navigate = vi.spyOn(router, 'navigate');

      pick(jpg('a.jpg'), jpg('b.jpg'));
      expect(screen.getByTestId('goal-photos-count')).toHaveTextContent('2 de 8');
      expect(screen.getByTestId('goal-queued-status-0')).toHaveTextContent(pt.goals.photos.waiting);
      await type('goal-name', 'Carro de exemplo');
      await type('goal-target', '10000,00');
      await userEvent.click(screen.getByTestId('goal-form-save'));
      await fixture.whenStable();

      expect(gateway.creates).toHaveLength(1);
      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['a.jpg', 'b.jpg']);
      expect(photos.uploads.every((upload) => upload.goalId === 'goal-new')).toBe(true);
      expect(new Set(photos.uploads.map((upload) => upload.key)).size).toBe(2);
      expect(toast.toasts()[0]?.message).toBe(pt.goals.toast.created);
      expect(navigate).toHaveBeenCalledWith(['/goals']);
    });

    it('Dado o destaque ligado na criação, então marca a meta criada como destaque depois de criar', async () => {
      const { gateway, fixture } = await setup();

      await userEvent.click(screen.getByTestId('goal-featured'));
      expect(screen.getByTestId('goal-featured')).toHaveAttribute('aria-checked', 'true');
      await type('goal-name', 'Carro de exemplo');
      await type('goal-target', '10000,00');
      await userEvent.click(screen.getByTestId('goal-form-save'));
      await fixture.whenStable();

      expect(gateway.calls).toContain('featured:goal-new:true');
    });

    it('Dado um arquivo .txt, então recusa com o motivo, antes de chamar a API', async () => {
      const { photos } = await setup();

      pick(new File(['oi'], 'nota.txt', { type: 'text/plain' }));

      expect(screen.getByTestId('goal-photos-rejected')).toHaveTextContent(
        'nota.txt: use uma foto JPEG ou PNG.',
      );
      expect(screen.getByTestId('goal-photos-count')).toHaveTextContent('0 de 8');
      expect(photos.uploads).toHaveLength(0);
    });

    it('Dado um arquivo acima de 8 MB, então recusa com o tamanho', async () => {
      await setup();
      const big = jpg('grande.jpg');
      Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 });

      pick(big);

      expect(screen.getByTestId('goal-photos-rejected')).toHaveTextContent(/grande\.jpg: passa de/);
    });

    it('Dado nove fotos, então a nona é recusada pelo limite e o contador para em 8', async () => {
      await setup();

      pick(...Array.from({ length: 9 }, (_, i) => jpg(`f${i}.jpg`)));

      expect(screen.getByTestId('goal-photos-count')).toHaveTextContent('8 de 8');
      expect(screen.getByTestId('goal-photos-rejected')).toHaveTextContent('f8.jpg');
      expect(screen.getByTestId('goal-photos-full')).toBeInTheDocument();
    });

    it('Dado a meta nova, quando movo a segunda foto para a esquerda, então a ordem de envio muda', async () => {
      const { photos, fixture } = await setup();
      pick(jpg('a.jpg'), jpg('b.jpg'));

      await userEvent.click(screen.getByTestId('goal-queued-left-1'));
      expect(screen.getByRole('group', { name: 'Foto escolhida 1: b.jpg' })).toBeInTheDocument();
      expect(screen.getByTestId('goal-queued-cover')).toBeInTheDocument();
      await type('goal-name', 'Carro de exemplo');
      await type('goal-target', '10000,00');
      await userEvent.click(screen.getByTestId('goal-form-save'));
      await fixture.whenStable();

      expect(photos.uploads.map((upload) => upload.fileName)).toEqual(['b.jpg', 'a.jpg']);
    });

    it('Dado uma falha no envio de uma foto, então a meta fica criada, a falha aparece só nela e "tentar de novo" reenvia com a mesma chave', async () => {
      const photos = new GoalPhotosGatewayStub();
      photos.uploadResults.push(failWith(0, 'NETWORK'));
      const { router, fixture } = await setup(new GoalsGatewayStub(), undefined, photos);
      const navigate = vi.spyOn(router, 'navigate');
      pick(jpg('a.jpg'), jpg('b.jpg'));
      await type('goal-name', 'Carro de exemplo');
      await type('goal-target', '10000,00');

      await userEvent.click(screen.getByTestId('goal-form-save'));
      await fixture.whenStable();

      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByTestId('goal-photos-failed')).toBeInTheDocument();
      expect(screen.getByTestId('goal-queued-status-0')).toHaveTextContent(pt.errors.network);
      const firstKey = photos.uploads[0]?.key;
      await userEvent.click(screen.getByTestId('goal-queued-retry-0'));
      await fixture.whenStable();

      expect(photos.uploads).toHaveLength(3);
      expect(photos.uploads[2]).toMatchObject({ fileName: 'a.jpg', key: firstKey });
      expect(navigate).toHaveBeenCalledWith(['/goals']);
    });

    it('Dado editar uma meta com fotos, então mostra a grade com a capa e o contador', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3)];
      await setup(gateway, 'goal-dream');

      expect(screen.getByTestId('goal-photos-count')).toHaveTextContent('3 de 8');
      expect(screen.getByTestId('goal-photo-0')).toContainElement(
        screen.getByTestId('goal-photo-cover'),
      );
      expect(screen.getByTestId('goal-featured')).toHaveAttribute('aria-checked', 'true');
    });

    it('Dado teclado, quando movo uma foto para a direita, então usa o conjunto exato na nova ordem e anuncia a posição', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3)];
      const { photos } = await setup(gateway, 'goal-dream');

      screen.getByTestId('goal-photo-right-0').focus();
      await userEvent.keyboard('{Enter}');

      expect(photos.calls).toContain('reorder:goal-dream:photo-2,photo-1,photo-3');
      expect(screen.getByTestId('goal-photos-announce')).toHaveTextContent(
        'Foto movida para a posição 2 de 3.',
      );
    });

    it('Dado a última foto, então "mover para a direita" não faz nada e continua focável', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(2)];
      const { photos } = await setup(gateway, 'goal-dream');

      const button = screen.getByTestId('goal-photo-right-1');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(button);

      expect(photos.calls.filter((call) => call.startsWith('reorder'))).toEqual([]);
    });

    it('Dado definir capa, então chama a capa da foto escolhida', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3)];
      const { photos } = await setup(gateway, 'goal-dream');

      await userEvent.click(screen.getByTestId('goal-photo-cover-2'));

      expect(photos.calls).toContain('cover:goal-dream:photo-3');
    });

    it('Dado remover, então pede confirmação e só remove depois de confirmar', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3)];
      const { photos } = await setup(gateway, 'goal-dream');

      await userEvent.click(screen.getByTestId('goal-photo-remove-1'));
      expect(photos.calls.some((call) => call.startsWith('remove'))).toBe(false);
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(photos.calls).toContain('remove:goal-dream:photo-2');
    });

    it('Dado o limite do servidor na 9ª foto, então a mensagem do código aparece na foto', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(1)];
      const photos = new GoalPhotosGatewayStub();
      photos.uploadResults.push(failWith(422, 'GOAL_PHOTO_LIMIT_REACHED'));
      const { fixture } = await setup(gateway, 'goal-dream', photos);

      pick(jpg('a.jpg'));
      await fixture.whenStable();

      expect(screen.getByTestId('goal-queued-status-0')).toHaveTextContent(
        pt.errors.codes['GOAL_PHOTO_LIMIT_REACHED']!,
      );
    });

    it('Dado meta de medida ou arquivada, então não há fotos nem destaque', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aMetricGoal({ id: 'goal-1' })];
      await setup(gateway, 'goal-1');

      expect(screen.queryByTestId('goal-photos')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goal-featured')).not.toBeInTheDocument();
    });

    it('Dado a seção de fotos, então não há violações de acessibilidade', async () => {
      const gateway = new GoalsGatewayStub();
      gateway.goals = [aDreamGoal(3)];
      const { container } = await setup(gateway, 'goal-dream');

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
});
