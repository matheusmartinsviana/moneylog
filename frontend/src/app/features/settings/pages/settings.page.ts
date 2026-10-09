import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { exhaustMap, finalize, Subject } from 'rxjs';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import {
  EmptyStateAction,
  EmptyStateComponent,
} from '~/app/common/components/empty-state/empty-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { SUPPORTED_LANGUAGES } from '~/app/common/i18n/i18n';
import { isLanguage, I18nService } from '~/app/common/i18n/i18n.service';
import {
  isThemePreference,
  THEME_PREFERENCES,
  ThemePreference,
  ThemeService,
} from '~/app/common/services/theme.service';
import { VaultSectionComponent } from '~/app/features/notes/components/vault-section/vault-section.component';
import { ExportSectionComponent } from '~/app/features/settings/components/export-section/export-section.component';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';

/**
 * Configurações: preferências reais deste dispositivo (idioma e tema) e o estado vazio
 * do que ainda não existe (chaves de IA, armazenamento do vault).
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SelectComponent,
    PageLayoutComponent,
    SectionContainerComponent,
    DisclosureComponent,
    EmptyStateComponent,
    ExportSectionComponent,
    VaultSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.css',
})
export class SettingsPage {
  private readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly session = inject(SessionFacade);
  private readonly router = inject(Router);
  private readonly signOuts = new Subject<void>();

  protected readonly t = this.i18n.t;
  protected readonly language = this.i18n.language;
  protected readonly themePreference = this.theme.preference;
  protected readonly languages = SUPPORTED_LANGUAGES;
  protected readonly themes = THEME_PREFERENCES;

  protected readonly themeLabels = computed<Readonly<Record<ThemePreference, string>>>(() => {
    const s = this.t().settings;
    return { system: s.themeSystem, light: s.themeLight, dark: s.themeDark };
  });

  protected readonly languageOptions = computed<readonly ChoiceOption[]>(() =>
    this.languages.map((code) => ({
      value: code,
      label: this.t().settings.languageNames[code],
      lang: code,
    })),
  );
  protected readonly themeOptions = computed<readonly ChoiceOption[]>(() =>
    this.themes.map((option) => ({ value: option, label: this.themeLabels()[option] })),
  );

  // Preferências valem na hora (sem botão salvar): o controle só espelha o estado dos serviços.
  protected readonly languageControl = new FormControl<string | null>(this.language());
  protected readonly themeControl = new FormControl<string | null>(this.themePreference());

  protected readonly signingOut = signal(false);

  protected readonly actions = computed<readonly EmptyStateAction[]>(() => [
    { id: 'connect-ai', label: this.t().emptyState.settings.connectAi, available: false },
  ]);

  constructor() {
    effect(() => this.languageControl.setValue(this.language(), { emitEvent: false }));
    effect(() => this.themeControl.setValue(this.themePreference(), { emitEvent: false }));
    this.languageControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (isLanguage(value)) void this.i18n.use(value);
    });
    this.themeControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (isThemePreference(value)) this.theme.set(value);
    });
    // exhaustMap: um toque duplo em "Sair" faz uma chamada só.
    this.signOuts
      .pipe(
        exhaustMap(() => {
          this.signingOut.set(true);
          return this.session.logout().pipe(finalize(() => this.signingOut.set(false)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.router.navigate(['/login']));
  }

  protected signOut(): void {
    this.signOuts.next();
  }
}
