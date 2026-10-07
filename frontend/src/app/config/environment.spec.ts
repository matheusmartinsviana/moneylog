import { environment as real } from '~/app/config/environment';
import { environment as mock } from '~/app/config/environment.mock';

describe('ambientes (S-67)', () => {
  it('Dado o ambiente real (build de produção e start:local), então apiMocks é false', () => {
    expect(real.apiMocks).toBe(false);
  });

  it('Dado o ambiente mock (start:mock e production-mock via fileReplacements), então apiMocks é true', () => {
    expect(mock.apiMocks).toBe(true);
  });
});
