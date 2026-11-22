import { ChangeDetectionStrategy, Component, computed, ElementRef, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AbaIconComponent } from './aba-icon.component';

/**
 * Shared search field (T18 Slice E).
 *
 * One component for the 7 shell search inputs (overview module directory,
 * notifications, suppliers, recurring, invoices, payments, expenses): an
 * input (type="search") with the shared search magnifier, a clear button
 * (shown only while there is a value) that clears the value and returns
 * focus to the input, and an accessible label.
 *
 * Binding: the component is a ControlValueAccessor, so the shell keeps its
 * existing `[(ngModel)]="…Search"` bindings and filter functions unchanged —
 * the component only provides the field, it does not filter. The existing
 * `record-filters.ts` functions still do the filtering, and the shell's
 * `name` / aria-label / placeholder keys are passed through untouched.
 *
 * The workspace searches are NOT forced into this component: customer-
 * workspace keeps its submit button + server-side search, purchasing-
 * workspace keeps its signal filter, and platform-admin keeps its
 * `type="text"` search fields. They differ in behaviour, not just markup.
 *
 * Icons come from the shared `aba-icon` component (Slice D): `search` for
 * the magnifier (the same geometry as the invoice magnifier it was
 * extracted from), `clear` for the clear button. The native WebKit search
 * decorations/cancel button are hidden so the field shows exactly one
 * clear affordance — this component's clear button.
 *
 * New pieces use the `--aiba-*` tokens (plan section 1 decision); the
 * `--aba-*` / `--aiba-*` token sets are not renamed or merged here.
 * Input padding (48px start / 42px end) keeps the winning values from the
 * invoice search it replaces (`app.component.css`: the 48px/42px override
 * over the 42px/38px base), so the invoice search keeps its icon/text
 * clearance in RTL and LTR. The design-system base input rule (Slice I)
 * outranks this component's padding by specificity, so design-system.css
 * restores these same 48px/42px values for this input with !important —
 * the two declarations must stay in sync (aba-search-field.spec.ts pins
 * both).
 *
 * Narrow-input fix (2026-11-22): at ≤220px the text area left after the
 * 48px/42px chrome is only ~47px, so the full per-screen placeholder
 * ("Search by category, description, vendor or reference…") cannot fit
 * and clips. The caller may pass `placeholderNarrow` — a short form
 * ("Search", ui.m_11ucx5t) — which this component shows at ≤220px only,
 * tracked with matchMedia. The aria-label keeps the full description, so
 * the accessible name is unchanged.
 */
@Component({
  selector: 'aba-search-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbaIconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AbaSearchFieldComponent),
      multi: true,
    },
  ],
  template: `
    <div class="aba-search-field">
      <aba-icon name="search" class="aba-search-field__icon" />
      <input #searchInput type="search"
        [name]="name()"
        [attr.aria-label]="ariaLabel()"
        [placeholder]="effectivePlaceholder()"
        [attr.autocomplete]="autocomplete() || null"
        [disabled]="disabled()"
        [value]="currentValue()"
        (input)="onInput($event)"
        (blur)="onTouched()" />
      @if (currentValue() && !disabled()) {
        <button type="button" class="aba-search-field__clear" [attr.aria-label]="clearLabel()" (click)="clear()">
          <aba-icon name="clear" />
        </button>
      }
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-search-field{position:relative;display:block;min-width:0}
    :host .aba-search-field__icon{position:absolute;inset-inline-start:15px;top:50%;z-index:1;width:18px;height:18px;transform:translateY(-50%);color:var(--aiba-muted,#5f6e83);pointer-events:none}
    :host .aba-search-field input{box-sizing:border-box;width:100%;min-height:var(--aiba-control-md,44px);padding-block:11px;padding-inline-start:48px;padding-inline-end:42px;appearance:none;-webkit-appearance:none;text-align:start}
    :host .aba-search-field input::-webkit-search-decoration,:host .aba-search-field input::-webkit-search-results-button,:host .aba-search-field input::-webkit-search-results-decoration{display:none}
    :host .aba-search-field input::-webkit-search-cancel-button{display:none}
    :host .aba-search-field input:disabled{opacity:.62;cursor:not-allowed}
    :host .aba-search-field__clear{position:absolute;inset-block:0;inset-inline-end:0;display:grid;place-items:center;width:38px;min-height:44px;padding:0;border:0;border-start-end-radius:var(--aiba-radius-control,11px);border-end-end-radius:var(--aiba-radius-control,11px);background:transparent;color:var(--aiba-muted,#5f6e83);cursor:pointer}
    :host .aba-search-field__clear:hover:not(:disabled){color:var(--aiba-ink,#172033);background:var(--aiba-surface-raised,#fbfdff)}
    :host .aba-search-field__clear:focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:-3px}
    :host .aba-search-field__clear:disabled{opacity:.62;cursor:not-allowed}
  `],
})
export class AbaSearchFieldComponent implements ControlValueAccessor {
  /** The input's `name`, kept verbatim from the shell search it replaces. */
  readonly name = input.required<string>();

  /** Accessible label for the input (already translated by the caller). */
  readonly ariaLabel = input.required<string>();

  /** Accessible label for the clear button (already translated by the caller). */
  readonly clearLabel = input.required<string>();

  /** Placeholder text (already translated by the caller). Empty by default. */
  readonly placeholder = input<string>('');

  /** Short placeholder shown at ≤220px instead of `placeholder` (narrow-input
   * fix 2026-11-22). Empty means the full placeholder is kept at every width. */
  readonly placeholderNarrow = input<string>('');

  /** Passed through to the inner input's `autocomplete` attribute. Empty means omitted. */
  readonly autocomplete = input<string>('');

  /** Tracks the ≤220px breakpoint for the narrow placeholder. Guarded for the
   * node unit runner, which has no `window` (no TestBed instantiates this
   * component there). */
  private readonly narrowQuery = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 220px)') : null;
  protected readonly isNarrow = signal(this.narrowQuery?.matches ?? false);

  /** The placeholder actually rendered: the narrow form at ≤220px when one is
   * provided, otherwise the full placeholder. */
  protected readonly effectivePlaceholder = computed(() =>
    this.isNarrow() && this.placeholderNarrow() ? this.placeholderNarrow() : this.placeholder());

  constructor() {
    this.narrowQuery?.addEventListener('change', (event) => this.isNarrow.set(event.matches));
  }

  protected readonly currentValue = signal('');
  protected readonly disabled = signal(false);
  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private onChange: (value: string) => void = () => {};
  private onTouchedCallback: () => void = () => {};

  writeValue(value: string | null): void {
    this.currentValue.set(typeof value === 'string' ? value : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedCallback = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  /** User typing: keep the signal in step and notify the ngModel binding. */
  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.currentValue.set(value);
    this.onChange(value);
  }

  /** Blur marks the control touched, as a plain input would. */
  protected onTouched(): void {
    this.onTouchedCallback();
  }

  /** Clear button: empty the value, notify the binding, and return focus to the input. */
  protected clear(): void {
    this.currentValue.set('');
    this.onChange('');
    this.onTouchedCallback();
    this.inputRef()?.nativeElement.focus();
  }
}
