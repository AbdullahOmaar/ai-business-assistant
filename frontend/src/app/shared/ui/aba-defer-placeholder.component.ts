import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbaCardComponent } from './aba-card.component';
import { AbaSkeletonComponent } from './aba-skeleton.component';

/**
 * Shared placeholder for the shell's deferred workspace sections
 * (3A-371, G4 fixed loading). One compiled template instead of sixteen
 * copies of the same skeleton panel: while a lazy section loads, the
 * placeholder reserves its space with skeleton list-rows inside a status
 * region that keeps the loading description for assistive tech.
 */
@Component({
  selector: 'aba-defer-placeholder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbaCardComponent, AbaSkeletonComponent],
  template: `
    <section abaCard class="panel narrow">
      <div class="defer-skeleton" role="status">
        <span class="sr-only">{{ description() }}</span>
        <aba-skeleton variant="list-row" />
        <aba-skeleton variant="list-row" />
        <aba-skeleton variant="list-row" />
      </div>
    </section>
  `,
  styles: [`.defer-skeleton{display:grid;gap:10px}`],
})
export class AbaDeferPlaceholderComponent {
  /** Loading description announced to assistive tech (already translated by the caller). */
  readonly description = input.required<string>();
}
