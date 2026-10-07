import {
  displacementFilterUri,
  refractionCacheSize,
  refractionFilter,
} from '~/app/common/components/liquid-glass/liquid-glass-filter';
import { detectGlassMode, isSafari } from '~/app/common/services/glass-support';

const options = {
  width: 40,
  height: 40,
  radius: 14,
  depth: 5,
  strength: 46,
  chromaticAberration: 4,
};

describe('Vidro líquido', () => {
  it('Dado um tamanho, quando pede o filtro duas vezes, então o resultado vem do cache', () => {
    const before = refractionCacheSize();
    const first = refractionFilter(options);
    const second = refractionFilter({ ...options });
    expect(second).toBe(first);
    expect(refractionCacheSize()).toBe(before + 1);
    expect(first).toContain('url(');
  });

  it('Dado o filtro, então é um data URI de SVG com o id displace e os 3 canais', () => {
    const uri = displacementFilterUri(options);
    expect(uri.endsWith('#displace')).toBe(true);
    const svg = decodeURIComponent(uri.slice(0, uri.indexOf('#displace')));
    expect(svg.match(/feDisplacementMap/g)).toHaveLength(3);
  });

  it('Dado o Safari, então é detectado e o Chrome não', () => {
    expect(
      isSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
    expect(isSafari('Mozilla/5.0 Chrome/120.0 Safari/537.36')).toBe(false);
  });

  it('Dado o Safari, então o modo é sólido; sem matchMedia (jsdom), desfoque barato', () => {
    const safari = {
      defaultView: {
        navigator: {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        },
      },
    } as unknown as Document;
    expect(detectGlassMode(safari)).toBe('solid');
    expect(detectGlassMode(document)).toBe('blur');
  });
});
