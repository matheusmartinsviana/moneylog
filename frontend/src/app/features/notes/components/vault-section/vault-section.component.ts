import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { interval, take } from 'rxjs';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { FilePickerComponent } from '~/app/common/components/forms/file-picker/file-picker.component';
import { RadioGroupComponent } from '~/app/common/components/forms/radio-group/radio-group.component';
import { valueSignal } from '~/app/common/forms/control-signal';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import {
  FileDownloadService,
  type PreparedFile,
} from '~/app/common/services/file-download.service';
import { ToastService } from '~/app/common/services/toast.service';
import { ImportReportComponent } from '~/app/features/notes/components/import-report/import-report.component';
import { VaultFacade } from '~/modules/notes/core/facades/vault.facade';
import {
  type DownloadedFile,
  type ImportConflictMode,
  MAX_IMPORT_BYTES,
} from '~/modules/notes/core/types/note';
import type { Problem } from '~/util/api/problem';

/**
 * Exportar e importar o vault (T119), em Notas e em Configurações → Seus dados. Honesto sobre o
 * armazenamento: as notas moram no servidor e o zip é a cópia em Markdown (S-157). **Exportar**: o zip vem de
 * uma requisição autenticada e fica em "Arquivo pronto" com Salvar e Compartilhar, que rodam no clique do
 * usuário (FE-S-168, iPhone/PWA). **Importar**: o `FilePicker` próprio (o único `<input type="file">` do app,
 * escondido dentro dele) aceita `.zip` até 20 MB; o usuário escolhe o que fazer com um caminho que já existe
 * (`SKIP` ou `RENAME`: o backend **nunca sobrescreve** uma nota) e confirma num diálogo que diz isso com
 * clareza antes de enviar; depois vê o relatório (criadas, puladas, pendentes, ignoradas, renomeadas, avisos).
 * Tudo ou nada: falha (`VAULT_IMPORT_INVALID`, `VAULT_IMPORT_TOO_LARGE`, 413, 429) não muda nada. Escopo de
 * componente.
 */
