import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Reusable KPI shell. Values and their business meaning remain owned by the page. */
@Component({
  selector: 'aba-metric-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="aba-metric-card">
      <div class="aba-metric-card__label"><ng-content select="[metricLabel]" /></div>
      <div class="aba-metric-card__values"><ng-content /></div>
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-metric-card{min-width:0;min-height:125px;height:100%;padding:var(--aba-space-4, 16px);background:var(--aba-color-surface, #fff);border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 14px);box-shadow:var(--aba-shadow-card, 0 1px 2px rgb(15 23 42 / 4%))}
    .aba-metric-card__label{display:block;margin-bottom:var(--aba-space-3, 12px);color:var(--aba-color-text-muted, #475569);font-size:var(--aba-font-size-xs, 11px);line-height:var(--aba-line-height-normal, 1.5);font-weight:var(--aba-font-weight-semibold, 600)}
    .aba-metric-card__values{display:grid;gap:var(--aba-space-2, 8px);min-width:0}
  `],
})
export class AbaMetricCardComponent {}
