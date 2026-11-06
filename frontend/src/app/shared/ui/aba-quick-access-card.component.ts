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
    .aba-quick-access{width:100%;height:100%;min-height:104px;display:flex;align-items:flex-start;gap:12px;padding:15px;text-align:start;border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 14px);background:var(--aba-color-surface, #fff);color:var(--aba-color-text-primary, #172033);cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
    .aba-quick-access:hover:not(:disabled){border-color:#99b8c6;box-shadow:0 8px 22px #0f172a0a;transform:translateY(-1px)}
    .aba-quick-access:focus-visible{outline:3px solid var(--aba-color-focus, #2563eb);outline-offset:2px}
    .aba-quick-access:disabled{cursor:not-allowed;opacity:.55}
    .aba-quick-access__icon{flex:0 0 36px;width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:var(--aba-color-primary-soft, #ecfdf5);color:var(--aba-color-primary, #0f766e);font-size:17px}
    .aba-quick-access__copy{display:grid;gap:5px;min-width:0;flex:1}
    .aba-quick-access__copy strong{font-size:13px;line-height:1.45;overflow-wrap:anywhere}
    .aba-quick-access__copy>span{color:var(--aba-color-text-secondary, #64748b);font-size:11px;line-height:1.5;overflow-wrap:anywhere}
    .aba-quick-access__arrow{align-self:center;color:var(--aba-color-text-secondary, #64748b);font-size:14px}
    :host-context([dir="rtl"]) .aba-quick-access__arrow{transform:scaleX(-1)}
    @media(prefers-reduced-motion:reduce){.aba-quick-access{transition:none}.aba-quick-access:hover:not(:disabled){transform:none}}
  `],
})
export class AbaQuickAccessCardComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('◇');
  readonly disabled = input(false);
  readonly activated = output<void>();
}
