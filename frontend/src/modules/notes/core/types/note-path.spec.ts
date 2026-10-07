import {
  buildFolderTree,
  buildNotePath,
  isTooLarge,
  noteFolder,
  noteName,
  pathProblem,
  pathWithoutExtension,
  safeFileName,
  utf8Length,
} from '~/modules/notes/core/types/note-path';

describe('note-path', () => {
  it('Dado um caminho, então separa pasta, nome e extensão', () => {
    expect(noteName('reviews/2026-10.md')).toBe('2026-10');
    expect(noteName('MacBook.md')).toBe('MacBook');
    expect(noteFolder('a/b/c.md')).toBe('a/b');
    expect(noteFolder('c.md')).toBe('');
    expect(pathWithoutExtension('a/b.md')).toBe('a/b');
  });

  it('Dado pasta e nome, então monta o caminho .md sem barras sobrando', () => {
    expect(buildNotePath('reviews', 'Outubro')).toBe('reviews/Outubro.md');
    expect(buildNotePath('/a//b/', ' Nota .md')).toBe('a/b/Nota.md');
    expect(buildNotePath('', 'Nota')).toBe('Nota.md');
  });

  it.each([
    ['reviews/2026-10.md', null],
    ['Revisão de outubro.md', null],
    ['', 'EMPTY'],
    ['.md', 'EMPTY'],
    [`${'a'.repeat(260)}.md`, 'TOO_LONG'],
    ['a/b/c/d/e/f/g/h/i/j/k.md', 'TOO_DEEP'],
    ['../x.md', 'INVALID'],
    ['a/../x.md', 'INVALID'],
    ['/abs.md', 'INVALID'],
    ['a\\b.md', 'INVALID'],
    ['a:b.md', 'INVALID'],
    ['a?b.md', 'INVALID'],
    ['a#b.md', 'INVALID'],
    ['a[b].md', 'INVALID'],
    ['a‮b.md', 'INVALID'],
    ['.oculta/x.md', 'INVALID'],
    ['a//b.md', 'INVALID'],
  ])('Dado o caminho %j, então o problema é %s', (path, expected) => {
    expect(pathProblem(path)).toBe(expected);
  });

  it('Dado um rótulo livre, então vira nome de arquivo seguro', () => {
    expect(safeFileName('Notebook: MacBook Pro 14" / 2026?')).toBe('Notebook MacBook Pro 14 2026');
    expect(safeFileName('  ..  ')).toBe('');
    expect(safeFileName('x'.repeat(200))).toHaveLength(80);
  });

  it('Dado o limite em bytes, então conta UTF-8 e não caracteres', () => {
    expect(utf8Length('é')).toBe(2);
    expect(isTooLarge('a'.repeat(200 * 1024))).toBe(false);
    expect(isTooLarge('a'.repeat(200 * 1024 + 1))).toBe(true);
    // 150.000 caracteres de 2 bytes passam do limite de 204.800 bytes
    expect(isTooLarge('é'.repeat(150_000))).toBe(true);
  });

  it('Dado os caminhos, então a árvore tem pastas, contagem e ordem sem acento', () => {
    const tree = buildFolderTree([
      { path: 'projetos/MG Tech.md' },
      { path: 'projetos/clientes/x.md' },
      { path: 'Árvores/a.md' },
      { path: 'raiz.md' },
    ]);

    expect(tree.count).toBe(4);
    expect(tree.children.map((c) => [c.name, c.count])).toEqual([
      ['Árvores', 1],
      ['projetos', 2],
    ]);
    expect(tree.children[1]?.children.map((c) => c.path)).toEqual(['projetos/clientes']);
  });
});
