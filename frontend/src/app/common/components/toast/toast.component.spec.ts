import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ToastRegionComponent } from '~/app/common/components/toast/toast-region.component';
import { ToastService } from '~/app/common/services/toast.service';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup() {
  const result = await render(ToastRegionComponent, { providers: [provideI18nTesting('pt')] });
  return { ...result, service: TestBed.inject(ToastService) };
}

describe('ToastService e ToastRegionComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado um aviso, então aparece numa região viva com role status e some sozinho', async () => {
    const { service, fixture } = await setup();

    service.show('Movimentação registrada.', { durationMs: 30 });
    await fixture.whenStable();

    expect(screen.getByTestId('toast-region')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Movimentação registrada.');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('Dado um erro, então usa role alert e fica mais tempo na tela que o aviso comum', async () => {
    const { service, fixture } = await setup();

    service.show('Não foi possível salvar.', { tone: 'error' });
    await fixture.whenStable();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar.');
    expect(service.toasts()).toHaveLength(1);
  });

  it('Dado a duração padrão, então erro dura 8 s e aviso comum 5 s', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(ToastService);
    service.show('info');
    service.show('erro', { tone: 'error' });

    vi.advanceTimersByTime(5000);
    expect(service.toasts().map((toast) => toast.message)).toEqual(['erro']);
    vi.advanceTimersByTime(3000);
    expect(service.toasts()).toEqual([]);
  });

  it('Dado o botão fechar, então remove o aviso', async () => {
    const { service, fixture } = await setup();
    service.show('Conta arquivada.');
    await fixture.whenStable();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));

    expect(screen.queryByText('Conta arquivada.')).not.toBeInTheDocument();
  });

  it('Dado um aviso com ações, então mostra os botões e usar um executa e fecha o aviso', async () => {
    const { service, fixture } = await setup();
    const run = vi.fn();
    service.show('Registrado.', { actions: [{ id: 'view', label: 'Ver movimentações', run }] });
    await fixture.whenStable();

    await userEvent.click(screen.getByTestId('toast-action-view'));

    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Registrado.')).not.toBeInTheDocument();
  });

  it('Dado mais de 3 avisos, então o mais antigo sai', async () => {
    const { service, fixture } = await setup();

    ['um', 'dois', 'tres', 'quatro'].forEach((text) => service.show(text));
    await fixture.whenStable();

    expect(screen.queryByText('um')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('toast-info')).toHaveLength(3);
  });

  it('Dado um aviso, então o axe não aponta violações', async () => {
    const { service, fixture, container } = await setup();
    service.show('Conta arquivada.');
    await fixture.whenStable();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
