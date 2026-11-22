import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Shared content card — `section[abaCard]`.
 *
 * Card contract (T18 Slice G, 2026-11-21; owner ruling 2026-11-21 15:07 EET):
 *
 * - Use `abaCard` for a generic content card: one surface for the whole
 *   section (padding `var(--aba-space-5, 20px)`, background
 *   `var(--aba-color-surface, #fff)`, 1px `var(--aba-color-border, #e5eaf1)`
 *   border, `var(--aba-radius-card, 16px)` radius, `var(--aba-shadow-card)`
 *   shadow; 16px padding at <=600px, 12px at <=380px). `.narrow` caps the
 *   card at 650px and centers it (deferred placeholders, dialogs).
 * - Use `aba-metric-card` ONLY for Overview KPI cards. It is a separate
 *   component with its own surface (min-height 125px, top gradient bar) and
 *   it stays for KPIs; do not restyle it through this contract.
 * - Use a bespoke card ONLY when its surface genuinely differs from
 *   `abaCard` (different radius/padding/shadow, or a list-row/empty-state
 *   purpose): `.metric` (compact label+value card, content-sized),
 *   `.invoice-card` / `.invoice-summary-card` (invoice list rows),
 *   `.inventory-ledger__card`, `.customer-profile` (own radius/shadow),
 *   platform-admin `.panel` / `.metric-card`, employee `.employee-panel`,
 *   credit-note `.panel`, `.empty-panel` (dashed empty state). None of
 *   these was migrated in Slice G because no surface is identical to
 *   `abaCard`; forcing one would change the card's appearance.
 * - Legacy hook: most `abaCard` hosts in the shell also carry
 *   `class="panel"`. That class is NOT the surface — `abaCard` already
 *   draws it — it only adjusts padding via the `section.panel` rules in
 *   `design-system.css` (`clamp(16px, 2vw, 24px)` instead of 20px). Keep
 *   it on existing hosts; do not add it to new hosts, and do not remove
 *   it from an existing host without a visual check.
 * - Cards are NON-interactive by default. Only the four Overview KPI
 *   cards are tappable (`role="button"`, Enter/Space handlers, asserted
 *   by `home-dashboard.spec.ts`). Making any other card tappable is a
 *   separate owner decision — Slice G deliberately did not do it.
 * - New or rewritten card surfaces use the `--aiba-*` tokens (plan §1).
 *   The `--aba-*` tokens inside `abaCard` / `aba-metric-card` stay
 *   untouched; the two token sets are not renamed or merged here.
 */
@Component({
  selector: 'section[abaCard]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styles: [`
    :host{display:block;min-width:0;width:100%;padding:var(--aba-space-5, 20px);margin-block-start:var(--aba-space-1, 4px);background:var(--aba-color-surface, #fff);border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 16px);box-shadow:var(--aba-shadow-card, 0 1px 2px rgb(15 23 42 / 4%));overflow-wrap:anywhere}
    :host(.narrow){max-width:650px;margin:var(--aba-space-10, 40px) auto}
    @media(max-width:600px){
      :host{padding:var(--aba-space-4, 16px)}
      :host(.narrow){margin-block:24px}
    }
    @media(max-width:380px){
      :host{padding:var(--aba-space-3, 12px)}
      :host(.narrow){margin-block:16px}
    }
  `],
})
export class AbaCardComponent {}