@Component({
  selector: 'app-vault-section',
  imports: [
    ReactiveFormsModule,
    ConfirmDialogComponent,
    FilePickerComponent,
    RadioGroupComponent,
    ImportReportComponent,
  ],
  providers: [VaultFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="vault"
      [attr.aria-labelledby]="showTitle() ? 'vault-title' : null"
      data-cy="vault-section"
    >
      @if (showTitle()) {
        <h2 class="vault__title" id="vault-title">{{ t().notes.vault.title }}</h2>
      }
      <p class="vault__text" data-cy="vault-storage">{{ t().notes.vault.description }}</p>

      <div
        class="vault__block"
        aria-labelledby="vault-export-title"
        role="group"
        data-cy="vault-export"
      >
        <h3 class="vault__subtitle" id="vault-export-title">{{ t().notes.vault.export.title }}</h3>
        <p class="vault__text">{{ t().notes.vault.export.description }}</p>
        <div>
          <button
            type="button"
            class="button"
            data-cy="vault-export-action"
            [disabled]="vault.exporting()"
            [attr.aria-busy]="vault.exporting() || null"
            (click)="vault.exportVault()"
          >
            {{ vault.exporting() ? t().notes.vault.export.running : t().notes.vault.export.action }}
          </button>
        </div>
        @if (vault.exporting()) {
          <div class="vault__progress" role="status" data-cy="vault-export-progress">
            <span class="vault__bar" aria-hidden="true"></span>
            <span>{{ t().notes.vault.export.running }}</span>
          </div>
        }
        @if (exportMessage(); as message) {
          <p class="banner" role="alert" data-cy="vault-export-error">
            {{ message }}
            <button
              type="button"
              class="button"
              data-cy="vault-export-retry"
              [disabled]="exportWait() > 0"
              (click)="retryExport()"
            >
              {{ exportRetryLabel() }}
            </button>
          </p>
        }
        @if (ready(); as file) {
          <div class="vault__ready" data-cy="vault-export-ready">
            <p class="vault__text" role="status">{{ readyHint() }}</p>
            <div class="vault__actions">
              <button type="button" class="button" data-cy="vault-export-save" (click)="save()">
                {{ t().exports.ready.save }}
              </button>
              @if (canShare()) {
                <button type="button" class="button" data-cy="vault-export-share" (click)="share()">
                  {{ t().exports.share }}
                </button>
              }
              <button
                type="button"
                class="button"
                data-cy="vault-export-dismiss"
                (click)="dismiss()"
              >
                {{ t().exports.ready.dismiss }}
              </button>
            </div>
          </div>
        }
      </div>

      <div
        class="vault__block"
        aria-labelledby="vault-import-title"
        role="group"
        data-cy="vault-import"
      >
        <h3 class="vault__subtitle" id="vault-import-title">{{ t().notes.vault.import.title }}</h3>
        <p class="vault__text">{{ t().notes.vault.import.description }}</p>

        @if (vault.importStatus().status === 'done') {
          @if (report(); as r) {
            <app-import-report [report]="r" (done)="finish()" />
          }
        } @else {
          <form class="vault__form" [formGroup]="form" (ngSubmit)="askImport()" novalidate>
            <app-file-picker
              formControlName="file"
              fieldId="vault-file"
              accept=".zip"
              [maxBytes]="maxBytes"
              [label]="t().notes.vault.import.fileLabel"
              [hint]="t().notes.vault.import.fileHint"
            />
            <app-radio-group
              formControlName="mode"
              fieldId="vault-mode"
              [label]="t().notes.vault.import.modeLabel"
              [options]="modeOptions()"
            />
            <div>
              <button
                type="submit"
                class="button button--primary"
                data-cy="vault-import-action"
                [disabled]="vault.importing()"
                [attr.aria-disabled]="chosenFile() === null || null"
                [attr.aria-busy]="vault.importing() || null"
              >
                {{
                  vault.importing() ? t().notes.vault.import.running : t().notes.vault.import.action
                }}
              </button>
            </div>
          </form>
          @if (vault.importing()) {
            <div class="vault__progress" role="status" data-cy="vault-import-progress">
              <span class="vault__bar" aria-hidden="true"></span>
              <span>{{ t().notes.vault.import.running }}</span>
            </div>
          }
          @if (importMessage(); as message) {
            <p class="banner" role="alert" data-cy="vault-import-error">
              {{ message }}
              @if (vault.importUncertain()) {
                <span data-cy="vault-import-uncertain">{{ t().notes.vault.import.uncertain }}</span>
              }
              @if (canRetryImport()) {
                <button
                  type="button"
                  class="button"
                  data-cy="vault-import-retry"
                  [disabled]="importWait() > 0"
                  (click)="retryImport()"
                >
                  {{ importRetryLabel() }}
                </button>
              }
              <button
                type="button"
                class="button"
                data-cy="vault-import-reset"
                (click)="resetImport()"
              >
                {{ t().notes.vault.import.reset }}
              </button>
            </p>
          }
        }
      </div>

      <app-confirm-dialog
        [open]="confirming()"
        [heading]="t().notes.vault.import.confirm.title"
        [description]="confirmText()"
        [confirmLabel]="t().notes.vault.import.confirm.confirm"
        [busy]="vault.importing()"
        (confirmed)="doImport()"
        (cancelled)="confirming.set(false)"
      />
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .vault,
    .vault__block,
    .vault__form,
    .vault__ready {
      display: grid;
      gap: var(--space-3);
    }

    .vault__block {
      padding-top: var(--space-4);
      border-top: var(--border-width) solid var(--color-border);
    }

    .vault__title,
    .vault__subtitle {
      margin: 0;
    }

    .vault__title {
      font-size: var(--text-lg);
    }

    .vault__subtitle {
      font-size: var(--text-md);
    }

    .vault__text {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .vault__form {
      max-width: 32rem;
    }

    .vault__ready {
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
    }

    .vault__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .vault__progress {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .vault__bar {
      width: 6rem;
      height: 4px;
      border-radius: var(--radius-pill);
      background-color: var(--color-border);
    }
  `,
})
export class VaultSectionComponent {
  private readonly toast = inject(ToastService);
  private readonly download = inject(FileDownloadService);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly vault = inject(VaultFacade);
  protected readonly maxBytes = MAX_IMPORT_BYTES;

  /** Mostra o título da seção (a tela que hospeda pode já ter o seu). */
  readonly showTitle = input(true);
  /** A importação terminou (a tela que hospeda recarrega a lista). */
  readonly imported = output<void>();

  protected readonly form = new FormGroup({
    file: new FormControl<File | null>(null),
    mode: new FormControl<string | null>('SKIP'),
  });
  protected readonly chosenFile = valueSignal(this.form.controls.file);
  private readonly modeValue = valueSignal(this.form.controls.mode);
  protected readonly confirming = signal(false);

  protected readonly modeOptions = computed<readonly ChoiceOption[]>(() => {
    const copy = this.t().notes.vault.import;
    return [
      { value: 'SKIP', label: copy.skip, hint: copy.skipHint },
      { value: 'RENAME', label: copy.rename, hint: copy.renameHint },
    ];
  });
  protected readonly confirmText = computed(() => {
    const copy = this.t().notes.vault.import.confirm;
    return this.modeValue() === 'RENAME' ? copy.rename : copy.skip;
  });
  protected readonly report = computed(() => {
    const state = this.vault.importStatus();
    return state.status === 'done' ? state.report : null;
  });

  // Exportar: "Arquivo pronto" (FE-S-168).
  protected readonly ready = signal<{
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

  // Falhas e "tentar de novo" com o `Retry-After` do 429.
  protected readonly exportMessage = computed(() => this.message(this.vault.exportProblem()));
  protected readonly importProblem = computed<Problem | null>(() => {
    const state = this.vault.importStatus();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly importMessage = computed(() => this.message(this.importProblem()));
  /** O mesmo zip falharia igual (inválido ou grande demais): só escolher outro arquivo ajuda. */
  protected readonly canRetryImport = computed(() => {
    const code = this.importProblem()?.code;
    return (
      code !== 'VAULT_IMPORT_INVALID' &&
      code !== 'VAULT_IMPORT_TOO_LARGE' &&
      // `RENAME` sem resposta: repetir pode duplicar o vault (F5); o usuário confere antes.
      !this.vault.importUncertain()
    );
  });
  protected readonly exportWait = signal(0);
  protected readonly importWait = signal(0);
  protected readonly exportRetryLabel = computed(() =>
    this.retryLabel(this.exportWait(), this.t().notes.vault.export.retry),
  );
  protected readonly importRetryLabel = computed(() =>
    this.retryLabel(this.importWait(), this.t().notes.vault.import.retry),
  );
  private readonly countdowns: { unsubscribe(): void }[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.countdowns.forEach((c) => c.unsubscribe());
      this.discard();
    });
    effect(() => {
      const seconds = this.vault.exportProblem()?.retryAfterSeconds ?? 0;
      untracked(() => this.count(this.exportWait, seconds, 0));
    });
    effect(() => {
      const seconds = this.importProblem()?.retryAfterSeconds ?? 0;
      untracked(() => this.count(this.importWait, seconds, 1));
    });
    this.vault.file$.pipe(takeUntilDestroyed()).subscribe((file) => {
      // Só guarda o arquivo: quem salva ou compartilha é o usuário, num clique.
      this.discard();
      this.ready.set({ file, prepared: this.download.prepare(file) });
    });
    this.vault.imported$.pipe(takeUntilDestroyed()).subscribe(() => this.imported.emit());
  }

  private message(problem: Problem | null): string | null {
    return problem ? problemMessage(problem, this.t().errors) : null;
  }

  private retryLabel(wait: number, label: string): string {
    return wait > 0
      ? interpolate(this.t().notes.vault.export.retryIn, { seconds: String(wait) })
      : label;
  }

  private count(target: ReturnType<typeof signal<number>>, seconds: number, slot: number): void {
    this.countdowns[slot]?.unsubscribe();
    target.set(Math.max(0, seconds));
    if (seconds <= 0) return;
    this.countdowns[slot] = interval(1000)
      .pipe(take(seconds))
      .subscribe(() => target.update((left) => Math.max(0, left - 1)));
  }

  protected retryExport(): void {
    if (this.exportWait() === 0) this.vault.exportVault();
  }

  protected save(): void {
    const ready = this.ready();
    if (!ready) return;
    this.download.save(ready.prepared);
    this.toast.show(interpolate(this.t().notes.vault.export.saved, { name: ready.file.filename }));
  }

  protected async share(): Promise<void> {
    const ready = this.ready();
    if (!ready) return;
    if (await this.download.share(ready.file)) {
      this.toast.show(interpolate(this.t().exports.shared, { name: ready.file.filename }));
    }
  }

  protected dismiss(): void {
    this.discard();
  }

  private discard(): void {
    this.ready()?.prepared.release();
    this.ready.set(null);
  }

  /** "Importar": só abre a confirmação (nada é enviado antes de o usuário confirmar). */
  protected askImport(): void {
    if (this.chosenFile() === null || this.vault.importing()) return;
    this.confirming.set(true);
  }

  protected doImport(): void {
    const file = this.chosenFile();
    if (file === null) return;
    this.confirming.set(false);
    const mode = (this.modeValue() ?? 'SKIP') as ImportConflictMode;
    this.vault.importVault(file, mode);
  }

  protected retryImport(): void {
    if (this.importWait() === 0) this.vault.retryImport();
  }

  protected resetImport(): void {
    this.vault.resetImport();
    this.form.controls.file.setValue(null);
  }

  /** "Concluir": volta ao formulário vazio. */
  protected finish(): void {
    this.resetImport();
  }
}
