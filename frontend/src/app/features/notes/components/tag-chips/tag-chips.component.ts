import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ChipComponent } from '~/app/common/components/chip/chip.component';
import type { TagCount } from '~/modules/notes/core/types/note';

/** Filtro por tag (alternável, uma por vez) com a contagem do backend. `role="group"` com rótulo. */
@Component({
  selector: 'app-tag-chips',
  imports: [ChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tags().length > 0) {
      <div class="tags" role="group" [attr.aria-label]="label()" data-cy="tag-chips">
        @for (item of tags(); track item.tag) {
          <app-chip
            [label]="'#' + item.tag"
            [count]="item.count"
            [pressed]="selected() === item.tag"
            [cy]="'tag-chip-' + item.tag"
            (toggled)="selectTag.emit($event ? item.tag : null)"
          />
        }
      </div>
    }
  `,
  styles: `
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class TagChipsComponent {
  readonly tags = input.required<readonly TagCount[]>();
  readonly selected = input<string | null>(null);
  readonly label = input.required<string>();

  readonly selectTag = output<string | null>();
}
