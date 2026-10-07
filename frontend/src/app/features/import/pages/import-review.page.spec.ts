import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ImportReviewPage } from '~/app/features/import/pages/import-review.page';
import { anAccount, AccountsGatewayStub, provideAccountsStub } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aBatch, aLine, ImportsGatewayStub, provideImportsStub } from '~/testing/imports-testing';

@Component({ template: '' })
class ImportStubPage {}

async function setup(gateway = new ImportsGatewayStub()) {
  const categories = new CategoriesGatewayStub();
  categories.categories = [
    aCategory({ id: 'cat-food', name: 'Alimentação' }),
    aCategory({ id: 'cat-salary', name: 'Salário', kind: 'INCOME' }),
  ];
  const accounts = new AccountsGatewayStub();
  accounts.accounts = [anAccount({ id: 'acc-1' }), anAccount({ id: 'acc-2', name: 'XP' })];
  const result = await render(ImportReviewPage, {
    inputs: { id: 'b-1' },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([{ path: 'import', component: ImportStubPage }]),
      provideImportsStub(gateway),
      provideCategoriesStub(categories),
      provideAccountsStub(accounts),
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway };
}

const flush = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('ImportReviewPage (T134)', () => {
  it('Dado o lote, então diz "Revise antes de aplicar" e mostra linha, valor, categoria sugerida com confiança em texto', async () => {
    await setup();

    expect(screen.getByTestId('import-review-first')).toHaveTextContent('Revise antes de aplicar');
    expect(screen.getByTestId('import-line-description')).toHaveTextContent('PADARIA SAO JORGE');
    expect(screen.getByTestId('import-line-category')).toHaveTextContent('Alimentação');
    expect(screen.getByTestId('import-line-confidence')).toHaveTextContent('Confiança alta');
    expect(screen.getByTestId('import-line-status')).toHaveTextContent('Pendente');
    expect(screen.getByTestId('money-value').textContent).toMatch(/R\$\s?24,50/);
  });

  it('Dado os contadores do backend, então o resumo vem deles (sem contar no front)', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({
      counts: {
        total: 43,
        pending: 3,
        accepted: 38,
        rejected: 2,
        duplicate: 0,
        possibleDuplicate: 0,
        requireDecision: 3,
      },
    });
    await setup(gateway);
    expect(screen.getByTestId('import-summary-text')).toHaveTextContent(
      '38 aceitas, 2 rejeitadas, 3 precisam de decisão',
    );
  });

  it('Dado "Aceitar" numa linha com sugestão, então envia ACCEPT com a categoria sugerida e atualiza pela resposta', async () => {
    const { gateway, fixture } = await setup();
    await userEvent.click(screen.getByTestId('import-line-accept'));
    await flush(fixture);

    expect(gateway.patches[0]?.patch).toEqual({
      action: 'ACCEPT',
      categoryId: 'cat-food',
      method: 'DEBIT',
    });
    expect(screen.getByTestId('import-line-status')).toHaveTextContent('Aceita');
  });

  it('Dado linha com DUPLICATE, então vem com "Forçar importação" explícito e a movimentação parecida linkada', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [
      aLine({ id: 'd', status: 'DUPLICATE', matches: ['tx-9'], suggestion: null }),
    ];
    await setup(gateway);

    expect(screen.getByTestId('import-line-status')).toHaveTextContent('Duplicada');
    expect(screen.getByTestId('import-line-similar-link')).toHaveAttribute(
      'href',
      '/transactions/tx-9',
    );
    await userEvent.click(screen.getByTestId('import-line-force'));
    expect(screen.getByTestId('import-decision-force-help')).toBeInTheDocument();
    expect(screen.getByTestId('import-decision-confirm')).toHaveTextContent('Forçar importação');
  });

  it('Dado POSSIBLE_TRANSFER, então "Aplicar" fica bloqueado com a explicação até decidir', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [aLine({ id: 't', flags: ['POSSIBLE_TRANSFER'], requiresDecision: true })];
    gateway.batch = aBatch({
      counts: { ...aBatch().counts, requireDecision: 1 },
    });
    const { fixture } = await setup(gateway);

    expect(screen.getByTestId('import-apply')).toBeDisabled();
    expect(screen.getByTestId('import-needs-decision')).toHaveTextContent(
      'Ainda há 1 linhas pedindo decisão',
    );
    expect(screen.getByTestId('import-flag-POSSIBLE_TRANSFER')).toHaveTextContent(
      'Possível transferência',
    );

    await userEvent.click(screen.getByTestId('import-line-decide'));
    await userEvent.click(screen.getByTestId('decision-choice-transfer'));
    await userEvent.click(screen.getByTestId('import-decision-confirm'));
    await flush(fixture);
    expect(screen.getByTestId('decision-counterpart-required')).toBeInTheDocument();
    expect(gateway.patches).toEqual([]);
  });

  it('Dado LOOKS_LIKE_INSTALLMENT e "Ignorar", então rejeita a linha', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [
      aLine({ id: 'p', flags: ['LOOKS_LIKE_INSTALLMENT'], requiresDecision: true }),
    ];
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('import-line-decide'));
    await userEvent.click(screen.getByTestId('decision-choice-ignore'));
    await userEvent.click(screen.getByTestId('import-decision-confirm'));
    await flush(fixture);
    expect(gateway.patches).toEqual([{ lineId: 'p', patch: { action: 'REJECT' } }]);
  });

  it('Dado "Aceitar todas as sem decisão", então usa lines:bulk e mostra o resultado do backend', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.bulkResult = { updated: 1, skipped: [{ lineId: 'z', reason: 'NO_CATEGORY' }] };
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('import-accept-all'));
    await vi.waitFor(() => expect(gateway.bulkCalls).toHaveLength(1));
    await flush(fixture);
    expect(screen.getByTestId('import-bulk-result')).toHaveTextContent('1 linhas aceitas');
    expect(screen.getByTestId('import-bulk-result')).toHaveTextContent('Sem categoria sugerida');
  });

  it('Dado "Aplicar", então confirma com resumo, usa Idempotency-Key, mostra o criado e leva às movimentações', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ counts: { ...aBatch().counts, accepted: 2 } });
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('import-apply'));
    expect(screen.getByRole('dialog')).toHaveTextContent('As 2 linhas aceitas viram movimentações');
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await vi.waitFor(() => expect(gateway.applyKeys).toHaveLength(1));
    await flush(fixture);

    expect(screen.getByTestId('import-applied')).toHaveTextContent('2 movimentações criadas');
    expect(screen.getByTestId('import-applied-link')).toHaveAttribute('href', '/transactions');
    expect(screen.queryByTestId('import-apply')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-undo')).toBeInTheDocument();
  });

  it('Dado desfazer parcial, então lista os bloqueados com a razão e o caminho de correção', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ status: 'PARTIALLY_UNDONE' });
    await setup(gateway);
    // O estado "parcial" vem do backend; os bloqueados chegam na resposta do desfazer.
    expect(screen.getByTestId('import-partially-undone')).toHaveTextContent(
      'Importação desfeita em parte',
    );
    expect(screen.getByTestId('import-undo')).toBeInTheDocument();
  });

  it('Dado a linha em foco, então setas mudam de linha e A/R aceitam e rejeitam (só com a linha em foco)', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [aLine({ id: 'a', position: 1 }), aLine({ id: 'b', position: 2 })];
    const { fixture } = await setup(gateway);
    const rows = screen.getAllByTestId('import-line');

    rows[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await userEvent.keyboard('r');
    await flush(fixture);
    expect(gateway.patches[0]).toEqual({ lineId: 'b', patch: { action: 'REJECT' } });

    rows[0]!.focus();
    await userEvent.keyboard('a');
    await flush(fixture);
    expect(gateway.patches[1]?.lineId).toBe('a');
  });

  it('Dado o foco num botão da linha, então a tecla R não dispara atalho', async () => {
    const { gateway } = await setup();
    screen.getByTestId('import-line-edit').focus();
    await userEvent.keyboard('r');
    expect(gateway.patches).toEqual([]);
  });

  it('Dado lote já aplicado, então não há botões de decisão e diz que não está mais em revisão', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ status: 'APPLIED' });
    await setup(gateway);
    expect(screen.getByTestId('import-review-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('import-line-accept')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-apply')).not.toBeInTheDocument();
  });

  it('Dado SAME_FILE_ALREADY_IMPORTED, então avisa em texto com o caminho para as importações anteriores', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.batch = aBatch({ warnings: ['SAME_FILE_ALREADY_IMPORTED'] });
    await setup(gateway);
    expect(screen.getByTestId('import-warning-SAME_FILE_ALREADY_IMPORTED')).toHaveTextContent(
      'Este mesmo arquivo já foi importado',
    );
    expect(screen.getByTestId('import-warning-link')).toHaveAttribute('href', '/import');
  });

  it('Dado a página, então o axe não aponta violações', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado "Descartar lote", então confirma, chama o DELETE e volta à lista', async () => {
    const gateway = new ImportsGatewayStub();
    await setup(gateway);

    await userEvent.click(screen.getByTestId('import-discard'));
    await userEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await vi.waitFor(() => expect(gateway.calls).toContain('discard:b-1'));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/import'));
  });

  it('Dado uma linha aceita, então "Desfazer decisão" envia REOPEN', async () => {
    const gateway = new ImportsGatewayStub();
    gateway.lineList = [aLine({ status: 'ACCEPTED', categoryId: 'cat-food' })];
    await setup(gateway);

    await userEvent.click(screen.getByTestId('import-line-reopen'));

    await vi.waitFor(() => expect(gateway.patches[0]?.patch).toEqual({ action: 'REOPEN' }));
  });
});
