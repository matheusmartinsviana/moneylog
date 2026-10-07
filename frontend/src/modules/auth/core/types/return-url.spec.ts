import { safeReturnUrl } from '~/modules/auth/core/types/return-url';

describe('safeReturnUrl', () => {
  it.each(['/', '/transactions', '/transactions?view=entries&q=caf%C3%A9', '/accounts/1/edit#top'])(
    'Dado o caminho interno %s, então mantém',
    (value) => {
      expect(safeReturnUrl(value)).toBe(value);
    },
  );

  it.each([
    'https://x',
    'http://evil.example/login',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'transactions',
    '',
    '/ok\nLocation: x',
    undefined,
    null,
    42,
  ])('Dado %j, então vira /', (value) => {
    expect(safeReturnUrl(value)).toBe('/');
  });
});
