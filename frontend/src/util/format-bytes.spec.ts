import { formatBytes } from '~/util/format-bytes';

describe('formatBytes', () => {
  it.each([
    [0, 'pt-BR', '0 B'],
    [512, 'pt-BR', '512 B'],
    [1024, 'pt-BR', '1 KB'],
    [1536, 'pt-BR', '1,5 KB'],
    [200 * 1024, 'en', '200 KB'],
    [20 * 1024 * 1024, 'en', '20 MB'],
    [1.5 * 1024 * 1024, 'en', '1.5 MB'],
  ])('Dado %d bytes em %s, então %s', (bytes, locale, expected) => {
    expect(formatBytes(bytes, locale)).toBe(expected);
  });
});
