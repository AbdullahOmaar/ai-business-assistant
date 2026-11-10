import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Shared navigation card. The consuming feature supplies the destination action. */
@Component({
  selector: 'aba-quick-access-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="aba-quick-access" type="button" [disabled]="disabled()" (click)="activated.emit()">
      <span class="aba-quick-access__icon" aria-hidden="true">{{ icon() }}</span>
      <span class="aba-quick-access__copy">
        <strong>{{ title() }}</strong>
        <span>{{ description() }}</span>
      </span>
      <span class="aba-quick-access__arrow" aria-hidden="true">↗</span>
    </button>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-quick-access{width:100%;height:100%;min-height:104px;display:flex;align-items:flex-start;gap:var(--aba-space-3, 12px);padding:var(--aba-space-4, 16px);text-align:start;border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 14px);background:var(--aba-color-surface, #fff);color:var(--aba-color-text-primary, #172033);box-shadow:var(--aba-shadow-card, 0 1px 2px rgb(15 23 42 / 4%));cursor:pointer;transition:border-color var(--aba-motion-fast, 150ms) var(--aba-easing-standard, ease),box-shadow var(--aba-motion-fast, 150ms) var(--aba-easing-standard, ease),transform var(--aba-motion-fast, 150ms) var(--aba-easing-standard, ease)}
    .aba-quick-access:hover:not(:disabled){border-color:var(--aba-color-primary-border, #99f6e4);box-shadow:var(--aba-shadow-card-hover, 0 8px 22px rgb(15 23 42 / 4%));transform:translateY(-1px)}
    .aba-quick-access:focus-visible{outline:var(--aba-focus-ring-width, 3px) solid var(--aba-color-focus-ring, #2563eb);outline-offset:var(--aba-focus-ring-offset, 2px)}
    .aba-quick-access:disabled{cursor:not-allowed;opacity:.55}
    .aba-quick-access__icon{flex:0 0 36px;width:36px;height:36px;display:grid;place-items:center;border-radius:var(--aba-radius-control, 9px);background:var(--aba-color-primary-soft, #ecfdf5);color:var(--aba-color-primary, #0f766e);font-size:var(--aba-font-size-lg, 16px)}
    .aba-quick-access__copy{display:grid;gap:var(--aba-space-1, 4px);min-width:0;flex:1}
    .aba-quick-access__copy strong{font-size:var(--aba-font-size-sm, 12px);line-height:var(--aba-line-height-normal, 1.5);font-weight:var(--aba-font-weight-semibold, 600);overflow-wrap:anywhere}
    .aba-quick-access__copy>span{color:var(--aba-color-text-secondary, #64748b);font-size:var(--aba-font-size-sm, 12px);line-height:var(--aba-line-height-relaxed, 1.65);overflow-wrap:anywhere}
    .aba-quick-access__arrow{align-self:center;color:var(--aba-color-text-secondary, #64748b);font-size:var(--aba-font-size-sm, 12px)}
    :host-context([dir="rtl"]) .aba-quick-access__arrow{transform:scaleX(-1)}
    @media(prefers-reduced-motion:reduce){.aba-quick-access{transition:none}.aba-quick-access:hover:not(:disabled){transform:none}}
    @media(max-width:760px){
      :host-context(.module-directory-grid) .aba-quick-access{min-height:96px;display:grid;grid-template-columns:32px minmax(0,1fr);align-content:start;align-items:start;gap:8px;padding:10px}
      :host-context(.module-directory-grid) .aba-quick-access__icon{flex:0 0 32px;width:32px;height:32px;font-size:15px}
      :host-context(.module-directory-grid) .aba-quick-access__copy{gap:3px}
      :host-context(.module-directory-grid) .aba-quick-access__copy>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      :host-context(.module-directory-grid) .aba-quick-access__arrow{display:none}
    }
    @media(max-width:380px){
      :host-context(.module-directory-grid) .aba-quick-access{min-height:96px;gap:6px;padding:8px}
      :host-context(.module-directory-grid) .aba-quick-access__icon{flex-basis:28px;width:28px;height:28px;font-size:14px}
      :host-context(.module-directory-grid) .aba-quick-access__copy strong{font-size:12px}
      :host-context(.module-directory-grid) .aba-quick-access__copy>span{font-size:11px}
    }
  `],
})
export class AbaQuickAccessCardComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('◇');
  readonly disabled = input(false);
  readonly activated = output<void>();
}
