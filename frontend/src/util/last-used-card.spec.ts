import { readLastUsedCard, writeLastUsedCard } from '~/util/last-used-card';

describe('último cartão usado', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('Dado nada gravado, então devolve null', () => {
    expect(readLastUsedCard()).toBeNull();
  });

  it('Dado um cartão gravado, então a lê de volta', () => {
    writeLastUsedCard('card-1');

    expect(readLastUsedCard()).toBe('card-1');
  });

  it('Dado o storage bloqueado, então não quebra: lê null e a escrita é ignorada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => writeLastUsedCard('card-1')).not.toThrow();
    expect(readLastUsedCard()).toBeNull();
  });
});
