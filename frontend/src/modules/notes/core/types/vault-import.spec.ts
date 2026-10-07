import { importFileProblem } from '~/modules/notes/core/types/vault-import';

describe('importFileProblem', () => {
  it.each([
    [{ name: 'vault.zip', size: 1000 }, null],
    [{ name: 'VAULT.ZIP', size: 1000 }, null],
    [{ name: 'vault.rar', size: 1000 }, 'NOT_ZIP'],
    [{ name: 'vault.zip.exe', size: 1000 }, 'NOT_ZIP'],
    [{ name: 'vault.zip', size: 0 }, 'EMPTY'],
    [{ name: 'vault.zip', size: 20 * 1024 * 1024 }, null],
    [{ name: 'vault.zip', size: 20 * 1024 * 1024 + 1 }, 'TOO_LARGE'],
  ])('Dado %j, então o problema é %s', (file, expected) => {
    expect(importFileProblem(file)).toBe(expected);
  });
});
