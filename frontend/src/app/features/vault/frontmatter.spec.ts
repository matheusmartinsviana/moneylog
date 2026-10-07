import { splitFrontmatter } from '~/app/features/vault/frontmatter';

describe('splitFrontmatter', () => {
  it('Dado uma nota com bloco de metadados, então separa os pares e devolve o corpo sem o bloco', () => {
    const result = splitFrontmatter('---\ntitle: Reserva\ntags: [a, b]\n---\n# Corpo\n');
    expect(result.meta).toEqual([
      { key: 'title', value: 'Reserva' },
      { key: 'tags', value: '[a, b]' },
    ]);
    expect(result.content).toBe('# Corpo\n');
  });

  it('Dado uma nota sem bloco, então não há metadados e o corpo fica igual', () => {
    expect(splitFrontmatter('# Só corpo')).toEqual({ meta: null, content: '# Só corpo' });
  });

  it('Dado um valor com HTML, então ele continua texto puro (a tela o escapa)', () => {
    const result = splitFrontmatter('---\nnome: <script>alert(1)</script>\n---\nx');
    expect(result.meta?.[0]?.value).toBe('<script>alert(1)</script>');
  });
});
