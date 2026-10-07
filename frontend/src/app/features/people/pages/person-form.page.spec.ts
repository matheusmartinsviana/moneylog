import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { PersonFormPage } from '~/app/features/people/pages/person-form.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aPerson,
  aPersonDetail,
  PeopleGatewayStub,
  providePeopleStub,
} from '~/testing/people-testing';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(gateway = new PeopleGatewayStub(), id?: string) {
  const result = await render(PersonFormPage, {
    inputs: { id },
    providers: [
      provideI18nTesting('pt'),
      providePeopleStub(gateway),
      provideRouter([{ path: 'people/:id', component: DummyComponent }]),
    ],
  });
  return {
    ...result,
    gateway,
    toast: TestBed.inject(ToastService),
    router: TestBed.inject(Router),
  };
}

const input = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const type = async (id: string, value: string) => {
  await userEvent.clear(input(id));
  await userEvent.type(input(id), value);
};

describe('PersonFormPage', () => {
  describe('criar', () => {
    it('Dado o formulário novo, então pede nome e observações', async () => {
      await setup();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        pt.people.form.createTitle,
      );
      expect(screen.getByTestId('person-name')).toBeInTheDocument();
      expect(screen.getByTestId('person-notes')).toBeInTheDocument();
    });

    it('Dado o nome, quando salvo, então cria, avisa e leva à tela da pessoa devolvida', async () => {
      const { gateway, toast, router, fixture } = await setup();
      const navigate = vi.spyOn(router, 'navigate');

      await type('person-name', ' Maria ');
      await userEvent.click(screen.getByTestId('person-form-save'));
      await fixture.whenStable();

      expect(gateway.creates).toEqual([{ name: 'Maria', notes: null }]);
      expect(toast.toasts()[0]?.message).toBe('Maria foi adicionada.');
      expect(navigate).toHaveBeenCalledWith(['/people', 'person-new']);
    });

    it('Dado nome vazio, então o erro é do campo e nada é enviado', async () => {
      const { gateway } = await setup();

      await userEvent.click(screen.getByTestId('person-form-save'));

      expect(gateway.creates).toHaveLength(0);
      expect(input('person-name')).toHaveAttribute('aria-invalid', 'true');
    });

    it('Dado o clique duplo, então uma requisição só', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.next = NEVER as never;
      await setup(gateway);
      await type('person-name', 'Maria');

      await userEvent.dblClick(screen.getByTestId('person-form-save'));

      expect(gateway.creates).toHaveLength(1);
      expect(screen.getByTestId('person-form-save')).toBeDisabled();
    });

    it('Dado PERSON_NAME_REQUIRED do backend, então o erro vai ao campo do nome, com texto traduzido', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.next = failWith(422, 'PERSON_NAME_REQUIRED');
      const { fixture } = await setup(gateway);
      await type('person-name', 'Maria');

      await userEvent.click(screen.getByTestId('person-form-save'));
      fixture.detectChanges();

      expect(screen.getByText(pt.errors.codes['PERSON_NAME_REQUIRED']!)).toBeInTheDocument();
      expect(screen.queryByTestId('person-form-error')).not.toBeInTheDocument();
    });

    it('Dado erro de rede, então o aviso geral traduz o code e o digitado fica', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.next = failWith(0, 'NETWORK');
      await setup(gateway);
      await type('person-name', 'Maria');

      await userEvent.click(screen.getByTestId('person-form-save'));

      expect(screen.getByTestId('person-form-error')).toHaveTextContent(
        pt.errors.codes['NETWORK']!,
      );
      expect(input('person-name').value).toBe('Maria');
    });

    it('Dado um homônimo, então avisa que já existe uma pessoa com esse nome, sem bloquear o salvar', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const gateway = new PeopleGatewayStub();
        gateway.people = [aPerson({ id: 'p1', name: 'João' })];
        const { fixture } = await setup(gateway);

        await type('person-name', 'joao');
        await vi.advanceTimersByTimeAsync(350);
        fixture.detectChanges();

        expect(screen.getByTestId('person-homonym')).toHaveTextContent(pt.people.form.homonym);
        await userEvent.click(screen.getByTestId('person-form-save'));
        expect(gateway.creates).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('editar', () => {
    it('Dado a edição, então carrega a pessoa, repõe o formulário e salva com a version', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.detail = aPersonDetail({ id: 'p1', name: 'João', notes: 'colega', version: 4 });
      const { fixture } = await setup(gateway, 'p1');
      await fixture.whenStable();

      expect(input('person-name').value).toBe('João');
      expect(input('person-notes').value).toBe('colega');
      await type('person-name', 'João Pedro');
      await userEvent.click(screen.getByTestId('person-form-save'));

      expect(gateway.updates[0]).toEqual({ name: 'João Pedro', notes: 'colega', version: 4 });
    });

    it('Dado 404, então mostra "pessoa não encontrada" com o caminho de volta', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.getResult = failWith(404, 'PERSON_NOT_FOUND');
      await setup(gateway, 'x');

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.people.form.notFound.title,
      );
      expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/people');
    });

    it('Dado 409 VERSION_CONFLICT, então mostra o conflito e mantém o que o usuário digitou', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.detail = aPersonDetail({ id: 'p1', name: 'João', version: 4 });
      const { fixture } = await setup(gateway, 'p1');
      await fixture.whenStable();
      await type('person-name', 'João Pedro');
      gateway.next = failWith(409, 'VERSION_CONFLICT');

      await userEvent.click(screen.getByTestId('person-form-save'));
      fixture.detectChanges();

      expect(screen.getByTestId('person-form-conflict')).toHaveTextContent(pt.people.form.conflict);
      // Nada recarregou sozinho: o texto digitado continua e o backend foi lido só uma vez.
      expect(input('person-name').value).toBe('João Pedro');
      expect(gateway.calls.filter((call) => call === 'get:p1')).toHaveLength(1);
    });

    it('Dado o conflito, quando escolho recarregar, então vem a versão atual e o aviso some', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.detail = aPersonDetail({ id: 'p1', name: 'João', version: 4 });
      const { fixture } = await setup(gateway, 'p1');
      await fixture.whenStable();
      await type('person-name', 'João Pedro');
      gateway.next = failWith(409, 'VERSION_CONFLICT');
      await userEvent.click(screen.getByTestId('person-form-save'));
      gateway.detail = aPersonDetail({ id: 'p1', name: 'João da Silva', version: 5 });

      await userEvent.click(screen.getByTestId('person-form-reload'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.queryByTestId('person-form-conflict')).not.toBeInTheDocument();
      expect(input('person-name').value).toBe('João da Silva');
      gateway.next = null;
      await userEvent.click(screen.getByTestId('person-form-save'));
      expect(gateway.updates.at(-1)).toMatchObject({ version: 5 });
    });

    it('Dado erro de rede ao carregar, então mostra o erro com "tentar de novo"', async () => {
      const gateway = new PeopleGatewayStub();
      gateway.getResult = failWith(0, 'NETWORK');
      await setup(gateway, 'p1');

      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });

  it('Dado o formulário, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
