import { motionEnabled } from '~/app/common/motion/motion';

export type GhostKind = 'dialog' | 'sheet' | 'side' | 'popover';

/**
 * Saída animada de um overlay cujo conteúdo já foi removido do DOM: anima um clone (inerte, sem `id`/`data-cy`)
 * e o descarta. O original some na hora (foco, `Esc` e testes não esperam a animação).
 * Só `transform` e `opacity`, via Web Animations; sem efeito com movimento desligado.
 */
export function playGhostExit(
  backdrop: HTMLElement,
  panel: HTMLElement | null,
  kind: GhostKind,
): void {
  const doc = backdrop.ownerDocument;
  if (!motionEnabled(doc) || typeof backdrop.animate !== 'function' || !backdrop.isConnected)
    return;
  const ghost = backdrop.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  for (const node of [
    ghost,
    ...Array.from(ghost.querySelectorAll<HTMLElement>('[id],[data-cy]')),
  ]) {
    node.removeAttribute('id');
    node.removeAttribute('data-cy');
  }
  ghost.classList.add('m-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost
    .querySelectorAll('[autofocus],[data-autofocus]')
    .forEach((n) => n.removeAttribute('data-autofocus'));
  doc.body.appendChild(ghost);

  const ease = 'cubic-bezier(0.4, 0, 1, 1)';
  const duration = kind === 'popover' ? 110 : 180;
  const target = panel
    ? ghost.querySelector<HTMLElement>(
        '[role="dialog"],[role="alertdialog"],[role="listbox"],.panel',
      )
    : null;
  const frames: Record<GhostKind, Keyframe> = {
    dialog: { opacity: 0, transform: 'scale(0.97) translateY(6px)' },
    sheet: { opacity: 0, transform: 'translateY(24px)' },
    side: { opacity: 0, transform: 'translateX(24px)' },
    popover: { opacity: 0, transform: 'translateY(-4px)' },
  };
  target?.animate([{ opacity: 1, transform: 'none' }, frames[kind]], {
    duration,
    easing: ease,
    fill: 'forwards',
  });
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration,
    easing: ease,
    fill: 'forwards',
  });
  const remove = () => ghost.remove();
  fade.onfinish = remove;
  fade.oncancel = remove;
  setTimeout(remove, duration + 300);
}
