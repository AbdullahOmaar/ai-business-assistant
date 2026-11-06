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
    .aba-metric-card{min-width:0;min-height:125px;height:100%;padding:17px;background:var(--aba-color-surface, #fff);border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 14px)}
    .aba-metric-card__label{display:block;margin-bottom:13px;color:var(--aba-color-text-muted, #475569);font-size:12px;line-height:1.5;font-weight:650}
    .aba-metric-card__values{display:grid;gap:7px;min-width:0}
  `],
})
export class AbaMetricCardComponent {}
