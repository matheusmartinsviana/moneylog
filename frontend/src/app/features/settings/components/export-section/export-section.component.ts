import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { interval, take } from 'rxjs';

import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import {
  FileDownloadService,
  type PreparedFile,
} from '~/app/common/services/file-download.service';
import { ToastService } from '~/app/common/services/toast.service';
import { ExportsFacade } from '~/modules/exports/core/facades/exports.facade';
import {
  type DownloadedFile,
  type ExportKind,
  hasCsvHeader,
} from '~/modules/exports/core/types/export';

/**
 * Exportar (Configurações → Seus dados, T104): CSV de movimentações (com período opcional) e backup JSON.
 * O arquivo vem de uma requisição autenticada (nunca um link com token) e a tela o entrega ao navegador por
 * um download controlado. Com um download em curso os dois botões ficam desabilitados e há um indicador de
 * progresso (sem clique duplo). Erro de rede oferece "tentar de novo". O backup avisa que o arquivo contém
 * todos os dados.
 *
 * Depois de baixar o conteúdo a tela mostra **"Arquivo pronto"** com **Salvar** e, onde `navigator.canShare`
 * aceita arquivos, **Compartilhar**: as duas ações rodam num clique do usuário (no iPhone/PWA instalado, clicar
 * um `<a download>` sem gesto pode navegar a janela para o `blob:`, FE-S-168). Nada é salvo sozinho, e o toast
 * só aparece quando a ação final acontece. O `ObjectURL` é revogado ao fechar o estado, ao chegar outro
 * arquivo e ao sair da tela.
 */
@Component({
  selector: 'app-export-section',
  imports: [ReactiveFormsModule, SectionContainerComponent, DatePickerComponent],
  providers: [ExportsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './export-section.component.html',
  styleUrl: './export-section.component.css',
})
export class ExportSectionComponent {
  private readonly toast = inject(ToastService);
  private readonly download = inject(FileDownloadService);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly exports = inject(ExportsFacade);

  protected readonly range = new FormGroup({
    from: new FormControl<string | null>(null),
    to: new FormControl<string | null>(null),
  });
  protected readonly rangeInvalid = signal(false);

  /** O arquivo baixado que espera a ação do usuário ("Arquivo pronto"). */
  protected readonly ready = signal<{
    readonly kind: ExportKind;
    readonly file: DownloadedFile;
    readonly prepared: PreparedFile;
  } | null>(null);
  protected readonly canShare = computed(() => {
    const ready = this.ready();
    return ready !== null && this.download.canShare(ready.file);
  });
  protected readonly readyHint = computed(() => {
    const ready = this.ready();
    return ready ? interpolate(this.t().exports.ready.hint, { name: ready.file.filename }) : '';
  });
  /** O idioma do app não tem cabeçalho de CSV próprio no backend: o CSV sai em português (M1). */
  protected readonly csvHeaderFallback = computed(() => !hasCsvHeader(this.i18n.language()));

  protected readonly failureMessage = computed(() => {
    const failure = this.exports.failure();
    return failure ? problemMessage(failure.problem, this.t().errors) : null;
  });

  /**
   * Segundos que faltam para liberar "tentar de novo" quando o backend limitou as tentativas (429 com
   * `Retry-After`, FE-S-175). `0` = liberado. O relógio só conta; quem manda é o backend.
   */
  protected readonly waitSeconds = signal(0);
  /** 422 `EXPORT_TOO_LARGE`: repetir o mesmo pedido falharia igual; a tela pede um período menor. */
  protected readonly canRetry = computed(
    () => this.exports.failure()?.problem.code !== 'EXPORT_TOO_LARGE',
  );
  protected readonly retryLabel = computed(() =>
    this.waitSeconds() > 0
      ? interpolate(this.t().exports.retryIn, { seconds: String(this.waitSeconds()) })
      : this.t().exports.retry,
  );
  private countdown: { unsubscribe(): void } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.countdown?.unsubscribe();
      this.discard();
    });
    effect(() => {
      const seconds = this.exports.failure()?.problem.retryAfterSeconds ?? 0;
      untracked(() => this.startCountdown(seconds));
    });
    this.exports.file$.pipe(takeUntilDestroyed()).subscribe(({ kind, file }) => {
      // Só guarda o arquivo: quem salva ou compartilha é o usuário, num clique.
      this.discard();
      this.ready.set({ kind, file, prepared: this.download.prepare(file) });
    });
  }

  protected exportCsv(): void {
    const { from, to } = this.range.getRawValue();
    // As duas são datas ISO (`YYYY-MM-DD`): comparar o texto compara a ordem do calendário.
    const invalid = from !== null && to !== null && from > to;
    this.rangeInvalid.set(invalid);
    if (invalid) return;
    this.exports.exportCsv({ from, to, language: this.i18n.language() });
  }

  protected exportBackup(): void {
    this.exports.exportBackup();
  }

  /** "Salvar": roda dentro do clique do usuário. */
  protected save(): void {
    const ready = this.ready();
    if (!ready) return;
    this.download.save(ready.prepared);
    this.toast.show(interpolate(this.t().exports.saved, { name: ready.file.filename }));
  }

  /** "Compartilhar": roda dentro do clique; cancelar não mostra "pronto". */
  protected async share(): Promise<void> {
    const ready = this.ready();
    if (!ready) return;
    if (await this.download.share(ready.file)) {
      this.toast.show(interpolate(this.t().exports.shared, { name: ready.file.filename }));
    }
  }

  protected retry(): void {
    if (this.waitSeconds() === 0) this.exports.retry();
  }

  private startCountdown(seconds: number): void {
    this.countdown?.unsubscribe();
    this.countdown = null;
    this.waitSeconds.set(Math.max(0, seconds));
    if (seconds <= 0) return;
    this.countdown = interval(1000)
      .pipe(take(seconds))
      .subscribe(() => this.waitSeconds.update((left) => Math.max(0, left - 1)));
  }

  protected dismiss(): void {
    this.discard();
  }

  /** Solta o arquivo da memória e revoga o `ObjectURL`. */
  private discard(): void {
    this.ready()?.prepared.release();
    this.ready.set(null);
  }
}
