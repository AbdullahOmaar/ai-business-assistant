import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LocalizationService } from '../../localization.service';

/**
 * State-driven animated loading logo (T18 Slice B).
 *
 * Inlines the brand loader mark (octagram + three rising bars + dot) with
 * namespaced classes/keyframes (`aiba-loader-*`). The delivered SVG's
 * generic names (`.bar`, `.b1`, `.dot`, `.star`, `rise`/`pop`/`breathe`)
 * would collide with app CSS, so they are not used here.
 *
 * The mark is the supplied white-on-dark mark (mark_white_on_dark.svg):
 * white octagram star, DARK short bars (#093A44), amber tall bar and dot
 * (#F5A623). Owner correction 2026-11-21: Slice B shipped the two short bars
 * WHITE, which made them invisible against the white star — only the amber
 * bar/dot showed. The short bars now use the supplied dark fill, so every
 * element of the mark is visible. The mark still always renders on the teal
 * disc (the handoff's app-icon gradient #1F8C96 -> #093A44). The delivered
 * SVG's teal star (#0F5C68) would vanish on that disc, so the star renders
 * WHITE here — the handoff's white-star mark. The tall bar and dot stay
 * amber (#F5A623).
 *
 * The delivered SVG's provisional aria-label is not shipped.
 * The component owns the accessible name: the locale-aware loading label
 * (`ui.m_1rza5t5`) in a visually hidden span inside `role="status"`. Pass `[announce]="false"` where the parent
 * already owns the status region (the global loading bar, `aba-state-message`)
 * so the label is not announced twice.
 *
 * State-driven, not timed: the component only renders the mark; whether it
 * shows is decided by the reference-counted `AbaLoadingStateService` in the
 * parent. No timer, no fake completion, no invented progress. The container
 * is a fixed size (48px, 28px compact) so showing/hiding it never shifts
 * layout. `prefers-reduced-motion` renders a static frame.
 */
@Component({
  selector: 'aba-loading-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="aiba-loader" [class.aiba-loader--compact]="compact()" [attr.role]="announce() ? 'status' : null">
      <span class="aiba-loader__disc" aria-hidden="true">
        <svg class="aiba-loader__mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <polygon class="aiba-loader__star" points="68.75,4.73 76.52,23.48 95.27,31.25 87.50,50.00 95.27,68.75 76.52,76.52 68.75,95.27 50.00,87.50 31.25,95.27 23.48,76.52 4.73,68.75 12.50,50.00 4.73,31.25 23.48,23.48 31.25,4.73 50.00,12.50" fill="#ffffff" />
          <rect class="aiba-loader__bar aiba-loader__bar--first" x="27.25" y="49.00" width="11.5" height="20" rx="3.68" fill="#093A44" />
          <rect class="aiba-loader__bar aiba-loader__bar--second" x="44.25" y="35.00" width="11.5" height="34" rx="3.68" fill="#093A44" />
          <rect class="aiba-loader__bar aiba-loader__bar--third" x="61.25" y="19.00" width="11.5" height="50" rx="3.68" fill="#f5a623" />
          <circle class="aiba-loader__dot" cx="67.00" cy="9.80" r="5.17" fill="#f5a623" />
        </svg>
      </span>
      @if (announce()) { <span class="aiba-loader__label">{{ loadingLabel }}</span> }
    </span>
  `,
  styles: [`
    :host{display:inline-flex;flex:0 0 auto}
    .aiba-loader{position:relative;display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:48px;height:48px}
    .aiba-loader--compact{width:28px;height:28px}
    .aiba-loader__disc{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:linear-gradient(180deg,var(--aiba-brand-teal-light,#1f8c96),var(--aiba-brand-teal-deep,#093a44));box-shadow:0 2px 8px #0f172a26;overflow:hidden}
    .aiba-loader__mark{display:block;width:78%;height:78%}
    .aiba-loader__bar--third,.aiba-loader__dot{fill:var(--aiba-brand-amber,#f5a623)}
    .aiba-loader__bar{transform-box:fill-box;transform-origin:50% 100%;animation:aiba-loader-rise 1.4s cubic-bezier(.3,.7,.3,1) infinite}
    .aiba-loader__bar--second{animation-delay:.15s}
    .aiba-loader__bar--third{animation-delay:.3s}
    .aiba-loader__dot{transform-box:fill-box;transform-origin:50% 50%;animation:aiba-loader-pop 1.4s ease-in-out infinite;animation-delay:.45s}
    .aiba-loader__star{transform-box:fill-box;transform-origin:50% 50%;animation:aiba-loader-breathe 2.8s ease-in-out infinite}
    @keyframes aiba-loader-rise{0%{transform:scaleY(.15);opacity:.5}45%,75%{transform:scaleY(1);opacity:1}100%{transform:scaleY(.15);opacity:.5}}
    @keyframes aiba-loader-pop{0%,35%{transform:scale(0);opacity:0}55%{transform:scale(1.25);opacity:1}70%,80%{transform:scale(1);opacity:1}100%{transform:scale(0);opacity:0}}
    @keyframes aiba-loader-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
    .aiba-loader__label{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
    @media(prefers-reduced-motion:reduce){.aiba-loader__bar,.aiba-loader__dot,.aiba-loader__star{animation:none}}
  `],
})
export class AbaLoadingLogoComponent {
  /** Compact 28px size for inline use (global bar, state-message placeholders). */
  readonly compact = input(false);

  /**
   * True (default): own the status region — `role="status"` with a visually
   * hidden locale-aware loading label. False: decorative only; the parent
   * already announces the loading state.
   */
  readonly announce = input(true);

  private readonly localization = inject(LocalizationService);

  get loadingLabel(): string {
    return this.localization.translate('ui.m_1rza5t5');
  }
}
