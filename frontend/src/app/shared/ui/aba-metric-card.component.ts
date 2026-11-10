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
    .aba-metric-card__label{display:block;margin-bottom:var(--aba-space-3, 12px);color:var(--aba-color-text-muted, #475569);font-size:var(--aba-font-size-sm, 12px);line-height:var(--aba-line-height-normal, 1.5);font-weight:var(--aba-font-weight-semibold, 600)}
    .aba-metric-card__values{display:grid;gap:var(--aba-space-2, 8px);min-width:0}
    .aba-metric-card__values strong{display:block;min-width:0;overflow-wrap:anywhere;color:var(--aba-color-text-primary,#172033);font-size:19px;line-height:1.35;font-variant-numeric:tabular-nums}
    .aba-metric-card__values small{display:block;min-width:0;overflow-wrap:anywhere;color:var(--aba-color-text-secondary,#64748b);font-size:10px;line-height:1.5}
    .aba-metric-card__values .metric-basis{margin-top:3px;padding-top:8px;border-top:1px solid var(--aba-color-border-subtle,#e2e8f0);color:var(--aba-color-text-muted,#475569)}
    @media(max-width:760px){
      .aba-metric-card{min-height:112px;padding:12px}
      .aba-metric-card__label{margin-bottom:8px}
      .aba-metric-card__values{gap:6px}
      .aba-metric-card__values strong{font-size:17px;line-height:1.3}
      .aba-metric-card__values small{font-size:11px;line-height:1.45}
      .aba-metric-card__values .metric-basis{margin-top:2px;padding-top:6px}
    }
    @media(max-width:380px){
      .aba-metric-card{min-height:104px;padding:10px}
      .aba-metric-card__label{font-size:11px}
      .aba-metric-card__values strong{font-size:15px}
      .aba-metric-card__values small{font-size:11px}
    }
  `],
})
export class AbaMetricCardComponent {}
