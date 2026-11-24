import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { AbaIconComponent } from './aba-icon.component';

/**
 * Shared filter bar (T18 Slice F).
 *
 * One container for the filter affordance that used to be five bespoke
 * `.list-tools` divs in the shell plus the invoices and inventory variants:
 * an icon-only filter button (no text, no huge visual button), the current
 * filter shown as text, and a clear action. The search field itself is
 * projected content — the bar composes the shared `aba-search-field`
 * (Slice E), it does not replace it — so each caller keeps its own
 * `[(ngModel)]` binding, aria-label/placeholder keys and filter function
 * from `record-filters.ts`. The bar does no filtering; it only owns the
 * affordance, the summary and the clear.
 *
 * Variants (slots, not a forced single shape):
 * - `search` (default): the 5 shell `.list-tools` instances — search field
 *   only, no extra controls.
 * - `chips`: invoices — the `.invoice-status-chips` group is projected via
 *   the `[filterExtras]` slot and wraps onto its own row below the search,
 *   as it does today. The customer select, export and density controls stay
 *   outside the bar, inside `.invoice-controls`.
 * - `selects`: inventory ledger — the `.inventory-ledger__filters` 3-select
 *   grid is projected via `[filterExtras]` and sits beside the filter
 *   button, wrapping below it on narrow screens.
 *
 * The filter button toggles the details row (current filter + clear). The
 * row auto-reveals when a filter becomes active (an effect sets `expanded`
 * on the false → true transition of `hasActiveFilter`); the user can still
 * collapse it, and the effect does not re-open it until the filter changes
 * from inactive to active again. Clearing via the bar collapses the row.
 * The row only renders when there is something to show (an active filter,
 * a summary, or an empty-filter label), so the toggle never opens an empty
 * row. `aria-expanded` reports whether the row is actually visible.
 *
 * Icons come from the shared `aba-icon` component (Slice D): `filter` for
 * the toggle, `clear` for the clear action. Both buttons are icon-only
 * with an accessible name from the caller (already translated) and a
 * 44px comfortable touch area (`--aiba-control-md`).
 *
 * Fold mode (3A-696, G1 closure): with `foldExtras` on, the projected
 * `[filterExtras]` controls themselves fold behind the filter button —
 * the button toggles the extras panel (`panelOpen`) instead of the
 * details row, and `aria-expanded`/`aria-controls` point at the panel.
 * The details row keeps its own behaviour (auto-reveal on an active
 * filter), so the current filter state stays visible while the controls
 * are folded — the register's G1 pattern (filters fold behind an icon
 * button; the current state stays visible). Off by default: every
 * existing caller keeps the exact pre-3A-696 behaviour.
 *
 * New pieces use the `--aiba-*` tokens (plan section 1 decision); the
 * `--aba-*` / `--aiba-*` token sets are not renamed or merged here.
 */
export type AbaFilterBarVariant = 'search' | 'chips' | 'selects';

let filterBarInstanceCount = 0;

