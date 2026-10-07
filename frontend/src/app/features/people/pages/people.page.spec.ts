import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { PeoplePage } from '~/app/features/people/pages/people.page';
import { brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(gateway = new PeopleGatewayStub(), inputs: { status?: string } = {}) {
  const result = await render(PeoplePage, {
    inputs,
    providers: [provideI18nTesting('pt'), provideRouter([]), providePeopleStub(gateway)],
  });
  return { ...result, gateway, toast: TestBed.inject(ToastService) };
}

describe('PeoplePage', () => {
  it('Dado nenhuma pessoa, então o estado vazio mostra "Adicionar pessoa" habilitado, levando a /people/new', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.people.title);
    const action = screen.getByTestId('empty-state-action-add-person');
    expect(action).toHaveAttribute('href', '/people/new');
    expect(action).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('people-add')).toHaveAttribute('href', '/people/new');
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.listError = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('people-loading')).toHaveTextContent(pt.people.loading);
  });

  it('Dado net positivo, negativo e zero, então a frase vem de direction e net do backend (sem calcular)', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [
      aPerson({ id: 'a', name: 'João', net: brl('150.00'), direction: 'RECEIVABLE' }),
      aPerson({ id: 'b', name: 'Maria', net: brl('-80.00'), direction: 'PAYABLE', openDebts: 2 }),
      aPerson({
        id: 'c',
        name: 'Pedro',
        net: brl('0.00'),
        direction: 'NONE',
        openDebts: 0,
        nextDueDate: null,
      }),
    ];
    await setup(gateway);

    expect(text(screen.getByTestId('person-balance-a'))).toContain('João deve R$ 150,00');
    expect(screen.getByTestId('person-balance-a')).toHaveAttribute('data-direction', 'RECEIVABLE');
    expect(text(screen.getByTestId('person-balance-b'))).toContain('Você deve R$ 80,00 a Maria');
    expect(text(screen.getByTestId('person-debts-b'))).toBe('2 dívidas em aberto');
    expect(text(screen.getByTestId('person-balance-c'))).toContain('Sem pendências com Pedro');
    expect(text(screen.getByTestId('person-next-due-c'))).toContain(pt.people.noNextDue);
    expect(text(screen.getByTestId('person-next-due-a'))).toContain('20 de out.');
  });

  it('Dado o saldo, então a cor nunca é o único sinal: o texto diz quem deve a quem', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'b', direction: 'PAYABLE', net: brl('-80.00') })];
    await setup(gateway);

    expect(text(screen.getByTestId('person-balance-b'))).toMatch(/Você deve/);
  });

  it('Dado "?status=ARCHIVED", então pede as arquivadas e oferece desarquivar', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'z', archived: true }), aPerson({ id: 'a' })];
    await setup(gateway, { status: 'ARCHIVED' });

    expect(gateway.queries.at(-1)?.status).toBe('ARCHIVED');
    expect(screen.getByTestId('people-tab-archived')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('person-unarchive-z')).toBeInTheDocument();
    expect(screen.queryByTestId('person-row-a')).not.toBeInTheDocument();
  });

  it('Dado nenhuma arquivada, então diz isso sem a ação de adicionar', async () => {
    await setup(new PeopleGatewayStub(), { status: 'ARCHIVED' });

    expect(screen.getByTestId('people-empty-archived')).toHaveTextContent(pt.people.emptyArchived);
  });

  it('Dado erro de rede, então mostra o erro com "tentar de novo" e recarrega', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.listError = failWith(0, 'NETWORK');
    await setup(gateway);

    expect(screen.getByTestId('error-state')).toHaveTextContent(pt.errors.codes['NETWORK']!);
    gateway.listError = null;
    gateway.people = [aPerson({ id: 'a' })];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('person-row-a')).toBeInTheDocument();
  });

  describe('busca por nome', () => {
    it('Dado a digitação, então espera 300 ms e só a última busca chega ao backend', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const gateway = new PeopleGatewayStub();
        gateway.people = [aPerson({ id: 'a', name: 'João' }), aPerson({ id: 'b', name: 'Maria' })];
        const { fixture } = await setup(gateway);
        gateway.queries.length = 0;

        await userEvent.type(screen.getByTestId('people-search'), 'mar');
        await vi.advanceTimersByTimeAsync(400);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(gateway.queries).toHaveLength(1);
        expect(gateway.queries[0]?.q).toBe('mar');
        expect(screen.queryByTestId('person-row-a')).not.toBeInTheDocument();
        expect(screen.getByTestId('person-row-b')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dado busca sem resultado, então diz "ninguém com esse nome" (e não o estado vazio de quem não cadastrou)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const gateway = new PeopleGatewayStub();
        gateway.people = [aPerson({ id: 'a', name: 'João' })];
        const { fixture } = await setup(gateway);

        await userEvent.type(screen.getByTestId('people-search'), 'zzz');
        await vi.advanceTimersByTimeAsync(400);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(screen.getByTestId('people-empty-search')).toHaveTextContent(pt.people.emptySearch);
        expect(screen.queryByTestId('empty-state-title')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('Dado arquivar, quando confirmo, então usa a pessoa devolvida e avisa', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'a' })];
    const { toast, fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('person-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(gateway.calls).toContain('archive:a');
    expect(toast.toasts()[0]?.message).toBe(pt.people.toast.archived);
    expect(screen.queryByTestId('person-row-a')).not.toBeInTheDocument();
  });

  it('Dado falha ao arquivar, então avisa com o texto do code e a pessoa continua na lista', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'a' })];
    const { toast } = await setup(gateway);
    gateway.next = failWith(422, 'PERSON_ALREADY_ARCHIVED');

    await userEvent.click(screen.getByTestId('person-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(toast.toasts()[0]?.message).toBe(pt.errors.codes['PERSON_ALREADY_ARCHIVED']);
    expect(screen.getByTestId('person-row-a')).toBeInTheDocument();
  });

  it('Dado a lista, então cada pessoa leva ao detalhe e à edição (teclado: são links)', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [aPerson({ id: 'a', name: 'João' })];
    await setup(gateway);

    expect(screen.getByTestId('person-open-a')).toHaveAttribute('href', '/people/a');
    expect(screen.getByTestId('person-open-a')).toHaveAccessibleName('Abrir João');
    expect(screen.getByTestId('person-edit-a')).toHaveAttribute('href', '/people/a/edit');
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.people = [
      aPerson({ id: 'a' }),
      aPerson({ id: 'b', direction: 'PAYABLE', net: brl('-80.00') }),
    ];
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
