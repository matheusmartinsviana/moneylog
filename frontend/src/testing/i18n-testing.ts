import { Provider } from '@angular/core';

import type { AppI18n, Language } from '~/app/common/i18n/i18n';
import { INITIAL_I18N_STATE } from '~/app/common/i18n/i18n.service';
import { TRANSLATION_LOADERS } from '~/app/common/i18n/translation-loaders';
import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';

export const TRANSLATIONS: Readonly<Record<Language, AppI18n>> = { pt, en, es };

/** i18n pronto e síncrono para testes de componente (sem chunks dinâmicos). */
export function provideI18nTesting(language: Language = 'pt'): Provider[] {
  return [
    { provide: INITIAL_I18N_STATE, useValue: { language, translations: TRANSLATIONS[language] } },
    {
      provide: TRANSLATION_LOADERS,
      useValue: {
        pt: () => Promise.resolve(pt),
        en: () => Promise.resolve(en),
        es: () => Promise.resolve(es),
      },
    },
  ];
}
