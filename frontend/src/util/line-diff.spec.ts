import { lineDiff, MAX_DIFF_CELLS } from '~/util/line-diff';

describe('lineDiff', () => {
  it('Dado textos iguais, então tudo é igual', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
    ]);
  });

  it('Dado uma linha mudada, então a do servidor sai como removida e a minha como adicionada', () => {
    expect(lineDiff('a\nservidor\nc', 'a\nmeu\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'servidor' },
      { kind: 'added', text: 'meu' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('Dado linhas só de um lado, então aparecem como adicionadas ou removidas', () => {
    expect(lineDiff('a', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
    expect(lineDiff('a\nb', 'a')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
    ]);
  });

  it('Dado conteúdo com HTML, então segue como texto', () => {
    expect(lineDiff('<script>', 'x')?.map((l) => l.text)).toEqual(['<script>', 'x']);
  });

  it('Dado texto grande demais, então recusa em vez de gastar memória', () => {
    const big = Array.from(
      { length: Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10 },
      (_, i) => `l${i}`,
    ).join('\n');
    expect(lineDiff(big, big)).toBeNull();
  });

  it('Dado 1.000 linhas, então compara em tempo hábil', () => {
    const a = Array.from({ length: 1000 }, (_, i) => `linha ${i}`).join('\n');
    const b = a.replace('linha 500', 'mudou');
    const diff = lineDiff(a, b)!;
    expect(diff.filter((l) => l.kind !== 'same')).toHaveLength(2);
  });

  it('Dado 1 linha contra 200 mil linhas (produto pequeno), então recusa em vez de gerar 200 mil linhas (F6)', () => {
    const mine = '\n'.repeat(200_000);

    expect(lineDiff('uma linha', mine)).toBeNull();
  });
});
