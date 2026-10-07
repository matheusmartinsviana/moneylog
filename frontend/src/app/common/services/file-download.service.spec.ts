import { TestBed } from '@angular/core/testing';

import { FileDownloadService } from '~/app/common/services/file-download.service';

const file = () => ({
  blob: new Blob(['﻿data;tipo\r\n'], { type: 'text/csv' }),
  filename: 'moneylog-transactions.csv',
});

describe('FileDownloadService', () => {
  let service: FileDownloadService;
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      const url = `blob:test/${created.length}`;
      created.push(url);
      expect(blob).toBeInstanceOf(Blob);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
    service = TestBed.inject(FileDownloadService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('Dado um arquivo, então prepare só cria o ObjectURL: nada é clicado nem navegado', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const prepared = service.prepare(file());

    expect(prepared.url).toBe('blob:test/0');
    expect(click).not.toHaveBeenCalled();
    expect(revoked).toEqual([]);
  });

  it('Dado o arquivo preparado, então save clica um link blob: com o nome, sem token e sem target', () => {
    const clicks: { href: string; download: string; target: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download, target: this.target });
    });
    const prepared = service.prepare(file());

    service.save(prepared);

    expect(clicks).toEqual([
      { href: 'blob:test/0', download: 'moneylog-transactions.csv', target: '' },
    ]);
    expect(clicks[0]?.href).not.toMatch(/token|access|bearer/i);
    expect(document.querySelector('a[download]')).toBeNull();
    // Salvar não revoga: o usuário ainda pode salvar de novo ou compartilhar.
    expect(revoked).toEqual([]);
  });

  it('Dado release, então revoga o ObjectURL uma única vez', () => {
    const prepared = service.prepare(file());

    prepared.release();
    prepared.release();

    expect(revoked).toEqual(['blob:test/0']);
  });

  it('Dado navigator.share com arquivos, então canShare e share funcionam; cancelar devolve false', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });

    expect(service.canShare(file())).toBe(true);
    expect(await service.share(file())).toBe(true);
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'moneylog-transactions.csv' }),
    );

    share.mockRejectedValue(new DOMException('cancelado', 'AbortError'));
    expect(await service.share(file())).toBe(false);
  });

  it('Dado um navegador sem share, então canShare é false', () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });

    expect(service.canShare(file())).toBe(false);
  });

  it('Dado canShare que lança, então é false', () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: () => {
        throw new Error('x');
      },
      configurable: true,
    });

    expect(service.canShare(file())).toBe(false);
  });
});
