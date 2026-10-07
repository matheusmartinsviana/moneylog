/**
 * Modo do vidro (DS 03), gravado em `<html data-glass>` uma vez na inicialização:
 * - `refract`: Chromium desktop (ponteiro fino, tela larga): `backdrop-filter: url()` real só em lentes pequenas;
 * - `blur`: demais navegadores com `backdrop-filter` (Firefox, Chromium em celular): desfoque CSS barato;
 * - ausente (sólido): Safari/WebKit (blur permanente em elementos fixos/sticky é um precipício de compositor,
 *   o dono usa iPhone/PWA) e navegadores sem `backdrop-filter`. `prefers-reduced-transparency` também força sólido (CSS).
 */
export type GlassMode = 'refract' | 'blur' | 'solid';

export function supportsBackdropFilter(doc: Document): boolean {
  const el = doc.createElement('div');
  el.style.cssText = 'backdrop-filter: blur(1px)';
  return Boolean(el.style.backdropFilter);
}

/** `backdrop-filter: url()` só existe no Chromium; o teste é a própria atribuição (como no portfólio). */
export function supportsBackdropFilterUrl(doc: Document): boolean {
  const el = doc.createElement('div');
  el.style.cssText = 'backdrop-filter: url(#t)';
  return el.style.backdropFilter === 'url(#t)' || el.style.backdropFilter === 'url("#t")';
}

export function isSafari(userAgent: string): boolean {
  return /safari/i.test(userAgent) && !/chrome|chromium|crios|fxios|edg|android/i.test(userAgent);
}

export function detectGlassMode(doc: Document): GlassMode {
  const win = doc.defaultView;
  if (!win || isSafari(win.navigator.userAgent) || !supportsBackdropFilter(doc)) return 'solid';
  const compact = win.matchMedia?.('(max-width: 767px), (pointer: coarse)').matches ?? true;
  return !compact && supportsBackdropFilterUrl(doc) ? 'refract' : 'blur';
}

/** Marca o `<html>`; sólido = sem atributo (o CSS base já é sólido). */
export function applyGlassMode(doc: Document): GlassMode {
  const mode = detectGlassMode(doc);
  if (mode === 'solid') doc.documentElement.removeAttribute('data-glass');
  else doc.documentElement.setAttribute('data-glass', mode);
  return mode;
}
