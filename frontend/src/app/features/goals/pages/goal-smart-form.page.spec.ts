import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { GoalSmartFormPage } from '~/app/features/goals/pages/goal-smart-form.page';
import { brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aMetricGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(gateway = new GoalsGatewayStub()) {
  gateway.metricValues = { TOTAL_DEBT: brl('8850.00') };
  const result = await render(GoalSmartFormPage, {
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
    router: TestBed.inject(Router),
    toast: TestBed.inject(ToastService),
  };
}

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

const chooseMetric = async (metric: string) => {
  await userEvent.click(screen.getByTestId('goal-smart-metric'));
  await userEvent.click(screen.getByTestId(`goal-smart-metric-option-${metric}`));
};

describe('GoalSmartFormPage', () => {
  it('Dado o formulário, então pede medida, alvo, prazo e nome opcional, e avisa com gentileza que falta prazo', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(pt.goals.smart.createTitle);
    for (const id of [
      'goal-smart-metric',
      'goal-smart-target',
      'goal-smart-deadline',
      'goal-smart-name',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('goal-smart-no-deadline')).toHaveTextContent(
      'Meta sem prazo é só fantasia: defina um prazo.',
    );
  });

  it('Dado a medida escolhida, então mostra o valor de hoje lido do servidor', async () => {
    const { gateway } = await setup();

    await chooseMetric('TOTAL_DEBT');

    expect(gateway.calls).toContain('metric:TOTAL_DEBT');
    expect(text(await screen.findByTestId('goal-smart-current-value'))).toBe('R$ 8.850,00');
  });

  it('Dado falha ao ler o valor de hoje, então oferece tentar de novo', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.metricValue$ = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    await chooseMetric('TOTAL_DEBT');
    expect(await screen.findByTestId('goal-smart-current-error')).toBeInTheDocument();

    gateway.metricValue$ = of(brl('1.00'));
    await userEvent.click(screen.getByTestId('goal-smart-current-retry'));
    expect(text(await screen.findByTestId('goal-smart-current-value'))).toBe('R$ 1,00');
  });

  it('Dado alvo zero sem prazo nem nome, quando crio, então manda METRIC com o alvo 0.00, avisa e abre a meta criada', async () => {
    const { gateway, toast, router, fixture } = await setup();
    const navigate = vi.spyOn(router, 'navigate');
    gateway.next = of(aMetricGoal({ id: 'goal-new' }));

    await chooseMetric('TOTAL_DEBT');
    await userEvent.type(screen.getByTestId('goal-smart-target'), '0');
    await userEvent.click(screen.getByTestId('goal-smart-save'));
    await fixture.whenStable();

    expect(gateway.creates[0]).toEqual({
      kind: 'METRIC',
      metric: 'TOTAL_DEBT',
      name: '',
      target: '0.00',
      deadline: null,
      description: null,
    });
    expect(toast.toasts()[0]?.message).toBe(pt.goals.toast.created);
    expect(navigate).toHaveBeenCalledWith(['/goals', 'goal-new']);
  });

  it('Dado sem medida, quando crio, então não envia', async () => {
    const { gateway } = await setup();

    await userEvent.type(screen.getByTestId('goal-smart-target'), '10');
    await userEvent.click(screen.getByTestId('goal-smart-save'));

    expect(gateway.creates).toHaveLength(0);
  });

  it('Dado alvo igual ao valor de hoje (422), então o erro fica no campo do alvo e o digitado permanece', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(422, 'GOAL_METRIC_TARGET_EQUALS_BASELINE');
    const { fixture } = await setup(gateway);

    await chooseMetric('TOTAL_DEBT');
    await userEvent.type(screen.getByTestId('goal-smart-target'), '8850');
    await userEvent.click(screen.getByTestId('goal-smart-save'));
    await fixture.whenStable();

    expect(await screen.findByText(/O alvo é igual ao valor de hoje/)).toBeInTheDocument();
    expect(screen.getByTestId('goal-smart-target')).toHaveValue('8.850,00');
    expect(screen.queryByTestId('goal-smart-error')).toBeNull();
  });

  it('Dado meta repetida (409), então mostra o aviso geral', async () => {
    const gateway = new GoalsGatewayStub();
    gateway.next = failWith(409, 'GOAL_METRIC_DUPLICATE');
    const { fixture } = await setup(gateway);

    await chooseMetric('TOTAL_DEBT');
    await userEvent.type(screen.getByTestId('goal-smart-target'), '4000');
    await userEvent.click(screen.getByTestId('goal-smart-save'));
    await fixture.whenStable();

    expect(await screen.findByTestId('goal-smart-error')).toHaveTextContent(
      'Você já tem uma meta ativa para esta medida e este alvo.',
    );
  });

  it('Dado o formulário, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
