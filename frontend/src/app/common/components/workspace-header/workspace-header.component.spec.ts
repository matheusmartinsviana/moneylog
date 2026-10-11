import { Component, ChangeDetectionStrategy } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  GREETING_HOUR,
  greetingPeriod,
  WorkspaceHeaderComponent,
} from '~/app/common/components/workspace-header/workspace-header.component';
import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';
import { provideAuthenticatedSession } from '~/testing/auth-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotificationsStub } from '~/testing/notifications-testing';
import { provideSearchStub } from '~/testing/reports-testing';

@Component({ selector: 'app-blank', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class BlankComponent {}

async function setup(options: { hour?: number; language?: 'pt' | 'en' | 'es'; url?: string } = {}) {
  const result = await render(WorkspaceHeaderComponent, {
    // A busca e o avatar carregam em blocos @defer.
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
    routes: [
      { path: '', component: BlankComponent },
      { path: '**', component: BlankComponent },
    ],
    providers: [
      provideI18nTesting(options.language ?? 'pt'),
      provideAuthenticatedSession(),
      ...provideSearchStub(),
      ...provideNotificationsStub(),
      { provide: GREETING_HOUR, useValue: () => options.hour ?? 20 },
    ],
  });
  // A busca e o avatar carregam em blocos @defer: espera chegarem.
  await screen.findByTestId('header-profile');
  if (options.url) {
    await TestBed.inject(Router).navigateByUrl(options.url);
    await result.fixture.whenStable();
    result.fixture.detectChanges();
  }
  return result;
}

describe('greetingPeriod (FE-S-211: só o texto, sem efeito financeiro)', () => {
  it.each([
    [0, 'evening'],
    [4, 'evening'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
  ] as const)('Dado a hora %i, então o período é %s', (hour, period) => {
    expect(greetingPeriod(hour)).toBe(period);
  });
});

describe('WorkspaceHeaderComponent', () => {
  it.each([
    [9, 'Bom dia'],
    [14, 'Boa tarde'],
    [21, 'Boa noite'],
  ])('Dado o Início às %ih, então saúda "%s" sem nome, com o subtítulo', async (hour, text) => {
    await setup({ hour });

    expect(screen.getByTestId('workspace-greeting')).toHaveTextContent(text);
    expect(screen.getByTestId('workspace-subtitle')).toHaveTextContent(pt.header.subtitle);
    // Sem nome (D4): só a saudação.
    expect(screen.getByTestId('workspace-greeting').textContent?.trim()).toBe(text);
  });

  it.each([
    ['en', en.header.greeting.evening],
    ['es', es.header.greeting.evening],
  ] as const)('Dado o idioma %s, então a saudação vem das traduções', async (language, text) => {
    await setup({ hour: 21, language });

    expect(screen.getByTestId('workspace-greeting')).toHaveTextContent(text);
  });

  it('Dado outra tela que não o Início, então não há saudação (o h1 da página não duplica)', async () => {
    await setup({ url: '/cards' });

    expect(screen.queryByTestId('workspace-greeting')).not.toBeInTheDocument();
  });

  it('Dado o cabeçalho, então é uma linha só: sem ações rápidas (elas moram no cartão do Quick Capture)', async () => {
    const { container } = await setup();

    expect(screen.queryByTestId('header-actions')).not.toBeInTheDocument();
    expect(container.querySelector('.button--primary')).toBeNull();
    expect(screen.getByTestId('header-theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('header-bell')).toBeInTheDocument();
    expect(screen.getByTestId('header-profile')).toBeInTheDocument();
  });

  it('Dado o cabeçalho, então a busca global ocupa o centro em todas as telas', async () => {
    await setup({ url: '/transactions' });

    expect(screen.getByRole('combobox', { name: pt.search.label })).toBeInTheDocument();
    expect(screen.getByTestId('global-search')).toBeInTheDocument();
  });

  it('Dado o cabeçalho, então não há chip de IA (o estado fica na sidebar) e o sino abre um pop-up em vez de navegar', async () => {
    await setup();

    expect(screen.queryByTestId('header-ai-status')).not.toBeInTheDocument();
    const bell = screen.getByRole('button', { name: pt.notifications.bell.label });
    expect(bell).toHaveAttribute('data-cy', 'header-bell');
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(bell);
    expect(await screen.findByTestId('notifications-popover')).toBeInTheDocument();
  });

  it('Dado o menu do avatar, então abre com Configurações e Sair e devolve o foco no Esc', async () => {
    await setup();

    const trigger = screen.getByTestId('header-profile');
    expect(trigger).toHaveAccessibleName(pt.header.profile.label);
    await userEvent.click(trigger);
    expect(screen.getByTestId('header-profile-item-settings')).toHaveTextContent(pt.nav.settings);
    expect(screen.getByTestId('header-profile-item-signOut')).toHaveTextContent(
      pt.header.profile.signOut,
    );

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('header-profile-menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Dado o cabeçalho, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe('WorkspaceHeaderComponent: alternador de tema', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('Dado o tema claro (sol), quando clica, então vai para escuro (lua) e depois volta, com o rótulo da ação', async () => {
    const user = userEvent.setup();
    await setup();
    const toggle = screen.getByTestId('header-theme-toggle');
    expect(toggle).toHaveAccessibleName(pt.header.theme.toDark);

    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(toggle).toHaveAccessibleName(pt.header.theme.toLight);

    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(toggle).toHaveAccessibleName(pt.header.theme.toDark);
  });
});
