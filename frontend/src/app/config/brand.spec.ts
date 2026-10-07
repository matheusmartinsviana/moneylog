import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';
import { BRAND_NAME } from '~/app/config/brand';

/**
 * A marca vive em um lugar só (T192). `scripts/check-brand.mjs` (parte do `npm run lint`) confere os arquivos
 * estáticos (`index.html`, manifest), a ausência de marca escrita à mão e os espaços de logo vazios.
 */
describe('BRAND_NAME', () => {
  it('Dado a constante, então é o nome do produto (moneylog), não o nome de trabalho do brief', () => {
    expect(BRAND_NAME).toBe('moneylog');
    expect(BRAND_NAME).not.toMatch(/finvault/i);
  });

  it.each([
    ['pt', pt],
    ['en', en],
    ['es', es],
  ])('Dado o idioma %s, então shell.brand lê a constante', (_, dict) => {
    expect(dict.shell.brand).toBe(BRAND_NAME);
  });
});
