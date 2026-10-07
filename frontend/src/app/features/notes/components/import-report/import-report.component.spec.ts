import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ImportReportComponent } from '~/app/features/notes/components/import-report/import-report.component';
import type { ImportReport } from '~/modules/notes/core/types/note';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aReport } from '~/testing/notes-testing';

async function setup(report: ImportReport = aReport()) {
  const done = vi.fn();
  const result = await render(ImportReportComponent, {
    inputs: { report },
    on: { done },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
  return { ...result, done };
}

describe('ImportReportComponent', () => {
  it('Dado o relatório, então mostra criadas, puladas, pendentes, ignoradas, renomeadas e avisos, com linguagem calma', async () => {
    await setup();

    expect(screen.getByTestId('import-report-review')).toHaveTextContent(/Revise antes de seguir/);
    expect(screen.getByTestId('import-created')).toHaveTextContent('2');
    expect(screen.getByTestId('import-skipped')).toHaveTextContent('1');
    expect(screen.getByTestId('import-pending')).toHaveTextContent('1');
    expect(screen.getByTestId('import-ignored')).toHaveTextContent('2');
    expect(screen.getByTestId('import-renamed')).toHaveTextContent('1');
    expect(screen.getByTestId('import-warnings')).toHaveTextContent('1');
  });

  it('Dado os arquivos, então lista os ignorados, os pulados e os renomeados como texto', async () => {
    await setup();

    expect(screen.getByTestId('import-ignored-list')).toHaveTextContent('foto.png');
    expect(screen.getByTestId('import-ignored-list')).toHaveTextContent('.obsidian/app.json');
    expect(screen.getByTestId('import-skipped-list')).toHaveTextContent('reviews/2026-10.md');
    expect(screen.getByTestId('import-renamed-list')).toHaveTextContent('a.md virou a (2).md');
  });

  it('Dado um aviso conhecido, então é traduzido pelo código (a mensagem do backend não vira a tela)', async () => {
    await setup(
      aReport({
        warnings: [
          { path: 'b.md', code: 'FRONTMATTER_INVALID', message: 'qualquer texto do backend' },
          { path: 'c.md', code: 'CODIGO_NOVO', message: 'texto' },
        ],
      }),
    );

    const list = screen.getByTestId('import-warnings-list');
    expect(list).toHaveTextContent('b.md');
    expect(list).toHaveTextContent('O bloco de propriedades é inválido; a nota entrou sem ele.');
    expect(list).not.toHaveTextContent('qualquer texto do backend');
    expect(list).toHaveTextContent('Aviso sobre este arquivo');
  });

  it('Dado nomes de arquivo com HTML, então aparecem como texto, nunca como marcação', async () => {
    const { container } = await setup(
      aReport({
        ignoredFiles: ['<img src=x onerror=alert(1)>.png', '<script>alert(1)</script>.md'],
      }),
    );

    expect(container.querySelector('img, script')).toBeNull();
    expect(screen.getByTestId('import-ignored-list')).toHaveTextContent(
      '<script>alert(1)</script>.md',
    );
  });

  it('Dado mais arquivos do que cabem, então mostra os primeiros e diz quantos faltam', async () => {
    await setup(aReport({ ignoredFiles: Array.from({ length: 45 }, (_, i) => `anexo-${i}.png`) }));

    const list = screen.getByTestId('import-ignored-list');
    expect(list.querySelectorAll('li')).toHaveLength(20);
    expect(list).toHaveTextContent('E mais 25');
    expect(screen.getByTestId('import-ignored')).toHaveTextContent('45');
  });

  it('Dado relatório vazio de problemas, então não mostra listas', async () => {
    await setup(
      aReport({ ignoredFiles: [], skippedFiles: [], renamedFiles: [], warnings: [], skipped: 0 }),
    );

    expect(screen.queryByTestId('import-ignored-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-warnings-list')).not.toBeInTheDocument();
  });

  it('Dado "Ver as notas" e "Concluir", então leva às notas e avisa a tela', async () => {
    const { done } = await setup();

    expect(screen.getByTestId('import-open-notes')).toHaveAttribute('href', '/notes');
    await userEvent.click(screen.getByTestId('import-done'));

    expect(done).toHaveBeenCalled();
  });

  it('Dado o relatório, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado nome de arquivo com RLO/zero-width, então aparece com marcas visíveis dentro de um bdi (F7)', async () => {
    const rlo = '\u{202e}';
    const zero = '\u{200b}';
    await setup(
      aReport({
        ignoredFiles: [`recibo${rlo}fdp.exe`],
        skippedFiles: [`nota${zero}.md`],
        renamedFiles: [{ from: `a${rlo}.md`, to: 'a (2).md' }],
        warnings: [{ path: `x${rlo}.md`, code: 'FRONTMATTER_INVALID', message: 'm' }],
      }),
    );

    for (const id of [
      'import-ignored-list',
      'import-skipped-list',
      'import-renamed-list',
      'import-warnings-list',
    ]) {
      const list = screen.getByTestId(id);
      expect(list.textContent).not.toContain(rlo);
      expect(list.textContent).not.toContain(zero);
      expect(list.textContent).toContain('‹U+');
      expect(list.querySelector('bdi')).not.toBeNull();
    }
    expect(screen.getByTestId('import-ignored-list')).toHaveTextContent('recibo‹U+202E›fdp.exe');
  });
});
