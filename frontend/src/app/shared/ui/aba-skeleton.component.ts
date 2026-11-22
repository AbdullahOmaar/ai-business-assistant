import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared loading skeleton (T18 Slice C).
 *
 * One component for every loading placeholder in the app, built from the
 * Overview skeleton (the only skeleton that existed before this slice).
 * The skeleton reserves the content's space (Facebook-style): the
 * metric-card variant keeps the KPI card's height (min-height 145px), the
 * detail variant keeps the reporting-period section's height (min-height
 * 66px), and the list-row variant keeps a list row's height (min-height
 * 64px), so content appearing later does not shift the layout.
 *
 * Variants:
 * - `metric-card` — one KPI card: label bar (44%), value bar (72%, 24px),
 *   note bar (58%). Keeps the `metric-skeleton` class: the Playwright
 *   route sweeps (`route-matrix-402.spec.ts`, `mobile-chat.spec.ts`) locate
 *   `.metric-skeleton:visible` and wait for it to disappear after load.
 * - `list-row` — one list row: 40px thumb + two text lines (56%, 82%).
 * - `detail` — a section heading + detail lines: renders the optional
 *   `title`/`subtitle` as real text (the hierarchy stays visible while
 *   loading, as the Overview period skeleton did) plus two detail bars.
 *
 * The bars carry a subtle shimmer (a moving light band over the bar
 * colour). There was no shimmer before this slice — the old bars were
 * static — so the shimmer is new, but it is motion-safe: under
 * `prefers-reduced-motion: reduce` the animation is removed and the bars
 * fall back to the flat static colour, exactly as the old skeleton looked.
 *
 * The component is decorative: every variant root is `aria-hidden="true"`.
 * The parent owns the loading announcement (the shell's workspace-level
 * `aba-state-message kind="loading"` or its own status region).
 *
 * New pieces use the `--aiba-*` tokens (plan section 1 decision); the
 * `--aba-*` / `--aiba-*` token sets are not renamed or merged here.
 */
@Component({
  selector: 'aba-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'detail') {
      <section class="aba-skeleton aba-skeleton--detail" aria-hidden="true">
        <div class="aba-skeleton__heading">
          @if (title()) { <h2 class="aba-skeleton__title">{{ title() }}</h2> }
          @if (subtitle()) { <strong class="aba-skeleton__subtitle">{{ subtitle() }}</strong> }
        </div>
        <div class="aba-skeleton__details">
          <span class="aba-skeleton__bar"></span><span class="aba-skeleton__bar"></span>
        </div>
      </section>
    } @else if (variant() === 'list-row') {
      <div class="aba-skeleton aba-skeleton--list-row" aria-hidden="true">
        <span class="aba-skeleton__thumb"></span>
        <span class="aba-skeleton__lines">
          <span class="aba-skeleton__bar"></span><span class="aba-skeleton__bar"></span>
        </span>
      </div>
    } @else {
      <div class="metric-skeleton aba-skeleton aba-skeleton--metric-card" aria-hidden="true">
        <span class="aba-skeleton__bar"></span><span class="aba-skeleton__bar"></span><span class="aba-skeleton__bar"></span>
      </div>
    }
  `,
  styles: [`
    :host{display:block;min-width:0}
    .aba-skeleton__bar,.aba-skeleton__thumb{display:block;background:linear-gradient(90deg,var(--aiba-line,#e2e8f0) 25%,var(--aiba-surface-raised,#fbfdff) 50%,var(--aiba-line,#e2e8f0) 75%);background-size:200% 100%;animation:aiba-skeleton-shimmer 1.6s linear infinite}
    .aba-skeleton__bar{height:10px;max-width:100%;border-radius:999px}
    @keyframes aiba-skeleton-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @media(prefers-reduced-motion:reduce){.aba-skeleton__bar,.aba-skeleton__thumb{animation:none;background:var(--aiba-line,#e2e8f0)}}
    .metric-skeleton{display:grid;align-content:start;gap:12px;min-width:0;min-height:145px;padding:16px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:var(--aiba-radius-card,16px);background:var(--aiba-surface,#fff)}
    .metric-skeleton .aba-skeleton__bar:first-child{width:44%}
    .metric-skeleton .aba-skeleton__bar:nth-child(2){width:72%;height:24px;border-radius:8px}
    .metric-skeleton .aba-skeleton__bar:last-child{width:58%}
    .aba-skeleton--detail{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 18px;margin:0 0 14px;padding:13px 16px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:var(--aiba-radius-card,16px);background:var(--aiba-surface-tint,#f6fafb);min-height:66px}
    .aba-skeleton__heading{display:grid;gap:3px;min-width:0}
    .aba-skeleton__title{margin:0;color:var(--aiba-ink,#172033);font-size:var(--aiba-text-md,14px);line-height:1.4;font-weight:700;overflow-wrap:anywhere}
    .aba-skeleton__subtitle{font-size:13px;line-height:1.4;color:var(--aiba-ink,#172033)}
    .aba-skeleton__details{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;min-width:0}
    .aba-skeleton__details .aba-skeleton__bar{width:clamp(110px,24vw,190px);height:9px}
    .aba-skeleton__details .aba-skeleton__bar:last-child{width:clamp(90px,18vw,145px)}
    .aba-skeleton--list-row{display:flex;align-items:center;gap:12px;min-width:0;min-height:64px;padding:12px 16px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:var(--aiba-radius-card,16px);background:var(--aiba-surface,#fff)}
    .aba-skeleton__thumb{flex:0 0 40px;width:40px;height:40px;border-radius:10px}
    .aba-skeleton__lines{display:grid;gap:8px;flex:1;min-width:0}
    .aba-skeleton__lines .aba-skeleton__bar:first-child{width:56%}
    .aba-skeleton__lines .aba-skeleton__bar:last-child{width:82%}
    @media(max-width:760px){.aba-skeleton--detail{gap:7px;margin-block-end:10px;padding:10px 12px;border-radius:12px}.aba-skeleton__heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.aba-skeleton__title{font-size:13px}.aba-skeleton__subtitle{font-size:11px}}
  `],
})
export class AbaSkeletonComponent {
  /** Which placeholder shape to render. Defaults to the KPI card. */
  readonly variant = input<'metric-card' | 'list-row' | 'detail'>('metric-card');

  /**
   * Detail variant only: the real heading shown above the bars (e.g. the
   * Overview "Business summary"), so the section hierarchy stays visible
   * while loading instead of collapsing to bare bars.
   */
  readonly title = input<string | null>(null);

  /** Detail variant only: the real subheading shown under the title. */
  readonly subtitle = input<string | null>(null);
}
