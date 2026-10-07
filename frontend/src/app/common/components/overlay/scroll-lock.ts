/**
 * Trava a rolagem do fundo enquanto um painel modal está aberto (contagem para aninhar).
 * `overflow: hidden` no `body` não segura o iOS Safari < 16 nem o "rubber band": o corpo vira
 * `position: fixed` na posição atual da rolagem (que é restaurada ao soltar), e `overflow-y: scroll`
 * mantém a largura da barra de rolagem no desktop (sem salto de layout).
 */
let locks = 0;
let saved: { overflow: string; position: string; top: string; width: string; scrollY: number } = {
  overflow: '',
  position: '',
  top: '',
  width: '',
  scrollY: 0,
};

export function lockScroll(body: HTMLElement): () => void {
  const view = body.ownerDocument.defaultView;
  if (locks === 0) {
    const scrollY = view?.scrollY ?? 0;
    saved = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      scrollY,
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) {
      body.style.overflow = saved.overflow;
      body.style.position = saved.position;
      body.style.top = saved.top;
      body.style.width = saved.width;
      view?.scrollTo?.(0, saved.scrollY);
    }
  };
}
