import { TestBed } from '@angular/core/testing';

import { takeCapturedInstallPrompt } from '~/app/common/services/install-prompt-capture';
import { INSTALL_DISMISSED_KEY, PwaService } from '~/app/common/services/pwa.service';

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

describe('PwaService', () => {
  const service = () => TestBed.inject(PwaService);

  // `install-prompt-capture` guarda o `beforeinstallprompt` em estado de módulo (e o listener fica no `window`
  // se outro spec do mesmo worker abriu o shell): sem esvaziar, o evento de um teste vaza para o serviço do próximo.
  beforeEach(() => takeCapturedInstallPrompt());

  afterEach(() => {
    takeCapturedInstallPrompt();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('Dado a conexão cai e volta, então online acompanha os eventos do navegador', () => {
    expect(service().online()).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(service().online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(service().online()).toBe(true);
  });

  it('Dado o navegador oferece instalar, quando o usuário aceita, então chama o prompt e some o convite', async () => {
    const { event, prompt } = promptEvent('accepted');
    service();

    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(service().installMode()).toBe('prompt');

    await service().install();

    expect(prompt).toHaveBeenCalledOnce();
    expect(service().installMode()).toBeNull();
  });

  it('Dado o usuário recusa o prompt, então o convite é dispensado e lembrado', async () => {
    service();
    window.dispatchEvent(promptEvent('dismissed').event);

    await service().install();

    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');
  });

  it('Dado convite dispensado antes, então não convida de novo', () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    service();

    window.dispatchEvent(promptEvent('accepted').event);

    expect(service().installMode()).toBeNull();
  });

  it('Dado o armazenamento bloqueado, quando dispensa, então não lança e vale na sessão', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    service();
    window.dispatchEvent(promptEvent('accepted').event);

    expect(() => service().dismissInstall()).not.toThrow();
    expect(service().installMode()).toBeNull();
  });

  it('Dado Safari no iPhone fora do modo app, então mostra a instrução manual', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1',
    );

    expect(service().installMode()).toBe('ios');
  });

  it('Dado Chrome no iPhone, então não mostra a instrução do Safari', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120 Mobile Safari/604.1',
    );

    expect(service().installMode()).toBeNull();
  });
});
