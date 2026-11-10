import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shared heading row for page sections, result lists, and panels. */
@Component({
  selector: 'aba-section-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="aba-section-header">
      <div class="aba-section-header__copy">
        @if (level() === 3) {
          <h3 [id]="titleId() || null">{{ title() }}</h3>
        } @else {
          <h2 [id]="titleId() || null">{{ title() }}</h2>
        }
        @if (description()) { <p>{{ description() }}</p> }
      </div>
      <div class="aba-section-header__actions">
        @if (count() !== null) { <span class="aba-section-header__count">{{ count() }}</span> }
        <ng-content />
      </div>
    </header>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-section-header{display:flex;align-items:center;justify-content:space-between;gap:var(--aba-space-3, 12px);min-width:0;margin-bottom:var(--aba-space-4, 16px)}
    .aba-section-header__copy{min-width:0}
    .aba-section-header h2,.aba-section-header h3{margin:0 0 var(--aba-space-2, 8px);font-size:var(--aba-font-size-lg, 16px);line-height:var(--aba-line-height-relaxed, 1.65);font-weight:var(--aba-font-weight-bold, 700);color:var(--aba-color-text-primary, #172033)}
    .aba-section-header p{margin:0;color:var(--aba-color-text-secondary, #64748b);font-size:var(--aba-font-size-sm, 12px);line-height:1.55;overflow-wrap:anywhere}
    .aba-section-header__actions{display:flex;align-items:center;gap:var(--aba-space-2, 8px);flex-wrap:wrap}
    .aba-section-header__count{display:inline-flex;align-items:center;padding:7px 9px;border-radius:var(--aba-radius-pill, 999px);background:var(--aba-color-primary-soft, #ecfdf5);color:var(--aba-color-primary, #0f766e);font-size:var(--aba-font-size-xs, 11px);font-weight:var(--aba-font-weight-bold, 700);white-space:nowrap}
    .aba-section-header h2,.aba-section-header h3{overflow-wrap:anywhere}
    @media(max-width:760px){.aba-section-header{align-items:flex-start;gap:var(--aba-space-2, 8px)}}
    @media(max-width:600px){
      .aba-section-header{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:var(--aba-space-2, 8px)}
      .aba-section-header__actions{width:100%;min-width:0;justify-content:flex-start}
      .aba-section-header h2,.aba-section-header h3{font-size:15px}
    }
  `],
})
export class AbaSectionHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly level = input<2 | 3>(2);
  readonly count = input<string | number | null>(null);
  readonly titleId = input('');
}
