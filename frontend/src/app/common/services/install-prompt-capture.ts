let captured: Event | null = null;
let listening = false;

/** Guarda o `beforeinstallprompt` assim que o shell abre, antes de o serviço do PWA carregar. */
export function captureInstallPrompt(win: Window | null): void {
  if (listening || !win) return;
  listening = true;
  win.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    captured = event;
  });
}

/** Entrega (uma vez) o evento guardado. */
export function takeCapturedInstallPrompt(): Event | null {
  const event = captured;
  captured = null;
  return event;
}