@Component({
  selector: 'aba-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbaIconComponent],
  template: `
    <div class="aba-filter-bar" [class.aba-filter-bar--chips]="variant() === 'chips'" [class.aba-filter-bar--selects]="variant() === 'selects'">
      <div class="aba-filter-bar__row">
        <button type="button" class="aba-filter-bar__filter" [class.aba-filter-bar__filter--active]="hasActiveFilter()"
          [attr.aria-label]="filterLabel()" [attr.aria-expanded]="toggleExpanded()" [attr.aria-controls]="toggleControlsId()" (click)="toggle()">
          <aba-icon name="filter" />
        </button>
        @if (variant() !== 'selects') {
          <div class="aba-filter-bar__main"><ng-content /></div>
        }
        @if (variant() !== 'search' && extrasVisible()) {
          <div class="aba-filter-bar__extras" [id]="extrasId"><ng-content select="[filterExtras]" /></div>
        }
      </div>
      @if (detailsVisible()) {
        <div class="aba-filter-bar__details" [id]="detailsId" aria-live="polite">
          @if (filterSummary()) {
            <span class="aba-filter-bar__summary">{{ filterSummary() }}</span>
          } @else if (emptyFilterLabel()) {
            <span class="aba-filter-bar__summary aba-filter-bar__summary--empty">{{ emptyFilterLabel() }}</span>
          }
          @if (hasActiveFilter()) {
            <button type="button" class="aba-filter-bar__clear" [attr.aria-label]="clearLabel()" (click)="onClear()">
              <aba-icon name="clear" />
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-filter-bar{display:grid;gap:var(--aiba-space-2,8px);min-width:0}
    .aba-filter-bar__row{display:flex;align-items:center;flex-wrap:wrap;gap:var(--aiba-space-2,8px);min-width:0}
    .aba-filter-bar__filter{flex:0 0 auto;display:grid;place-items:center;width:var(--aiba-control-md,44px);min-width:var(--aiba-control-md,44px);min-height:var(--aiba-control-md,44px);padding:0;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:var(--aiba-radius-control,11px);background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);cursor:pointer}
    .aba-filter-bar__filter:hover:not(:disabled){border-color:var(--aiba-brand,#0f766e)}
    .aba-filter-bar__filter:focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    .aba-filter-bar__filter--active{border-color:var(--aiba-brand,#0f766e);background:var(--aiba-brand-soft,#ecfdf5);color:var(--aiba-brand,#0f766e)}
    .aba-filter-bar__main{flex:1 1 auto;min-width:0}
    .aba-filter-bar__extras{flex:1 1 auto;min-width:0}
    .aba-filter-bar--chips .aba-filter-bar__extras{flex:1 1 100%}
    .aba-filter-bar--selects .aba-filter-bar__extras{flex:1 1 260px}
    .aba-filter-bar__details{display:flex;align-items:center;gap:var(--aiba-space-2,8px);min-width:0}
    .aba-filter-bar__summary{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;color:var(--aiba-muted,#5f6e83);font-size:var(--aiba-text-sm,13px);line-height:var(--aiba-leading-relaxed,1.5)}
    .aba-filter-bar__clear{flex:0 0 auto;display:grid;place-items:center;width:var(--aiba-control-md,44px);min-width:var(--aiba-control-md,44px);min-height:var(--aiba-control-md,44px);padding:0;border:0;border-radius:var(--aiba-radius-control,11px);background:transparent;color:var(--aiba-muted,#5f6e83);cursor:pointer}
    .aba-filter-bar__clear:hover{color:var(--aiba-ink,#172033);background:var(--aiba-surface-raised,#fbfdff)}
    .aba-filter-bar__clear:focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:-3px}
  `],
})
export class AbaFilterBarComponent {
  /** Which filter shape this bar hosts: search only, status chips, or selects. */
  readonly variant = input<AbaFilterBarVariant>('search');

  /** Accessible name for the icon-only filter button (already translated by the caller). */
  readonly filterLabel = input.required<string>();

  /** Accessible name for the icon-only clear button (already translated by the caller). */
  readonly clearLabel = input.required<string>();

  /** Text describing the current filter, shown in the details row. Empty means no summary. */
  readonly filterSummary = input<string>('');

  /** Text shown in the details row when expanded with no active filter and no summary. */
  readonly emptyFilterLabel = input<string>('');

  /** Whether any filter is currently active: drives the button's active state, the auto-reveal and the clear button. */
  readonly hasActiveFilter = input(false);

  /**
   * 3A-696: fold mode — the `[filterExtras]` controls render only while
   * the panel is open, and the filter button toggles the panel instead
   * of the details row. The details row (current-filter summary + clear)
   * is unaffected, so the active state stays visible while folded.
   */
  readonly foldExtras = input(false);

  /** Emitted when the clear action is used; the caller resets its own filter state. */
  readonly clear = output<void>();

  protected readonly expanded = signal(false);
  protected readonly panelOpen = signal(false);
  protected readonly detailsId = `aba-filter-bar-details-${++filterBarInstanceCount}`;
  protected readonly extrasId = `aba-filter-bar-extras-${++filterBarInstanceCount}`;

  /** The details row is visible only when expanded and there is something to show. */
  protected readonly detailsVisible = computed(
    () => this.expanded() && (this.hasActiveFilter() || this.filterSummary() !== '' || this.emptyFilterLabel() !== ''),
  );

  /** The extras panel renders unless fold mode is on and the panel is closed. */
  protected readonly extrasVisible = computed(() => !this.foldExtras() || this.panelOpen());

  /** What the filter button reports as expanded: the panel in fold mode, the details row otherwise. */
  protected readonly toggleExpanded = computed(() => (this.foldExtras() ? this.panelOpen() : this.detailsVisible()));

  /** The element the filter button controls: the extras panel in fold mode, the details row otherwise. */
  protected readonly toggleControlsId = computed(() => (this.foldExtras() ? this.extrasId : this.detailsId));

  constructor() {
    // Auto-reveal the current filter (and its clear action) when a filter
    // becomes active. The write is untracked — the same pattern the
    // inventory ledger uses — so collapsing the row by hand is respected
    // until the filter changes from inactive to active again.
    effect(() => {
      const active = this.hasActiveFilter();
      untracked(() => {
        if (active) this.expanded.set(true);
      });
    });
  }

  /** Filter button: fold mode toggles the extras panel; otherwise show or hide the current-filter details row. */
  protected toggle(): void {
    if (this.foldExtras()) {
      this.panelOpen.update((value) => !value);
      return;
    }
    this.expanded.update((value) => !value);
  }

  /** Clear button: collapse the details row and let the caller reset its filters. */
  protected onClear(): void {
    this.expanded.set(false);
    this.clear.emit();
  }
}
