import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

/** Um arquivo em memória pronto para o usuário guardar. */
export interface DownloadableFile {
  readonly blob: Blob;
  readonly filename: string;
}

/** Um arquivo com `ObjectURL` já criado: vive até `release()` (ao fechar o estado "Arquivo pronto" ou sair da tela). */
export interface PreparedFile {
  readonly file: DownloadableFile;
  readonly url: string;
  /** Revoga o `ObjectURL`. Pode ser chamado mais de uma vez. */
  release(): void;
}

/**
 * Entrega ao usuário um arquivo que já está em memória (`Blob`). O arquivo veio de uma requisição autenticada
 * (Bearer pelo interceptor); aqui só nasce um `blob:` (sem token na URL).
 *
 * **Regra de plataforma (iPhone/PWA instalado, FE-S-168):** `save()` e `share()` só podem ser chamados de dentro
 * de um **gesto do usuário** (um clique em "Salvar"/"Compartilhar"), nunca depois de uma chamada assíncrona sem
 * gesto: no iOS, clicar um `<a download>` fora de um gesto pode navegar a janela para o `blob:` e, em PWA
 * standalone, o usuário fica sem barra de volta. O link nunca usa `target` e a página nunca navega para o `blob:`.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly document = inject(DOCUMENT);

  /** Cria o `ObjectURL` do arquivo (sem clicar nada). */
  prepare(file: DownloadableFile): PreparedFile {
    const url = URL.createObjectURL(file.blob);
    let released = false;
    return {
      file,
      url,
      release: () => {
        if (released) return;
        released = true;
        URL.revokeObjectURL(url);
      },
    };
  }

  /** Salva o arquivo (link `blob:` com `download`, clicado). Chamar só dentro de um clique do usuário. */
  save(prepared: PreparedFile): void {
    const link = this.document.createElement('a');
    link.href = prepared.url;
    link.download = prepared.file.filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    this.document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /** O navegador sabe compartilhar este arquivo (Web Share Level 2)? */
  canShare(file: DownloadableFile): boolean {
    const nav = this.document.defaultView?.navigator;
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
      return nav.canShare({ files: [this.toFile(file)] });
    } catch {
      return false;
    }
  }

  /** Abre a folha de compartilhamento do sistema. `false` se o usuário cancelou ou falhou. */
  async share(file: DownloadableFile): Promise<boolean> {
    const nav = this.document.defaultView?.navigator;
    if (!nav || typeof nav.share !== 'function') return false;
    try {
      await nav.share({ files: [this.toFile(file)], title: file.filename });
      return true;
    } catch {
      return false;
    }
  }

  private toFile(file: DownloadableFile): File {
    return new File([file.blob], file.filename, { type: file.blob.type });
  }
}
