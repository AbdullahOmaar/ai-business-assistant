import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type AbaStateKind = 'loading' | 'empty' | 'error' | 'success';

/** Consistent status feedback. Action execution and retry policy stay with the caller. */
@Component({
  selector: 'aba-state-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="aba-state-message" [class.aba-state-message--loading]="kind() === 'loading'" [class.aba-state-message--empty]="kind() === 'empty'" [class.aba-state-message--error]="kind() === 'error'" [class.aba-state-message--success]="kind() === 'success'" [attr.role]="kind() === 'error' ? 'alert' : 'status'" [attr.aria-live]="kind() === 'loading' || kind() === 'success' ? 'polite' : null">
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
    .aba-state-message{display:flex;align-items:center;gap:12px;min-width:0;padding:13px 14px;border:1px solid var(--aba-color-border, #e2e8f0);border-radius:12px;background:var(--aba-color-surface-subtle, #f8fafc);color:var(--aba-color-text-primary, #334155)}
    .aba-state-message__copy{min-width:0;flex:1}
    .aba-state-message strong{display:block;font-size:13px;line-height:1.5}
    .aba-state-message p{margin:3px 0 0;color:var(--aba-color-text-muted, #475569);font-size:12px;line-height:1.55;overflow-wrap:anywhere}
    .aba-state-message--error{background:var(--aba-color-danger-soft, #fef2f2);border-color:var(--aba-color-danger-border, #fecaca);color:var(--aba-color-danger-text, #991b1b)}
    .aba-state-message--error p{color:var(--aba-color-danger-text, #991b1b)}
    .aba-state-message--success{background:var(--aba-color-primary-soft, #ecfdf5);border-color:var(--aba-color-success-border, #bbf7d0);color:var(--aba-color-success-text, #065f46)}
    .aba-state-message--success p{color:var(--aba-color-success-text, #065f46)}
    .aba-state-message__action{flex:0 0 auto;min-height:36px;padding:7px 12px;border:1px solid currentColor;border-radius:var(--aba-radius-control, 9px);background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:650;cursor:pointer}
    .aba-state-message__action:focus-visible{outline:3px solid var(--aba-color-focus, #2563eb);outline-offset:2px}
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
