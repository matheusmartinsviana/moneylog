import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { CategoriesPage } from '~/app/features/settings/pages/categories.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

function seeded() {
  const gateway = new CategoriesGatewayStub();
  gateway.categories = [
    aCategory({ id: 'e1', name: 'Alimentação', system: true }),
    aCategory({ id: 'e2', name: 'Meus pets', system: false }),
    aCategory({ id: 'e3', name: 'Antiga', archived: true, system: false }),
    aCategory({ id: 'i1', name: 'Salário', kind: 'INCOME', system: true }),
  ];
  return gateway;
}

async function setup(gateway = seeded(), inputs: { kind?: string } = {}) {
  const result = await render(CategoriesPage, {
    inputs,
    providers: [provideI18nTesting('pt'), provideRouter([]), provideCategoriesStub(gateway)],
  });
  return { ...result, gateway, toast: TestBed.inject(ToastService) };
}

describe('CategoriesPage', () => {
  it('Dado a página, então lista as categorias de despesa, sinaliza as "de sistema" e recolhe as arquivadas', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.categories.title);
    expect(screen.getByTestId('category-name-e1')).toHaveTextContent('Alimentação');
    expect(screen.getByTestId('category-system-e1')).toHaveTextContent(pt.categories.system);
    expect(screen.queryByTestId('category-system-e2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-name-i1')).not.toBeInTheDocument();
    const archived = screen.getByTestId('categories-archived');
    expect(screen.getByTestId('categories-archived-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByTestId('categories-archived-toggle')).toHaveTextContent('Arquivadas (1)');
    expect(within(archived).getByTestId('category-name-e3')).toBeInTheDocument();
  });

  it('Dado ?kind=INCOME, então mostra as receitas e marca a aba', async () => {
    await setup(seeded(), { kind: 'INCOME' });

    expect(screen.getByTestId('category-name-i1')).toBeInTheDocument();
    expect(screen.queryByTestId('category-name-e1')).not.toBeInTheDocument();
    expect(screen.getByTestId('categories-tab-income')).toHaveAttribute('aria-current', 'page');
  });

  it('Dado "Nova categoria", quando salvo "Pets", então ela aparece na lista a partir da resposta', async () => {
    const { gateway, toast } = await setup();

    await userEvent.click(screen.getByTestId('categories-add'));
    await userEvent.type(screen.getByTestId('category-new-name'), 'Pets');
    await userEvent.click(screen.getByTestId('categories-create-save'));

    expect(gateway.calls).toContain('create:Pets:EXPENSE');
    expect(screen.getByTestId('category-name-new')).toHaveTextContent('Pets');
    expect(screen.queryByTestId('categories-create-form')).not.toBeInTheDocument();
    expect(toast.toasts()[0]?.message).toBe('Categoria Pets adicionada.');
  });

  it('Dado 409 CATEGORY_NAME_TAKEN, então mostra "já existe uma categoria com esse nome" no campo', async () => {
    const gateway = seeded();
    gateway.next = failWith(409, 'CATEGORY_NAME_TAKEN');
    await setup(gateway);

    await userEvent.click(screen.getByTestId('categories-add'));
    await userEvent.type(screen.getByTestId('category-new-name'), 'Alimentação');
    await userEvent.click(screen.getByTestId('categories-create-save'));

    expect(screen.getByText(pt.errors.codes['CATEGORY_NAME_TAKEN']!)).toBeInTheDocument();
    expect((screen.getByTestId('category-new-name') as HTMLInputElement).value).toBe('Alimentação');
    expect(screen.getByTestId('category-new-name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado o nome vazio, então não envia e mostra o erro do campo', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('categories-add'));
    await userEvent.click(screen.getByTestId('categories-create-save'));

    expect(gateway.calls).toEqual([]);
    expect(screen.getByText(pt.form.errors.required)).toBeInTheDocument();
  });

  it('Dado "Renomear" com o teclado, quando digito e dou Enter, então salva com a version e fecha', async () => {
    const { gateway, toast } = await setup();

    await userEvent.click(screen.getByTestId('category-rename-e1'));
    const field = screen.getByTestId('category-rename-input-e1') as HTMLInputElement;
    expect(field).toHaveFocus();
    expect(field.value).toBe('Alimentação');
    await userEvent.clear(field);
    await userEvent.type(field, 'Comida{Enter}');

    expect(gateway.calls).toContain('rename:e1:Comida:0');
    expect(screen.getByTestId('category-name-e1')).toHaveTextContent('Comida');
    expect(screen.queryByTestId('category-rename-input-e1')).not.toBeInTheDocument();
    expect(toast.toasts()[0]?.message).toBe(pt.categories.toast.renamed);
  });

  it('Dado o renomear aberto, quando dou Esc, então cancela sem chamar a API', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('category-rename-e1'));
    await userEvent.type(screen.getByTestId('category-rename-input-e1'), 'x{Escape}');

    expect(gateway.calls).toEqual([]);
    expect(screen.getByTestId('category-name-e1')).toHaveTextContent('Alimentação');
  });

  it('Dado o mesmo nome, quando dou Enter, então só fecha, sem chamar a API', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('category-rename-e1'));
    await userEvent.type(screen.getByTestId('category-rename-input-e1'), '{Enter}');

    expect(gateway.calls).toEqual([]);
    expect(screen.queryByTestId('category-rename-input-e1')).not.toBeInTheDocument();
  });

  it('Dado 409 ao renomear, então o erro aparece no campo e o modo de edição continua', async () => {
    const gateway = seeded();
    gateway.next = failWith(409, 'CATEGORY_NAME_TAKEN');
    await setup(gateway);

    await userEvent.click(screen.getByTestId('category-rename-e1'));
    await userEvent.type(screen.getByTestId('category-rename-input-e1'), ' 2{Enter}');

    expect(screen.getByText(pt.errors.codes['CATEGORY_NAME_TAKEN']!)).toBeInTheDocument();
    expect(screen.getByTestId('category-rename-input-e1')).toBeInTheDocument();
  });

  it('Dado "Arquivar", quando confirmo, então a categoria vai para as arquivadas', async () => {
    const { gateway, toast } = await setup();

    await userEvent.click(screen.getByTestId('category-archive-e2'));
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Arquivar Meus pets?');
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(gateway.calls).toContain('archive:e2');
    const archived = screen.getByTestId('categories-archived');
    expect(within(archived).getByTestId('category-name-e2')).toBeInTheDocument();
    expect(screen.getByTestId('categories-archived-toggle')).toHaveTextContent('Arquivadas (2)');
    expect(toast.toasts()[0]?.message).toBe(pt.categories.toast.archived);
  });

  it('Dado o diálogo de arquivar, quando cancelo, então nada muda', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('category-archive-e2'));
    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(gateway.calls).toEqual([]);
  });

  it('Dado uma arquivada, quando desarquivo, então volta para a lista de ativas', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('category-unarchive-e3'));

    expect(gateway.calls).toContain('unarchive:e3');
    expect(screen.queryByTestId('categories-archived')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-name-e3')).toBeInTheDocument();
  });

  it('Dado a página, então não existe nenhuma ação de excluir', async () => {
    await setup();

    expect(screen.queryByText(/exclu|apagar|delete|remov/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/delete|remove/)).not.toBeInTheDocument();
  });

  it('Dado erro ao arquivar (404), então avisa pelo code', async () => {
    const gateway = seeded();
    gateway.next = failWith(404, 'CATEGORY_NOT_FOUND');
    const { toast } = await setup(gateway);

    await userEvent.click(screen.getByTestId('category-archive-e2'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(toast.toasts()[0]).toMatchObject({
      tone: 'error',
      message: pt.errors.codes['CATEGORY_NOT_FOUND'],
    });
  });

  it('Dado a carga pendente, então mostra o status de carregando', async () => {
    const gateway = seeded();
    gateway.listResult = NEVER;
    await setup(gateway);

    expect(screen.getByRole('status')).toHaveTextContent(pt.categories.loading);
  });

  it('Dado nenhuma categoria, então mostra o estado vazio e ainda deixa criar', async () => {
    await setup(new CategoriesGatewayStub());

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.categories.empty.title);
    expect(screen.getByTestId('categories-add')).toBeEnabled();
  });

  it('Dado erro ao carregar, então "tentar de novo" recarrega', async () => {
    const gateway = seeded();
    gateway.listResult = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    gateway.listResult = null;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(screen.getByTestId('category-name-e1')).toBeInTheDocument();
  });

  it('Dado a página com o renomear aberto, então o axe não aponta violações', async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByTestId('category-rename-e1'));

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
