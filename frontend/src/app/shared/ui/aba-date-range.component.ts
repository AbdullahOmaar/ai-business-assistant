import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AbaIconComponent } from './aba-icon.component';

/**
 * Shared date-range component (T18 Slice J).
 *
 * One wrapper for the four from/to pairs that used to be bespoke native
 * date inputs with no shared wrapper and no preset buttons:
 * - Reports P&L Start/End (`app.component.ts`, `type="date"`, required,
 *   inside the `profitLossPeriod === 'custom'` branch of the P&L form);
 * - Customers statement From/To (`app.component.ts`, `type="date"`, plain
 *   `[(ngModel)]`, with its own Apply/Clear buttons);
 * - Taxes Start/End (`app.component.ts`, `type="date"`, submitted by the
 *   tax form);
 * - Platform-admin audit From/To (`platform-admin.component.ts`,
 *   `type="datetime-local"`, submitted by the audit filter form).
 *
 * The two inputs are PROJECTED content (`<ng-content />`), not owned by
 * this component — the same pattern as `aba-filter-bar` (Slice F). Each
 * caller keeps its own `<label><input … [(ngModel)]>` markup verbatim:
 * its `name`, label/translation key, `type`, `required`, validation
 * (`#…Control="ngModel"`, `aria-invalid`, `aria-describedby`,
 * `.field-error`) and its submit/apply behaviour. The component therefore
 * cannot break the source-text specs that pin those names
 * (`customer-statement-date-filters.spec.ts`,
 * `app.component-template-safety.spec.ts`, `customer-statement-layout.spec.ts`).
 * Template-driven form registration still works for projected inputs:
 * they are created in the caller's view, so `#…Control="ngModel"` still
 * registers with the caller's `ngForm`.
 *
 * What the component owns: the shared layout (the two fields side by side,
 * wrapping on narrow screens, with the clear action aligned to the inputs'
 * baseline) and the icon-only clear action. The 44px height / 11px radius
 * of the date inputs comes from the global field rules (Slice I,
 * `design-system.css`); the layout rules that must reach the projected
 * labels live in `design-system.css` next to the other shared filter rules
 * (component styles cannot reach projected content under emulated
 * encapsulation, and this repo uses no `::ng-deep`).
 *
 * Clear: shown only when the caller opts in (`showClear`) and there is a
 * value to clear (`hasValue`). The caller wires `(clear)` to its own reset
 * — P&L, Taxes and Audit clear just their two fields; the statement pair
 * does NOT use the component clear because it already has its own Clear
 * button (`clearCustomerStatementFilters()`, which also reloads page 0),
 * and duplicating it would change the Slice G statement-card layout.
 * Apply/submit stay entirely with the callers: P&L and Taxes keep their
 * form submit buttons, Audit keeps its form submit, the statement keeps
 * its Apply button. The component adds no submit behaviour.
 *
 * NO PRESETS: the preset choice is an owner decision (plan §7.4) and none
 * has been made, so the component ships with just the two inputs + clear
 * and no preset chips. Presets are added later, when decided — do not
 * invent preset choices here.
 *
 * The ageing `agingAsOf` stays a single date input and is NOT converted
 * to a range (plan §2i): it is not wrapped by this component anywhere.
 * No API change: the API already accepts `from_date`/`to_date`.
 *
 * Icons come from the shared `aba-icon` component (Slice D): `clear` for
 * the clear action. The clear button is icon-only with an accessible name
 * from the caller (already translated) and a 44px comfortable touch area
 * (`--aiba-control-md`).
 *
 * New pieces use the `--aiba-*` tokens (plan section 1 decision); the
 * `--aba-*` / `--aiba-*` token sets are not renamed or merged here.
 */
@Component({
  selector: 'aba-date-range',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbaIconComponent],
  template: `
    <div class="aba-date-range">
      <div class="aba-date-range__fields"><ng-content /></div>
      @if (showClear() && hasValue()) {
        <button type="button" class="aba-date-range__clear" [attr.aria-label]="clearLabel()" (click)="onClear()">
          <aba-icon name="clear" />
        </button>
      }
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-date-range{display:flex;align-items:flex-end;gap:var(--aiba-space-2,8px);min-width:0}
    .aba-date-range__fields{flex:1 1 auto;display:flex;flex-wrap:wrap;gap:var(--aiba-space-2,8px);min-width:0}
    .aba-date-range__clear{flex:0 0 auto;display:grid;place-items:center;width:var(--aiba-control-md,44px);min-width:var(--aiba-control-md,44px);min-height:var(--aiba-control-md,44px);padding:0;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:var(--aiba-radius-control,11px);background:var(--aiba-surface,#fff);color:var(--aiba-muted,#5f6e83);cursor:pointer}
    .aba-date-range__clear:hover{color:var(--aiba-ink,#172033);background:var(--aiba-surface-raised,#fbfdff)}
    .aba-date-range__clear:focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    /* T18 Slice U02 (2026-11-21): at 195/220px the two date inputs sit
     * side by side at ~70px each, so the value is clipped to a single
     * letter ("mr" / "n"). Below 380px the fields stack full-width, so a
     * date value is fully visible. At 390px the side-by-side inputs already
     * fit, so they are untouched. */
    @media(max-width:380px){.aba-date-range__fields{flex-direction:column}}
  `],
})
export class AbaDateRangeComponent {
  /** Accessible name for the icon-only clear button (already translated by the caller). Empty when the button is not used. */
  readonly clearLabel = input<string>('');

  /** Whether the clear action is offered at all. False by default: the statement pair keeps its own Clear button. */
  readonly showClear = input(false);

  /** Whether either date has a value: drives whether the clear button renders. */
  readonly hasValue = input(false);

  /** Emitted when the clear action is used; the caller resets its own two date fields. */
  readonly clear = output<void>();

  /** Clear button: let the caller reset its own date fields. */
  protected onClear(): void {
    this.clear.emit();
  }
}
