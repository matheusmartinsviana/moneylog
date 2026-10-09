import { demoId } from '~/demo/demo-world';

/**
 * Fotos do modo demonstração: **imagens sintéticas geradas por código** (SVG com degradê e texto). Nenhum
 * arquivo binário é versionado e nenhuma foto real entra no demo. Só existe no build `demo`.
 */
export const DEMO_PHOTO_WIDTH = 640;
export const DEMO_PHOTO_HEIGHT = 360;

/** Pares de cores do degradê (nomes CSS; um par por foto, em rodízio). */
const PALETTES: readonly (readonly [string, string])[] = [
  ['slateblue', 'lavender'],
  ['teal', 'paleturquoise'],
  ['peru', 'bisque'],
];

/** `goalId` termina em 12 dígitos; o id da foto é derivado dele, estável entre leituras. */
export function demoPhotoId(goalId: string, index: number): string {
  return demoId('photo', Number(goalId.slice(-12)) * 10 + index + 1);
}

/** Bytes (SVG) da foto sintética: o mesmo desenho nas duas variantes, só muda a escala. */
export function demoPhotoBlob(photoId: string, name: string): Blob {
  const index = Number(photoId.slice(-1)) - 1;
  const [from, to] = PALETTES[Math.max(index, 0) % PALETTES.length]!;
  const label = `${name} · ${index + 1}`.replace(/[<>&"]/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DEMO_PHOTO_WIDTH} ${DEMO_PHOTO_HEIGHT}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<text x="50%" y="52%" text-anchor="middle" font-family="sans-serif" font-size="34" fill="white">${label}</text>` +
    `</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}
