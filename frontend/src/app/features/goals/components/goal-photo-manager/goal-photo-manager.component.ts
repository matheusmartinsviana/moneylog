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

import { FilesButtonComponent } from '~/app/common/components/forms/files-button/files-button.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { GoalPhotoComponent } from '~/app/features/goals/components/goal-photo/goal-photo.component';
import type {
  PhotoMove,
  PhotoQueueItem,
  PhotoRejection,
} from '~/modules/goals/core/facades/goal-photos.facade';
import {
  GOAL_PHOTO_ACCEPT,
  GOAL_PHOTO_MAX_BYTES,
  type GoalPhoto,
} from '~/modules/goals/core/types/goal';
import { formatBytes } from '~/util/format-bytes';

/** Pedido de mover uma foto (da meta ou, antes de a meta existir, da fila local). */
export interface PhotoMoveRequest {
  readonly id: string;
  readonly delta: -1 | 1;
}

/**
 * Seção "Fotos do sonho" do formulário da meta (presentational, ADR-018): grade de miniaturas com capa,
 * reordenar por **botões** (esquerda/direita, por teclado; o botão no fim da fila fica `aria-disabled` e
 * continua focável, então o foco não se perde ao mover), definir capa, remover (a confirmação é do pai),
 * contador "n de 8" e a fila de envio (progresso, cancelar, tentar de novo). Antes de a meta existir, as
 * fotos escolhidas são só uma fila local na ordem final. Mensagens de falha vêm traduzidas pelo `code`.
 */
@Component({
  selector: 'app-goal-photo-manager',
  imports: [FilesButtonComponent, GoalPhotoComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-photo-manager.component.html',
  styleUrl: './goal-photo-manager.component.css',
})
export class GoalPhotoManagerComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly accept = GOAL_PHOTO_ACCEPT;

  /** Meta já existe (edição); `null` na criação (fila local). */
  readonly goalId = input<string | null>(null);
  readonly goalName = input('');
  readonly photos = input<readonly GoalPhoto[]>([]);
  readonly queue = input<readonly PhotoQueueItem[]>([]);
  readonly coverPhotoId = input<string | null>(null);
  readonly count = input.required<number>();
  readonly max = input(8);
  /** Meta arquivada ou em salvamento: sem ações. */
  readonly locked = input(false);
  /** Falha da última escrita (já traduzida). */
  readonly problem = input<string | null>(null);
  readonly rejections = input<readonly PhotoRejection[]>([]);
  readonly lastMove = input<PhotoMove | null>(null);

  readonly filesPicked = output<File[]>();
  readonly moved = output<PhotoMoveRequest>();
  readonly coverRequested = output<string>();
  readonly removeRequested = output<string>();
  readonly queuedMoved = output<PhotoMoveRequest>();
  readonly queuedCoverRequested = output<string>();
  readonly cancelled = output<string>();
  readonly retried = output<string>();
  readonly retriedAll = output<void>();

  protected readonly editing = computed(() => this.goalId() !== null);
  protected readonly full = computed(() => this.count() >= this.max());
  protected readonly counter = computed(() =>
    interpolate(this.t().goals.photos.counter, {
      count: String(this.count()),
      max: String(this.max()),
    }),
  );
  protected readonly fullText = computed(() =>
    interpolate(this.t().goals.photos.full, { max: String(this.max()) }),
  );
  protected readonly failedCount = computed(
    () => this.queue().filter((item) => item.status === 'failed').length,
  );
  protected readonly total = computed(() => this.photos().length);
  /** Capa efetiva: a que o servidor disse ou, até ele responder, a primeira. */
  protected readonly cover = computed(() => this.coverPhotoId() ?? this.photos()[0]?.id ?? null);

  protected readonly rejectionTexts = computed(() => {
    const copy = this.t().goals.photos;
    const size = formatBytes(GOAL_PHOTO_MAX_BYTES, HTML_LANG[this.i18n.language()]);
    return this.rejections().map((rejection) =>
      interpolate(copy.rejected[rejection.reason], {
        name: rejection.name,
        max: rejection.reason === 'size' ? size : String(this.max()),
      }),
    );
  });
  protected readonly announcement = computed(() => {
    const move = this.lastMove();
    return move
      ? interpolate(this.t().goals.photos.moved, {
          position: String(move.position),
          total: String(move.total),
        })
      : '';
  });

  /** Miniaturas das fotos ainda na fila (arquivo local; revogadas ao sair da fila). */
  private readonly previews = new Map<string, string>();
  protected readonly previewUrls = signal<ReadonlyMap<string, string>>(new Map());

  constructor() {
    effect(() => {
      const ids = new Set(this.queue().map((item) => item.localId));
      const files = new Map(this.queue().map((item) => [item.localId, item.file]));
      untracked(() => {
        if (typeof URL.createObjectURL !== 'function') return;
        for (const [id, url] of this.previews) {
          if (!ids.has(id)) {
            URL.revokeObjectURL(url);
            this.previews.delete(id);
          }
        }
        for (const [id, file] of files) {
          if (!this.previews.has(id)) this.previews.set(id, URL.createObjectURL(file));
        }
        this.previewUrls.set(new Map(this.previews));
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (typeof URL.revokeObjectURL !== 'function') return;
      for (const url of this.previews.values()) URL.revokeObjectURL(url);
      this.previews.clear();
    });
  }

  protected alt(index: number): string {
    return interpolate(this.t().goals.photos.alt, {
      n: String(index + 1),
      total: String(this.total()),
      name: this.goalName(),
    });
  }

  protected queuedAlt(index: number, item: PhotoQueueItem): string {
    return interpolate(this.t().goals.photos.queuedAlt, {
      n: String(index + 1),
      file: item.file.name,
    });
  }

  protected statusText(item: PhotoQueueItem): string {
    const copy = this.t().goals.photos;
    if (item.status === 'uploading')
      return interpolate(copy.uploading, { percent: String(item.percent) });
    if (item.status === 'failed') {
      return item.problem ? problemMessage(item.problem, this.t().errors) : copy.failed;
    }
    return copy.waiting;
  }

  protected move(photo: GoalPhoto, index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (this.locked() || target < 0 || target >= this.total()) return;
    this.moved.emit({ id: photo.id, delta });
  }

  protected moveQueued(item: PhotoQueueItem, index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (this.locked() || target < 0 || target >= this.queue().length) return;
    this.queuedMoved.emit({ id: item.localId, delta });
  }

  protected makeCover(photo: GoalPhoto): void {
    if (!this.locked() && photo.id !== this.cover()) this.coverRequested.emit(photo.id);
  }

  protected makeQueuedCover(item: PhotoQueueItem, index: number): void {
    if (!this.locked() && index > 0) this.queuedCoverRequested.emit(item.localId);
  }
}
