import {
  MAX_FILENAME_LENGTH,
  safeFilenameFromContentDisposition,
} from '~/util/api/content-disposition';

const CSV = 'moneylog-transactions.csv';
const JSON_FALLBACK = 'moneylog-backup.json';

describe('safeFilenameFromContentDisposition', () => {
  it.each([
    [
      'attachment; filename="moneylog-backup-2026-10-10.json"',
      JSON_FALLBACK,
      'moneylog-backup-2026-10-10.json',
    ],
    ['attachment; filename=moneylog-transactions.csv', CSV, 'moneylog-transactions.csv'],
    ["attachment; filename*=UTF-8''movimenta%C3%A7%C3%B5es.csv", CSV, 'movimentações.csv'],
    ['attachment; filename="fallback.csv"; filename*=UTF-8\'\'real.csv', CSV, 'real.csv'],
  ])('Dado %s, então devolve o nome limpo', (header, fallback, name) => {
    expect(safeFilenameFromContentDisposition(header, fallback)).toBe(name);
  });

  it.each([null, 'attachment', 'inline', 'attachment; filename=""', 'attachment; filename=".."'])(
    'Dado %s, então cai no nome padrão',
    (header) => {
      expect(safeFilenameFromContentDisposition(header, CSV)).toBe(CSV);
    },
  );

  it('Dado um caminho no nome, então fica só o último trecho', () => {
    expect(safeFilenameFromContentDisposition('attachment; filename="../../etc/x.csv"', CSV)).toBe(
      'x.csv',
    );
    expect(
      safeFilenameFromContentDisposition("attachment; filename*=UTF-8''..%2f..%2fx.csv", CSV),
    ).toBe('x.csv');
  });

  it('Dado percent-encoding inválido, então cai no padrão', () => {
    expect(safeFilenameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4%A", CSV)).toBe(
      CSV,
    );
  });

  it('Dado caractere bidi (RLO) que esconderia a extensão, então é removido e a extensão errada derruba o nome', () => {
    expect(
      safeFilenameFromContentDisposition("attachment; filename*=UTF-8''evil%E2%80%AEgnp.exe", CSV),
    ).toBe(CSV);
    expect(
      safeFilenameFromContentDisposition("attachment; filename*=UTF-8''re%E2%80%AEport.csv", CSV),
    ).toBe('report.csv');
  });

  it('Dado caracteres proibidos, então viram _ (allowlist)', () => {
    expect(
      safeFilenameFromContentDisposition('attachment; filename="a:b*c?d<e>f|g h.csv"', CSV),
    ).toBe('a_b_c_d_e_f_g_h.csv');
    expect(safeFilenameFromContentDisposition('attachment; filename="ab\\"c.csv"', CSV)).toBe(
      'ab_c.csv',
    );
  });

  it('Dado controles, então são removidos', () => {
    expect(
      safeFilenameFromContentDisposition("attachment; filename*=UTF-8''a%00b%0D%0Ac.csv", CSV),
    ).toBe('abc.csv');
  });

  it('Dado um nome só de pontos ou sem base, então cai no padrão', () => {
    expect(safeFilenameFromContentDisposition('attachment; filename="....csv"', CSV)).toBe(CSV);
    expect(safeFilenameFromContentDisposition('attachment; filename=".csv"', CSV)).toBe(CSV);
    expect(safeFilenameFromContentDisposition('attachment; filename="___.csv"', CSV)).toBe(CSV);
  });

  it('Dado ponto inicial e final, então são tirados (sem arquivo oculto)', () => {
    expect(safeFilenameFromContentDisposition('attachment; filename="..x..csv"', CSV)).toBe(
      'x.csv',
    );
  });

  it('Dado um nome enorme, então limita o tamanho preservando a extensão', () => {
    const name = safeFilenameFromContentDisposition(
      `attachment; filename="${'a'.repeat(500)}.json"`,
      JSON_FALLBACK,
    );
    expect(name).toHaveLength(MAX_FILENAME_LENGTH);
    expect(name.endsWith('.json')).toBe(true);
  });

  it('Dado a extensão errada para o tipo, então cai no padrão; maiúscula vira minúscula', () => {
    expect(safeFilenameFromContentDisposition('attachment; filename="x.json"', CSV)).toBe(CSV);
    expect(safeFilenameFromContentDisposition('attachment; filename="X.CSV"', CSV)).toBe('X.csv');
    expect(safeFilenameFromContentDisposition('attachment; filename="x.csv.exe"', CSV)).toBe(CSV);
  });
});
