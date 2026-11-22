import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared inline SVG icons (T18 Slice D).
 *
 * One component for the icons the new shared pieces need — search, filter,
 * clear, add, export, import — so the later slices (search field, filter bar)
 * reuse the same marks instead of copying SVG markup into every template.
 *
 * No icon library, no icon font, no new dependency, no external asset: each
 * icon is a small inline SVG (24x24 viewBox, `currentColor` stroke, 1.8
 * stroke width), drawn with the app's own palette via `currentColor`.
 *
 * The icons are decorative: every SVG is `aria-hidden="true"`. The parent
 * (button, input label, link) owns the accessible name, as the invoice search
 * already does with its `aria-label` on the input.
 *
 * The `search` icon is byte-identical to the invoice search magnifier that
 * was the only inline SVG in the app before this slice
 * (`app.component.ts`, invoice search): circle 10.8/10.8 r 6.8 plus the
 * `m16 16 5 5` handle. The invoice search now uses this component instead
 * of its own copy of that markup.
 *
 * The Unicode glyphs in the module catalog and the nav (`⌂ ♧ ◇ ▤ …`) are
 * intentionally NOT replaced here — they are not broken, and replacing them
 * with SVG icons is a later slice, not this one.
 *
 * T18 Slice G (2026-11-21) added `check`, `close`, `chevron-left` and
 * `chevron-right` for the redrawn customer-statement card (owner ruling
 * 2026-11-21 15:07 EET: every card action has an icon): `check` marks the
 * apply action, `close` is a circled X so it reads as "close the card"
 * rather than duplicating the plain-X `clear` icon, and the chevrons mark
 * the statement pager (a parent flips them in RTL — see the
 * `.statement-pager__chevron` rule in `design-system.css`).
 *
 * T18 Slice U02 (2026-11-21) added `document`, `statement` and `edit` for
 * the customer directory / profile card actions (owner ruling 2026-11-21
 * 15:07 EET: every card action has an icon): `document` marks the invoices
 * action, `statement` is a small table/ledger for the statement action, and
 * `edit` is a pencil for the edit action. Same contract as Slice G: the
 * union, the SVG count and the distinct-path checks cover all thirteen.
 *
 * Sizing: the host defaults to 20x20px; a parent sizes it with its own CSS
 * (for example the invoice search positions it with `.invoice-search-icon`,
 * 18x18). The SVG fills the host.
 */
export type AbaIconName = 'search' | 'filter' | 'clear' | 'add' | 'export' | 'import' | 'check' | 'close' | 'chevron-left' | 'chevron-right' | 'document' | 'statement' | 'edit';

@Component({
  selector: 'aba-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (name() === 'search') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
    } @else if (name() === 'filter') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7.5v5l-4 2.5v-7.5L4 5z"/></svg>
    } @else if (name() === 'clear') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    } @else if (name() === 'add') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
    } @else if (name() === 'export') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
    } @else if (name() === 'check') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
    } @else if (name() === 'close') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>
    } @else if (name() === 'chevron-left') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg>
    } @else if (name() === 'chevron-right') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6l6 6-6 6"/></svg>
    } @else if (name() === 'document') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>
    } @else if (name() === 'statement') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4z"/><path d="M4 10h16M9.5 10v9M14.5 10v9"/></svg>
    } @else if (name() === 'edit') {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z"/><path d="M4 16l4 4"/></svg>
    } @else {
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
    }
  `,
  styles: [`
    :host{display:inline-grid;place-items:center;flex:0 0 auto;width:20px;height:20px}
    svg{display:block;width:100%;height:100%}
  `],
})
export class AbaIconComponent {
  /** Which icon to render. Defaults to the search magnifier. */
  readonly name = input<AbaIconName>('search');
}
