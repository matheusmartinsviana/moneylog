import { motionEnabled } from '~/app/common/motion/motion';

const PENDING = 'm-pending';
const ENTER = 'm-enter';
/** Elementos que já tiveram a sua entrada: dados que chegam depois só animam o que é novo. */
const seen = new WeakSet<Element>();

/**
 * Motor de entrada: esconde o elemento (`m-pending`, só opacidade/transform, sem mexer no layout) e o revela
 * quando ele entra na viewport, uma única vez, em cascata (`--m-i` × `--motion-stagger`, teto no CSS).
 * Sem `IntersectionObserver` (ou com movimento desligado) não faz nada: o conteúdo nunca fica escondido.
 */
export class Revealer {
  private observer: IntersectionObserver | null = null;
  private offset = 0;

  constructor(private readonly doc: Document) {}

  /** Índice inicial da cascata (ex.: o conteúdo entra depois do cabeçalho). */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  observe(element: Element): void {
    if (!(element instanceof HTMLElement) || seen.has(element)) return;
    seen.add(element);
    if (element.dataset['motionSkip'] !== undefined) return;
    if (!motionEnabled(this.doc) || typeof IntersectionObserver === 'undefined') return;
    // `display: contents` não tem caixa: nunca interceptaria a viewport e ficaria escondido.
    if (this.doc.defaultView?.getComputedStyle(element).display === 'contents') return;
    element.classList.add(PENDING);
    this.getObserver().observe(element);
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private getObserver(): IntersectionObserver {
    this.observer ??= new IntersectionObserver(
      (entries) => {
        let index = this.offset;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.observer?.unobserve(entry.target);
          this.play(entry.target as HTMLElement, index++);
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    return this.observer;
  }

  private play(element: HTMLElement, index: number): void {
    element.style.setProperty('--m-i', String(index));
    element.classList.replace(PENDING, ENTER);
    if (!element.classList.contains(ENTER)) element.classList.add(ENTER);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener('animationend', onEnd);
      element.classList.remove(ENTER);
      element.style.removeProperty('--m-i');
    };
    const onEnd = (event: Event) => {
      if (event.target === element) finish();
    };
    element.addEventListener('animationend', onEnd);
    // Rede de segurança (animação cancelada pelo CSS): atraso máximo + duração + folga.
    setTimeout(finish, 600 + 420 + 200);
  }
}
