import { TestBed } from '@angular/core/testing';

import type { AppI18n } from '~/app/common/i18n/i18n';
import { I18nService, isLanguage, LANGUAGE_STORAGE_KEY } from '~/app/common/i18n/i18n.service';
import { TRANSLATION_LOADERS } from '~/app/common/i18n/translation-loaders';
import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';

function setup(loaders?: Partial<Record<'pt' | 'en' | 'es', () => Promise<AppI18n>>>) {
  const calls: string[] = [];
  const track = (lang: string, dict: AppI18n) => () => {
    calls.push(lang);
    return Promise.resolve(dict);
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: TRANSLATION_LOADERS,
        useValue: {
          pt: loaders?.pt ?? track('pt', pt),
          en: loaders?.en ?? track('en', en),
          es: loaders?.es ?? track('es', es),
        },
      },
    ],
  });
  return { service: TestBed.inject(I18nService), calls };
}

describe('I18nService', () => {
  it('Dado nenhuma preferência salva, quando inicio, então o idioma é pt-BR e só pt é carregado', async () => {
    const { service, calls } = setup();

    await service.init();

    expect(service.language()).toBe('pt');
    expect(service.t().nav.home).toBe('Início');
    expect(document.documentElement.lang).toBe('pt-BR');
    expect(calls).toEqual(['pt']);
  });

  it('Dado um idioma salvo, quando inicio, então carrega só esse idioma', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    const { service, calls } = setup();

    await service.init();

    expect(service.language()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(calls).toEqual(['en']);
  });

  it('Dado um valor inválido salvo, quando inicio, então usa o padrão pt', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon');
    const { service } = setup();

    await service.init();

    expect(service.language()).toBe('pt');
  });

  it('Dado o idioma pt, quando troco para es, então persiste a escolha e atualiza <html lang>', async () => {
    const { service } = setup();
    await service.init();

    await service.use('es');

    expect(service.t().nav.settings).toBe('Ajustes');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('Dado o storage bloqueado, quando inicio e troco, então a tela continua funcionando', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { service } = setup();

    await service.init();
    await service.use('en');

    expect(service.language()).toBe('en');
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('Dado duas trocas seguidas, quando a primeira termina depois, então a mais recente prevalece', async () => {
    let resolveEn: (value: AppI18n) => void = () => undefined;
    const slowEn = () => new Promise<AppI18n>((resolve) => (resolveEn = resolve));
    const { service } = setup({ en: slowEn });
    await service.init();

    const first = service.use('en');
    const second = service.use('es');
    await second;
    resolveEn(en);
    await first;

    expect(service.language()).toBe('es');
  });

  it('Dado o serviço sem init, quando leio as traduções, então falha com mensagem clara', () => {
    const { service } = setup();

    expect(() => service.t()).toThrowError(/init\(\)/);
    expect(service.ready()).toBe(false);
  });

  it('isLanguage aceita só os idiomas suportados', () => {
    expect(isLanguage('pt')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});
