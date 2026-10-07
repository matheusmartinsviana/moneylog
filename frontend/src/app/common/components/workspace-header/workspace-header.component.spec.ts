import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
    expect(screen.getByTestId('header-actions')).toBeInTheDocument();
  });

  it('Dado as ações rápidas, então despesa, receita e transferência levam a /quick-add?mode=', async () => {
    await setup();

    expect(screen.getByTestId('header-action-expense')).toHaveAttribute(
      'href',
      '/quick-add?mode=expense',
    );
    expect(screen.getByTestId('header-action-income')).toHaveAttribute(
      'href',
      '/quick-add?mode=income',
    );
    expect(screen.getByTestId('header-action-transfer')).toHaveAttribute(
      'href',
      '/quick-add?mode=transfer',
    );
    expect(screen.getByRole('group', { name: pt.header.actions.label })).toBeInTheDocument();
  });

  it('Dado o Início, então as ações do cabeçalho são secundárias (o primário é o atalho do Quick Capture, M6)', async () => {
    const { container } = await setup();

    expect(container.querySelector('.button--primary')).toBeNull();
    expect(screen.getByTestId('header-action-expense')).toHaveClass('button--soft');
    expect(screen.getByTestId('header-action-income')).toHaveClass('button--soft');
  });

  it('Dado outra tela, então "Adicionar despesa" segue como o botão primário do cabeçalho', async () => {
    const { container } = await setup({ url: '/transactions' });

    expect(container.querySelectorAll('.button--primary')).toHaveLength(1);
    expect(screen.getByTestId('header-action-expense')).toHaveClass('button--primary');
    expect(screen.getByTestId('header-action-expense')).not.toHaveClass('button--soft');
  });

  it('Dado o cabeçalho, então a busca global ocupa o centro em todas as telas', async () => {
    await setup({ url: '/transactions' });

    expect(screen.getByRole('combobox', { name: pt.search.label })).toBeInTheDocument();
    expect(screen.getByTestId('global-search')).toBeInTheDocument();
  });

  it('Dado "Perguntar à IA", então está desabilitado, não faz nada e continua focável com a dica própria', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');

    const ask = screen.getByTestId('header-action-askAi');
    expect(ask).toHaveAttribute('aria-disabled', 'true');
    expect(ask).not.toHaveAttribute('title');
    await userEvent.click(ask);
    expect(navigate).not.toHaveBeenCalled();

    await userEvent.tab();
    ask.focus();
    expect(ask).toHaveFocus();
  });

  it('Dado o chip de IA, então diz "IA desligada" (verdadeiro hoje) e não há sino de notificações', async () => {
    await setup();

    expect(screen.getByTestId('header-ai-status')).toHaveTextContent(pt.header.aiOff);
    expect(screen.queryByRole('button', { name: /notifica/i })).not.toBeInTheDocument();
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
  it('Dado o tema Sistema, quando clica no alternador, então vai para Claro e anuncia o estado', async () => {
    const user = userEvent.setup();
    await setup();
    const toggle = screen.getByRole('button', { name: /Tema: Automático/ });
    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('button', { name: /Tema: Claro/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Tema: Claro/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: /Tema: Escuro/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
