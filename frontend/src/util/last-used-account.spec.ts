import { readLastUsedAccount, writeLastUsedAccount } from '~/util/last-used-account';

describe('última conta usada', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('Dado nada gravado, então devolve null', () => {
    expect(readLastUsedAccount()).toBeNull();
  });

  it('Dado uma conta gravada, então a lê de volta', () => {
    writeLastUsedAccount('acc-1');

    expect(readLastUsedAccount()).toBe('acc-1');
  });

  it('Dado o storage bloqueado, então não quebra: lê null e a escrita é ignorada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => writeLastUsedAccount('acc-1')).not.toThrow();
    expect(readLastUsedAccount()).toBeNull();
  });
});
