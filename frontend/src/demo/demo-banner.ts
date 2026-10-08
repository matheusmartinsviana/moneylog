/** Texto da faixa por idioma (só existe no build `demo`; o idioma vem do `<html lang>` que a UI mantém). */
const TEXT: Record<string, string> = {
  pt: 'Modo demonstração: as alterações não são salvas',
  en: 'Demo mode: changes are not saved',
  es: 'Modo demostración: los cambios no se guardan',
};

/** Mostra a faixa de demonstração no topo da página, sem sobrepor o cabeçalho. */
export function mountDemoBanner(): void {
  const doc = document;
  const banner = doc.createElement('div');
  banner.setAttribute('data-cy', 'demo-banner');
  banner.setAttribute('role', 'status');
  const apply = () => {
    const lang = (doc.documentElement.lang || 'pt').slice(0, 2);
    banner.textContent = TEXT[lang] ?? TEXT['pt']!;
  };
  apply();
  new MutationObserver(apply).observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  // Faixa no fluxo da página (primeira coisa do `body`): nunca fica por cima do cabeçalho do workspace.
  Object.assign(banner.style, {
    padding: '3px 12px',
    background: 'var(--color-text)',
    color: 'var(--color-surface)',
    font: '500 12px/1.5 system-ui, sans-serif',
    textAlign: 'center',
  });
  doc.body.prepend(banner);
}
