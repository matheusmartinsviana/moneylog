import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { NewNoteSheetComponent } from '~/app/features/notes/components/new-note-sheet/new-note-sheet.component';
import type { Note } from '~/modules/notes/core/types/note';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { NotesGatewayStub, provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

async function setup(
  inputs: Partial<{
    suggestedName: string;
    links: { type: 'TRANSACTION'; id: string }[];
  }> = {},
  gateway = new NotesGatewayStub(),
) {
  const created: Note[] = [];
  const closed = vi.fn();
  const result = await render(NewNoteSheetComponent, {
    inputs: { open: true, ...inputs },
    on: { created: (note: Note) => created.push(note), closed },
    providers: [provideI18nTesting('pt'), provideNotesStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, created, closed };
}

describe('NewNoteSheetComponent', () => {
  it('Dado abrir com um nome sugerido, então o campo vem preenchido (e o usuário pode trocar)', async () => {
    await setup({ suggestedName: 'Nota de Notebook' });

    expect(screen.getByTestId('new-note-name')).toHaveValue('Nota de Notebook');
    expect(screen.getByRole('dialog', { name: pt.notes.create.title })).toBeInTheDocument();
  });

  it('Dado nome e pasta, então cria o caminho .md, com título e os vínculos pedidos, e entrega a nota', async () => {
    const { gateway, created } = await setup({
      suggestedName: '',
      links: [{ type: 'TRANSACTION', id: 'tx-1' }],
    });

    await userEvent.type(screen.getByTestId('new-note-name'), 'Revisão de outubro');
    await userEvent.type(screen.getByTestId('new-note-folder'), 'reviews/2026');
    await userEvent.click(screen.getByTestId('new-note-submit'));

    expect(gateway.creates).toEqual([
      {
        path: 'reviews/2026/Revisão de outubro.md',
        body: '# Revisão de outubro\n\n',
        links: [{ type: 'TRANSACTION', id: 'tx-1' }],
      },
    ]);
    expect(gateway.createKeys).toHaveLength(1);
    expect(created.map((n) => n.id)).toEqual(['note-new']);
  });

  it('Dado nome vazio, então mostra o erro do campo e não envia', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('new-note-submit'));

    expect(screen.getByTestId('new-note-name')).toHaveAttribute('aria-invalid', 'true');
    expect(gateway.creates).toEqual([]);
  });

  it.each([
    ['a:b', pt.notes.create.pathInvalid],
    ['..', pt.notes.create.pathInvalid],
  ])('Dado o nome %s, então avisa antes de enviar', async (name, message) => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('new-note-name'));
    await userEvent.paste(name);
    await userEvent.click(screen.getByTestId('new-note-submit'));

    expect(screen.getByTestId('new-note-error')).toHaveTextContent(message);
    expect(gateway.creates).toEqual([]);
  });

  it('Dado nome e pasta que juntos passam de 255 caracteres, então avisa antes de enviar', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('new-note-name'));
    await userEvent.paste('x'.repeat(150));
    await userEvent.click(screen.getByTestId('new-note-folder'));
    await userEvent.paste('y'.repeat(150));
    await userEvent.click(screen.getByTestId('new-note-submit'));

    expect(screen.getByTestId('new-note-error')).toHaveTextContent(pt.notes.create.pathTooLong);
    expect(gateway.creates).toEqual([]);
  });

  it('Dado NOTE_PATH_TAKEN, então o erro vai para o campo do nome e o que foi digitado fica', async () => {
    const gateway = new NotesGatewayStub();
    gateway.next = failWith(422, 'NOTE_PATH_TAKEN');
    await setup({}, gateway);

    await userEvent.type(screen.getByTestId('new-note-name'), 'Duplicada');
    await userEvent.click(screen.getByTestId('new-note-submit'));

    expect(screen.getByTestId('new-note-name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('new-note-name')).toHaveValue('Duplicada');
    expect(screen.queryByTestId('new-note-error')).not.toBeInTheDocument();
  });

  it('Dado falha de rede, então o "tentar de novo" reusa a Idempotency-Key', async () => {
    const gateway = new NotesGatewayStub();
    gateway.next = failWith(0, 'NETWORK');
    await setup({}, gateway);

    await userEvent.type(screen.getByTestId('new-note-name'), 'Nota');
    await userEvent.click(screen.getByTestId('new-note-submit'));
    expect(screen.getByTestId('new-note-error')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('new-note-submit'));

    expect(gateway.createKeys).toHaveLength(2);
    expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
  });

  it('Dado Cancelar, então fecha sem criar', async () => {
    const { gateway, closed } = await setup();

    await userEvent.click(screen.getByTestId('new-note-cancel'));

    expect(closed).toHaveBeenCalled();
    expect(gateway.creates).toEqual([]);
  });

  it('Dado a folha aberta, então o axe não aponta violações', async () => {
    await setup();

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
