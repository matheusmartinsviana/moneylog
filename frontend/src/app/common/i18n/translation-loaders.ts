import { InjectionToken } from '@angular/core';

import type { AppI18n, Language } from '~/app/common/i18n/i18n';

export type TranslationLoaders = Readonly<Record<Language, () => Promise<AppI18n>>>;

/**
 * Cada idioma fica no seu próprio chunk: só o ativo é baixado.
 */
export const TRANSLATION_LOADERS = new InjectionToken<TranslationLoaders>('TRANSLATION_LOADERS', {
  providedIn: 'root',
  factory: () => ({
    pt: () => import('~/app/common/i18n/translations/pt').then((m) => m.pt),
    en: () => import('~/app/common/i18n/translations/en').then((m) => m.en),
    es: () => import('~/app/common/i18n/translations/es').then((m) => m.es),
  }),
});
