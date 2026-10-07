import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { GoalFormPage } from '~/app/features/goals/pages/goal-form.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(gateway = new GoalsGatewayStub(), id?: string) {
  const result = await render(GoalFormPage, {
    inputs: { id },
    providers: [
      provideI18nTesting('pt'),
      provideGoalsStub(gateway),
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
  it('Dado o formulário novo, então pede nome, alvo, prazo, prioridade e descrição, sem imagem', async () => {
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
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('Dado a reserva de emergência, quando salvo, então cria com os valores digitados, avisa e volta para a lista', async () => {
    const { gateway, toast, router, fixture } = await setup();
    const navigate = vi.spyOn(router, 'navigate');

    await type('goal-name', 'Reserva de emergência');
    await type('goal-target', '20000,00');
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
});
