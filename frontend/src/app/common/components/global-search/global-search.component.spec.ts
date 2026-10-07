import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';

import { GlobalSearchComponent } from '~/app/common/components/global-search/global-search.component';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { pt } from '~/app/common/i18n/translations/pt';
import { aProblem } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aSearchResults, provideSearchStub, SearchGatewayStub } from '~/testing/reports-testing';
import { ProblemError } from '~/util/api/problem';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function setup(options: { stub?: SearchGatewayStub; compact?: boolean } = {}) {
  const stub = options.stub ?? new SearchGatewayStub();
  const result = await render(GlobalSearchComponent, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideSearchStub(stub),
      ...(options.compact
        ? [{ provide: ViewportService, useValue: { compact: signal(true) } }]
        : []),
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { ...result, stub, navigate };
}

const field = () => screen.getByRole('combobox', { name: pt.search.label });

async function search(term: string) {
  await userEvent.type(field(), term);
  return screen.findByTestId('global-search-results');
}

describe('GlobalSearchComponent', () => {
  it('Dado o campo, então é um combobox próprio (input text) com rótulo acessível, sem type=search', async () => {
    const { container } = await setup();

    const input = field();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('placeholder', pt.search.placeholder);
    expect(input).toHaveAttribute('maxlength', '100');
    expect(container.querySelector('input[type="search"]')).toBeNull();
  });

  it('Dado digitação seguida, então pede uma vez só (300 ms de pausa) e agrupa os cinco grupos como o backend', async () => {
    const { stub } = await setup();

    const list = await search('mercado');

    expect(stub.queries).toEqual(['mercado']);
    for (const title of Object.values(pt.search.groups)) {
      expect(within(list).getByText(title)).toBeInTheDocument();
    }
    expect(within(list).getAllByRole('option')).toHaveLength(5);
    // Valor do backend, só formatado; nenhum total ou soma.
    expect(text(screen.getByTestId('global-search-option-transactions'))).toContain('R$ 87,30');
    expect(text(list)).not.toMatch(/total|soma/i);
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(field()).toHaveAttribute('aria-controls', list.id);
  });

  it('Dado conta arquivada, então vem marcada em texto', async () => {
    await setup();
    await search('mercado');
    expect(text(screen.getByTestId('global-search-option-accounts'))).toContain(pt.search.archived);
  });

  it('Dado o snippet da nota com marcação, então aparece como TEXTO PURO (nada de HTML nem Markdown renderizado)', async () => {
    await setup();
    const list = await search('mercado');

    const snippet = within(list).getByTestId('global-search-snippet');
    expect(snippet.textContent).toBe('<b>Comprar</b> leite **e** pão <img src=x onerror=alert(1)>');
    expect(list.querySelector('b, img, strong')).toBeNull();
  });

  it('Dado "truncated", então avisa "resultados parciais"', async () => {
    const stub = new SearchGatewayStub();
    stub.result = (q) => of(aSearchResults({ q, truncated: ['notes'], notes: [] }));
    await setup({ stub });

    await search('mercado');

    expect(screen.getByTestId('global-search-truncated')).toHaveTextContent(pt.search.truncated);
  });

  it('Dado as setas, então o aria-activedescendant anda pela lista e Enter abre o destino de cada grupo', async () => {
    const { navigate } = await setup();
    const list = await search('mercado');
    const options = within(list).getAllByRole('option');

    await userEvent.keyboard('{ArrowDown}');
    expect(field()).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(field()).toHaveAttribute('aria-activedescendant', options[2]!.id);
    await userEvent.keyboard('{ArrowUp}');
    expect(field()).toHaveAttribute('aria-activedescendant', options[1]!.id);

    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(navigate).toHaveBeenCalledWith([
      '/transactions',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(field()).toHaveValue('');
    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
  });

  it.each([
    [1, ['/accounts', '22222222-2222-4222-8222-222222222222']],
    [2, ['/settings/categories']],
    [3, ['/cards', '44444444-4444-4444-8444-444444444444']],
    [4, ['/notes', '55555555-5555-4555-8555-555555555555']],
  ])('Dado o resultado %i, então Enter navega para o destino do grupo', async (index, commands) => {
    const { navigate } = await setup();
    await search('mercado');

    await userEvent.keyboard('{ArrowDown}'.repeat((index as number) + 1));
    await userEvent.keyboard('{Enter}');

    expect(navigate).toHaveBeenCalledWith(commands);
  });

  it('Dado Esc, então fecha o painel e o foco continua no campo', async () => {
    await setup();
    await search('mercado');

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('mercado');
  });

  it('Dado clique numa opção, então navega e o foco não sai do campo antes (mousedown não rouba o foco)', async () => {
    const { navigate } = await setup();
    await search('mercado');

    await userEvent.click(screen.getByTestId('global-search-option-cards'));

    expect(navigate).toHaveBeenCalledWith(['/cards', '44444444-4444-4444-8444-444444444444']);
  });

  it('Dado menos de 2 caracteres, então mostra a dica e não chama a API', async () => {
    const { stub } = await setup();

    await userEvent.type(field(), 'a');

    expect(screen.getByTestId('global-search-hint')).toHaveTextContent(pt.search.hint);
    expect(stub.queries).toEqual([]);
  });

  it('Dado nada encontrado, então diz isso com o termo', async () => {
    const stub = new SearchGatewayStub();
    stub.result = (q) =>
      of(
        aSearchResults({ q, transactions: [], accounts: [], categories: [], cards: [], notes: [] }),
      );
    await setup({ stub });

    await userEvent.type(field(), 'zzz');

    expect(await screen.findByTestId('global-search-empty')).toHaveTextContent(
      'Nada encontrado para “zzz”.',
    );
  });

  it('Dado 429, então "muitas buscas, aguarde" e "tentar de novo" repete o termo', async () => {
    const stub = new SearchGatewayStub();
    stub.result = () => throwError(() => new ProblemError(aProblem(429, 'TOO_MANY_ATTEMPTS')));
    await setup({ stub });
    await userEvent.type(field(), 'mercado');
    expect(await screen.findByTestId('global-search-error')).toHaveTextContent(
      pt.search.errors.rateLimit,
    );

    stub.result = (q) => of(aSearchResults({ q }));
    await userEvent.click(screen.getByTestId('global-search-retry'));

    expect(await screen.findByTestId('global-search-results')).toBeInTheDocument();
    expect(stub.queries).toEqual(['mercado', 'mercado']);
    expect(field()).toHaveFocus();
  });

  it('Dado SEARCH_QUERY_INVALID e falha genérica, então cada uma tem a sua mensagem traduzida', async () => {
    const stub = new SearchGatewayStub();
    stub.result = () => throwError(() => new ProblemError(aProblem(400, 'SEARCH_QUERY_INVALID')));
    await setup({ stub });
    await userEvent.type(field(), 'mercado');
    expect(await screen.findByTestId('global-search-error')).toHaveTextContent(
      pt.search.errors.invalid,
    );

    stub.result = () => throwError(() => new ProblemError(aProblem(500, 'INTERNAL_ERROR')));
    await userEvent.type(field(), 'x');
    await waitFor(() =>
      expect(screen.getByTestId('global-search-error')).toHaveTextContent(pt.search.errors.generic),
    );
  });

  it('Dado o resultado, então a região viva anuncia a contagem', async () => {
    await setup();
    await search('mercado');

    // Cada teste cria a sua região viva no body (as de testes anteriores ficam para trás): vale qualquer uma.
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('[data-cy="live-announcer"]')).map((el) =>
          el.textContent?.trim(),
        ),
      ).toContain('5 resultados'),
    );
  });

  describe('atalho "/"', () => {
    it('Dado o foco fora de campos, então "/" foca a busca; dado outro campo de texto, então não dispara', async () => {
      await setup();
      document.body.focus();

      await userEvent.keyboard('/');
      expect(field()).toHaveFocus();
      // Dentro do próprio campo a barra é um caractere comum.
      await userEvent.keyboard('a/b');
      expect(field()).toHaveValue('a/b');

      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();
      await userEvent.keyboard('/');
      expect(other).toHaveFocus();
      expect(other).toHaveValue('/');
      other.remove();
    });
  });

  describe('tela compacta', () => {
    it('Dado ≤ 640 px, então há um botão de lupa que abre uma folha com o campo em foco e os resultados', async () => {
      await setup({ compact: true });

      const open = screen.getByTestId('global-search-open');
      expect(open).toHaveAttribute('aria-label', pt.search.open);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

      await userEvent.click(open);
      const sheet = await screen.findByRole('dialog', { name: pt.search.sheetTitle });
      await userEvent.type(within(sheet).getByRole('combobox'), 'mercado');

      expect(await within(sheet).findByTestId('global-search-results')).toBeInTheDocument();
    });

    it('Dado a folha aberta, então Esc a fecha e o foco volta ao botão de lupa', async () => {
      await setup({ compact: true });
      const open = screen.getByTestId('global-search-open');
      await userEvent.click(open);
      await screen.findByRole('dialog');

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(open).toHaveFocus();
    });
  });

  it('Dado o painel aberto, então não há violações de acessibilidade', async () => {
    const { container } = await setup();
    await search('mercado');

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
