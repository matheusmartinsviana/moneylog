import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const OPTIONS: readonly ChoiceOption[] = [
  { value: 'a1', label: 'Conta corrente', hint: 'R$ 100,00' },
  { value: 'a2', label: 'Carteira' },
  { value: 'a3', label: 'Arquivada', disabled: true },
  { value: 'a4', label: 'Corretora' },
];

@Component({
  selector: 'app-select-host',
  imports: [ReactiveFormsModule, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-select
    [formControl]="control"
    fieldId="account"
    label="Conta"
    [options]="options"
  />`,
})
class SelectHostComponent {
  readonly options = OPTIONS;
  readonly control = new FormControl<string | null>(null);
}

async function setup() {
  const result = await render(SelectHostComponent, { providers: [provideI18nTesting('pt')] });
  return {
    ...result,
    control: result.fixture.componentInstance.control,
    combo: screen.getByRole('combobox', { name: 'Conta' }),
  };
}

describe('SelectComponent', () => {
  it('Dado nada escolhido, então mostra "Selecione" e a lista fechada', async () => {
    const { combo } = await setup();

    expect(combo).toHaveTextContent('Selecione');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(combo).toHaveAttribute('data-cy', 'account');
  });

  it('Dado o clique, então abre a lista com role option e data-cy por opção, e escolher atualiza o controle', async () => {
    const { combo, control } = await setup();

    await userEvent.click(combo);
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(4);

    await userEvent.click(screen.getByTestId('account-option-a2'));
    expect(control.value).toBe('a2');
    expect(combo).toHaveTextContent('Carteira');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
  });

  it('Dado o teclado, então setas navegam pulando a desabilitada e Enter escolhe', async () => {
    const { combo, control } = await setup();

    await userEvent.tab();
    expect(combo).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    expect(combo.getAttribute('aria-activedescendant')).toMatch(/option-0$/);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(combo.getAttribute('aria-activedescendant')).toMatch(/option-3$/);
    await userEvent.keyboard('{Enter}');

    expect(control.value).toBe('a4');
    expect(combo).toHaveTextContent('Corretora');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
  });

  it('Dado a lista aberta, então Esc fecha sem alterar o valor e Espaço abre', async () => {
    const { combo, control } = await setup();

    combo.focus();
    await userEvent.keyboard(' ');
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');

    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(control.value).toBeNull();
  });

  it('Dado a digitação, então vai para a opção que começa com a letra', async () => {
    const { combo, control } = await setup();

    combo.focus();
    await userEvent.keyboard('c');
    await userEvent.keyboard('{Enter}');

    expect(control.value).toBe('a1');
  });

  it('Dado a opção desabilitada, então o clique não escolhe', async () => {
    const { combo, control } = await setup();

    await userEvent.click(combo);
    await userEvent.click(screen.getByTestId('account-option-a3'));

    expect(control.value).toBeNull();
  });

  it('Dado que saio do campo vazio, então o erro de obrigatório aparece e o campo fica inválido', async () => {
    const { combo } = await setup();

    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByText('Preencha este campo.')).toBeVisible();
    expect(combo).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado uma busca sem resultado, então a mensagem é um aviso de status fora do listbox (não uma opção)', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      value: `c${i}`,
      label: `Categoria ${i}`,
    }));
    const control = new FormControl<string | null>(null);
    await render(
      `<app-select [formControl]="control" fieldId="cat" label="Categoria" [options]="options" />`,
      {
        imports: [ReactiveFormsModule, SelectComponent],
        componentProperties: { control, options: many },
        providers: [provideI18nTesting('pt')],
      },
    );

    await userEvent.click(screen.getByTestId('cat'));
    await userEvent.type(screen.getByTestId('cat-search'), 'zzz');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Nada encontrado.');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado emptyLabel e mais de 8 opções, então mostra "Todas", busca ignorando acento e anuncia resultados', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      value: `c${i}`,
      label: i === 3 ? 'Educação' : `Categoria ${i}`,
    }));
    const control = new FormControl<string | null>('c1');
    await render(
      `<app-select [formControl]="control" fieldId="cat" label="Categoria" emptyLabel="Todas" [mandatory]="false" [options]="options" />`,
      {
        imports: [ReactiveFormsModule, SelectComponent],
        componentProperties: { control, options: many },
        providers: [provideI18nTesting('pt')],
      },
    );

    await userEvent.click(screen.getByTestId('cat'));
    await userEvent.type(screen.getByTestId('cat-search'), 'educacao');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(control.value).toBe('c3');

    await userEvent.click(screen.getByTestId('cat'));
    await userEvent.click(screen.getByTestId('cat-option-all'));
    expect(control.value).toBeNull();
    expect(screen.getByTestId('cat')).toHaveTextContent('Todas');
  });

  it('Dado tela compacta, então a lista abre como folha inferior (dialog) com botão Fechar e foco na lista', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    try {
      const { combo, control } = await setup();

      await userEvent.click(combo);
      expect(screen.getByRole('dialog', { name: 'Conta' })).toBeInTheDocument();
      await vi.waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());
      await userEvent.keyboard('{ArrowDown}{Enter}');
      expect(control.value).toBe('a2');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await vi.waitFor(() => expect(combo).toHaveFocus());

      await userEvent.click(combo);
      await userEvent.click(screen.getByTestId('account-panel-close'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Dado a lista aberta, então o toque fora fecha sem alterar', async () => {
    const { combo, control } = await setup();

    await userEvent.click(combo);
    await userEvent.click(document.body);

    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(control.value).toBeNull();
  });

  it('Dado o campo com a lista aberta, então o axe não aponta violações', async () => {
    const { combo } = await setup();
    await userEvent.click(combo);

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe('SelectComponent: opções agrupadas', () => {
  @Component({
    selector: 'app-select-grouped-host',
    imports: [ReactiveFormsModule, SelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<app-select
      [formControl]="control"
      fieldId="kind"
      label="Tipo"
      [searchable]="false"
      [options]="options"
    />`,
  })
  class GroupedHostComponent {
    readonly options: readonly ChoiceOption[] = [
      { value: 'expense', label: 'Despesa', group: 'Gastos' },
      { value: 'pix', label: 'Pix', group: 'Gastos' },
      { value: 'income', label: 'Receita', group: 'Entradas' },
    ];
    readonly control = new FormControl<string | null>(null);
  }

  it('Dado opções com grupo, então cada grupo é um role=group nomeado pelo cabeçalho e escolher funciona', async () => {
    const { fixture } = await render(GroupedHostComponent, {
      providers: [provideI18nTesting('pt')],
    });

    await userEvent.click(screen.getByRole('combobox', { name: 'Tipo' }));

    expect(screen.getByRole('group', { name: 'Gastos' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Entradas' })).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await userEvent.click(screen.getByTestId('kind-option-income'));
    expect(fixture.componentInstance.control.value).toBe('income');
  });
});
