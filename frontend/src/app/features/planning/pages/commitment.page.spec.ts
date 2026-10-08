import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { CommitmentPage } from '~/app/features/planning/pages/commitment.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aProject,
  CommitmentsGatewayStub,
  provideCommitmentsStub,
} from '~/testing/commitments-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

async function setup(id: string, gateway = new CommitmentsGatewayStub()) {
  const result = await render(CommitmentPage, {
    inputs: { id },
    providers: [provideI18nTesting('pt'), provideRouter([]), provideCommitmentsStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, toast: TestBed.inject(ToastService) };
}

describe('CommitmentPage', () => {
  it('Dado um projeto, então mostra o resumo e o cronograma como o servidor calculou', async () => {
    await setup('c-project');

    expect(text(screen.getByTestId('commitment-total'))).toBe('R$ 100.000,00');
    expect(text(screen.getByTestId('commitment-paid'))).toBe('R$ 10.000,00');
    expect(text(screen.getByTestId('commitment-balance'))).toBe('R$ 90.000,00');
    expect(text(screen.getByTestId('commitment-direct-pending'))).toBe('R$ 20.000,00');
    expect(text(screen.getByTestId('commitment-financing'))).toBe('R$ 70.000,00');
    expect(screen.getByTestId('commitment-only-tracking')).toHaveTextContent(
      pt.commitments.detail.onlyTracking,
    );
    expect(screen.getByTestId('commitment-item-2')).toHaveTextContent('Parcela 1');
    expect(screen.queryByTestId('commitment-pay-1')).not.toBeInTheDocument();
  });

  it('Dado marcar a parcela paga, então confirma a data, usa a resposta do backend e avisa', async () => {
    const { gateway, toast } = await setup('c-project');

    await userEvent.click(screen.getByTestId('commitment-pay-2'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('commitment-pay-confirm'));

    await waitFor(() => expect(gateway.pays).toHaveLength(1));
    expect(gateway.pays[0]).toMatchObject({ id: 'c-project', position: 2, version: 3 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.toasts()[0]?.message).toBe(pt.commitments.detail.schedule.toast);
  });

  it('Dado item já pago em outro aparelho, então mostra o motivo e relê o cronograma', async () => {
    const gateway = new CommitmentsGatewayStub();
    const { fixture } = await setup('c-project', gateway);
    gateway.pay$ = failWith(422, 'COMMITMENT_SCHEDULE_ITEM_ALREADY_PAID');
    gateway.get$ = of(aProject({ version: 9 }));

    await userEvent.click(screen.getByTestId('commitment-pay-2'));
    await userEvent.click(screen.getByTestId('commitment-pay-confirm'));
    await fixture.whenStable();

    expect(await screen.findByTestId('commitment-pay-error')).toHaveTextContent(
      pt.errors.codes['COMMITMENT_SCHEDULE_ITEM_ALREADY_PAID']!,
    );
  });

  it('Dado empréstimo de terceiro, então não mostra saldo e permite atualizar o progresso', async () => {
    const { gateway } = await setup('c-loan');

    expect(screen.getByTestId('commitment-tracked-note')).toHaveTextContent(
      pt.commitments.detail.trackedNote,
    );
    expect(screen.queryByTestId('commitment-balance')).not.toBeInTheDocument();
    expect(text(screen.getByTestId('commitment-installments'))).toBe('4 de 12 parcelas pagas');

    await userEvent.click(screen.getByTestId('commitment-progress-save'));

    await waitFor(() => expect(gateway.progresses).toHaveLength(1));
    expect(gateway.progresses[0]!.input).toMatchObject({ installmentsPaid: 4, version: 1 });
  });

  it('Dado compromisso inexistente, então mostra o não encontrado com saída', async () => {
    const gateway = new CommitmentsGatewayStub();
    gateway.get$ = failWith(404, 'COMMITMENT_NOT_FOUND');
    await setup('nada', gateway);

    expect(
      screen.getByRole('heading', { name: pt.commitments.detail.notFound.title }),
    ).toBeInTheDocument();
  });

  it('Dado o detalhe do projeto, então não tem violações de acessibilidade', async () => {
    const { container } = await setup('c-project');

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
