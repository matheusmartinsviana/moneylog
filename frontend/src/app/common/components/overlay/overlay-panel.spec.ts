import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  OverlayMode,
  OverlayPanelComponent,
} from '~/app/common/components/overlay/overlay-panel.component';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-overlay-host',
  imports: [OverlayPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-cy="page">
      <div #anchor>
        <button type="button" data-cy="trigger-a" (click)="openA.set(true)">A</button>
      </div>
      <div #anchorB>
        <button type="button" data-cy="trigger-b" (click)="openB.set(true)">B</button>
      </div>
      <app-overlay-panel
        [open]="openA()"
        [anchor]="anchor"
        label="Painel A"
        cy="a"
        [mode]="mode()"
        (closed)="openA.set(false)"
      >
        @if (openA()) {
          <button type="button" data-cy="a-first" data-autofocus>primeiro A</button>
          <button type="button" data-cy="a-last">último A</button>
        }
      </app-overlay-panel>
      <app-overlay-panel
        [open]="openB()"
        [anchor]="anchorB"
        label="Painel B"
        cy="b"
        [mode]="mode()"
        (closed)="openB.set(false)"
      >
        @if (openB()) {
          <button type="button" data-cy="b-first" data-autofocus>primeiro B</button>
        }
      </app-overlay-panel>
    </main>
  `,
})
class HostComponent {
  readonly openA = signal(false);
  readonly openB = signal(false);
  readonly mode = signal<OverlayMode>('popover');
}

async function setup(mode: OverlayMode = 'popover') {
  const result = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
  const host = result.fixture.componentInstance;
  host.mode.set(mode);
  result.fixture.detectChanges();
  return { ...result, host };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('OverlayPanelComponent', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
  });

  describe('popover', () => {
    it('Dado aberto, então o painel vai para o fim do body (portal) e recebe o autofoco', async () => {
      const { host, fixture } = await setup();
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      const panel = screen.getByTestId('a-panel');
      expect(panel.closest('app-overlay-panel')?.parentElement).toBe(document.body);
      expect(panel).toHaveAttribute('role', 'dialog');
      expect(panel).toHaveAccessibleName('Painel A');
      expect(screen.getByTestId('a-first')).toHaveFocus();
      expect(host.openA()).toBe(true);
    });

    it('Dado aberto e fechado, então o painel volta ao lugar de origem e o foco volta ao gatilho', async () => {
      const { host, fixture } = await setup();
      const trigger = screen.getByTestId('trigger-a');
      await userEvent.click(trigger);
      fixture.detectChanges();
      await settle();

      host.openA.set(false);
      fixture.detectChanges();
      await settle();

      expect(screen.queryByTestId('a-panel')).not.toBeInTheDocument();
      expect(screen.getByTestId('page').querySelector('app-overlay-panel')).not.toBeNull();
      expect(trigger).toHaveFocus();
    });

    it('Dado o Esc, então fecha e emite closed uma vez', async () => {
      const { host, fixture } = await setup();
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      await userEvent.keyboard('{Escape}');

      expect(host.openA()).toBe(false);
    });

    it('Dado dois painéis empilhados, então o Esc fecha só o do topo', async () => {
      const { host, fixture } = await setup();
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      host.openB.set(true);
      fixture.detectChanges();
      await settle();

      await userEvent.keyboard('{Escape}');
      fixture.detectChanges();

      expect(host.openB()).toBe(false);
      expect(host.openA()).toBe(true);

      await userEvent.keyboard('{Escape}');
      expect(host.openA()).toBe(false);
    });

    it('Dado o toque fora do painel e do gatilho, então fecha; dentro, não', async () => {
      const { host, fixture } = await setup();
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      await userEvent.click(screen.getByTestId('a-last'));
      expect(host.openA()).toBe(true);

      await userEvent.click(screen.getByTestId('page'));
      expect(host.openA()).toBe(false);
    });

    it('Dado o Tab dentro do painel, então fecha e devolve o foco ao gatilho', async () => {
      const { host, fixture } = await setup();
      const trigger = screen.getByTestId('trigger-a');
      await userEvent.click(trigger);
      fixture.detectChanges();
      await settle();
      expect(screen.getByTestId('a-first')).toHaveFocus();

      await userEvent.tab();
      fixture.detectChanges();

      expect(host.openA()).toBe(false);
      expect(trigger).toHaveFocus();
    });

    it('Dado o Shift+Tab dentro do painel, então volta ao campo (gatilho) e fecha', async () => {
      const { host, fixture } = await setup();
      const trigger = screen.getByTestId('trigger-a');
      await userEvent.click(trigger);
      fixture.detectChanges();
      await settle();

      await userEvent.tab({ shift: true });
      fixture.detectChanges();

      expect(host.openA()).toBe(false);
      expect(trigger).toHaveFocus();
    });

    it('Dado o foco indo para fora do painel e do gatilho, então fecha (rede de segurança)', async () => {
      const { host, fixture } = await setup();
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      screen.getByTestId('trigger-b').focus();

      expect(host.openA()).toBe(false);
    });

    it('Dado o painel destruído aberto, então remove os ouvintes do documento e não deixa o portal', async () => {
      const { fixture } = await setup();
      const remove = vi.spyOn(document, 'removeEventListener');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      fixture.destroy();

      const removed = remove.mock.calls.map(([type]) => type);
      expect(removed).toEqual(expect.arrayContaining(['keydown', 'pointerdown', 'focusin']));
      expect(document.querySelector(':scope > app-overlay-panel')).toBeNull();
      remove.mockRestore();
    });

    it('Dado o painel aberto, então a página de fundo não fica inert nem travada (não é modal)', async () => {
      const { fixture } = await setup();
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      expect(screen.getByTestId('page').closest('[inert]')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('folha (modal)', () => {
    it('Dado aberta, então é role dialog modal, trava a rolagem e deixa o fundo inert', async () => {
      const { fixture } = await setup('sheet');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      const panel = screen.getByTestId('a-panel');
      expect(panel).toHaveAttribute('aria-modal', 'true');
      expect(panel).toHaveAttribute('data-side', 'sheet');
      expect(document.body.style.overflow).toBe('hidden');
      expect(screen.getByTestId('page').closest('[inert]')).not.toBeNull();
      expect(screen.getByTestId('a-close')).toBeInTheDocument();
    });

    it('Dado fechada, então destrava a rolagem e remove o inert', async () => {
      const { host, fixture } = await setup('sheet');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      host.openA.set(false);
      fixture.detectChanges();
      await settle();

      expect(document.body.style.overflow).toBe('');
      expect(screen.getByTestId('page').closest('[inert]')).toBeNull();
    });

    it('Dado o Tab no último focável, então o foco circula para o primeiro (trap)', async () => {
      const { fixture } = await setup('sheet');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();
      screen.getByTestId('a-last').focus();

      await userEvent.tab();

      expect(screen.getByTestId('a-close')).toHaveFocus();
    });

    it('Dado o Shift+Tab no primeiro focável, então o foco vai para o último', async () => {
      const { fixture } = await setup('sheet');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();
      screen.getByTestId('a-close').focus();

      await userEvent.tab({ shift: true });

      expect(screen.getByTestId('a-last')).toHaveFocus();
    });

    it('Dado o botão Fechar, o Esc ou o toque no fundo escurecido, então pede o fechamento', async () => {
      const { host, fixture } = await setup('sheet');
      const reopen = async () => {
        host.openA.set(true);
        fixture.detectChanges();
        await settle();
      };
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      await userEvent.click(screen.getByTestId('a-close'));
      expect(host.openA()).toBe(false);
      fixture.detectChanges();

      await reopen();
      await userEvent.keyboard('{Escape}');
      expect(host.openA()).toBe(false);
      fixture.detectChanges();

      await reopen();
      await userEvent.click(screen.getByTestId('a-backdrop'));
      expect(host.openA()).toBe(false);
    });

    it('Dado a troca de popover para folha com o painel aberto (rotação), então passa a travar a rolagem', async () => {
      const { host, fixture } = await setup('popover');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();
      expect(document.body.style.overflow).toBe('');

      host.mode.set('sheet');
      fixture.detectChanges();
      await settle();

      expect(document.body.style.overflow).toBe('hidden');
      expect(screen.getByTestId('page').closest('[inert]')).not.toBeNull();

      host.mode.set('popover');
      fixture.detectChanges();
      await settle();
      expect(document.body.style.overflow).toBe('');
      expect(screen.getByTestId('page').closest('[inert]')).toBeNull();
    });

    it('Dado a folha destruída aberta, então a rolagem é destravada', async () => {
      const { fixture } = await setup('sheet');
      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();

      fixture.destroy();

      expect(document.body.style.overflow).toBe('');
      expect(document.querySelector('[inert]')).toBeNull();
    });

    it('Dado o visualViewport menor que a janela (teclado virtual), então a folha sobe e limita a altura', async () => {
      const original = window.visualViewport;
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: {
          height: 400,
          width: 375,
          offsetTop: 0,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        },
      });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
      const { fixture } = await setup('sheet');

      await userEvent.click(screen.getByTestId('trigger-a'));
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();

      const panel = screen.getByTestId('a-panel');
      expect(panel.style.bottom).toBe('400px');
      expect(panel.style.maxHeight).toContain('384px');

      Object.defineProperty(window, 'visualViewport', { configurable: true, value: original });
    });
  });
});
