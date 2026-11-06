import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type AbaStateKind = 'loading' | 'empty' | 'error' | 'success' | 'info' | 'warning';

/** Consistent status feedback. Action execution and retry policy stay with the caller. */
@Component({
  selector: 'aba-state-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="aba-state-message" [class.aba-state-message--loading]="kind() === 'loading'" [class.aba-state-message--empty]="kind() === 'empty'" [class.aba-state-message--error]="kind() === 'error'" [class.aba-state-message--success]="kind() === 'success'" [class.aba-state-message--info]="kind() === 'info'" [class.aba-state-message--warning]="kind() === 'warning'" [attr.role]="kind() === 'error' ? 'alert' : 'status'" [attr.aria-live]="kind() === 'loading' || kind() === 'success' ? 'polite' : null">
      @if (kind() === 'loading') { <span class="aba-state-message__spinner" aria-hidden="true"></span> }
      <div class="aba-state-message__copy">
        @if (title()) { <strong>{{ title() }}</strong> }
        @if (description()) { <p>{{ description() }}</p> }
      </div>
      @if (actionLabel()) {
        <button type="button" class="aba-state-message__action" [disabled]="actionDisabled()" (click)="action.emit()">{{ actionLabel() }}</button>
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-state-message{display:flex;align-items:center;gap:var(--aba-space-3, 12px);min-width:0;padding:var(--aba-space-3, 12px) var(--aba-space-4, 16px);border:1px solid var(--aba-color-border, #e2e8f0);border-radius:var(--aba-radius-control, 9px);background:var(--aba-color-surface-subtle, #f8fafc);color:var(--aba-color-text-primary, #334155)}
    .aba-state-message__copy{min-width:0;flex:1}
    .aba-state-message strong{display:block;font-size:var(--aba-font-size-sm, 12px);line-height:var(--aba-line-height-normal, 1.5);font-weight:var(--aba-font-weight-semibold, 600)}
    .aba-state-message p{margin:var(--aba-space-1, 4px) 0 0;color:var(--aba-color-text-muted, #475569);font-size:var(--aba-font-size-xs, 11px);line-height:var(--aba-line-height-relaxed, 1.65);overflow-wrap:anywhere}
    .aba-state-message--error{background:var(--aba-color-danger-soft, #fef2f2);border-color:var(--aba-color-danger-border, #fecaca);color:var(--aba-color-danger-text, #991b1b)}
    .aba-state-message--error p{color:var(--aba-color-danger-text, #991b1b)}
    .aba-state-message--success{background:var(--aba-color-success-soft, #ecfdf5);border-color:var(--aba-color-success-border, #bbf7d0);color:var(--aba-color-success-text, #065f46)}
    .aba-state-message--success p{color:var(--aba-color-success-text, #065f46)}
    .aba-state-message--info{background:var(--aba-color-info-soft, #eff6ff);border-color:var(--aba-color-info-border, #bfdbfe);color:var(--aba-color-info-text, #1e40af)}
    .aba-state-message--info p{color:var(--aba-color-info-text, #1e40af)}
    .aba-state-message--warning{background:var(--aba-color-warning-soft, #fffbeb);border-color:var(--aba-color-warning-border, #fde68a);color:var(--aba-color-warning-text, #92400e)}
    .aba-state-message--warning p{color:var(--aba-color-warning-text, #92400e)}
    .aba-state-message__action{flex:0 0 auto;min-height:44px;padding:var(--aba-space-2, 8px) var(--aba-space-3, 12px);border:1px solid currentColor;border-radius:var(--aba-radius-control, 9px);background:transparent;color:inherit;font:inherit;font-size:var(--aba-font-size-xs, 11px);font-weight:var(--aba-font-weight-semibold, 600);cursor:pointer}
    .aba-state-message__action:focus-visible{outline:var(--aba-focus-ring-width, 3px) solid var(--aba-color-focus-ring, #2563eb);outline-offset:var(--aba-focus-ring-offset, 2px)}
    .aba-state-message__spinner{flex:0 0 18px;width:18px;height:18px;border:2px solid var(--aba-color-border-strong, #cbd5e1);border-top-color:var(--aba-color-primary, #0f766e);border-radius:50%;animation:aba-spin .75s linear infinite}
    @keyframes aba-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.aba-state-message__spinner{animation:none;border-top-color:var(--aba-color-primary, #0f766e)}}
    @media(max-width:480px){.aba-state-message{align-items:flex-start;flex-wrap:wrap}.aba-state-message__action{margin-inline-start:auto}}
  `],
})
export class AbaStateMessageComponent {
  readonly kind = input<AbaStateKind>('empty');
  readonly title = input('');
  readonly description = input('');
  readonly actionLabel = input('');
  readonly actionDisabled = input(false);
  readonly action = output<void>();
}
