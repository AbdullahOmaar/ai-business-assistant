import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LocalizationService } from '../../localization.service';

/**
 * State-driven animated loading character (T18 Slice B, identity absorbed
 * in the handover batch 3A-346).
 *
 * Owner decision 2026-11-22: the identity in the handover bundle — the
 * character plus loader prototype v3 — is approved as-is (a practical
 * approval, revisable later; refinements are a separate later batch). This
 * component is that prototype rebuilt as a real Angular component: the
 * approved transparent character cutout (handover `identity/` cutout B,
 * downscaled 1024 -> 384 px for the web; displayed at 96 px or less) as ONE
 * flat image, with the prototype's whole-character motion only — a 1.44 s
 * bob (translateY -7 px, rotate -1 deg at the midpoint, matching the
 * reference GIF's 24 frames x 60 ms) plus the soft CSS shadow ellipse
 * pulsing in sync underneath. No part of the character moves separately:
 * eyes, glasses, arms, abacus and notebook are one image and move together.
 * The compact size (44 px, both current call sites) bobs 2 px and renders
 * no shadow ellipse, like the prototype's card variant.
 *
 * The provisional name from the identity drafts is NOT shipped anywhere in
 * this slice (the public brand name stays the owner's decision); the image
 * is decorative (`alt=""`, `aria-hidden`) and the component owns the
 * accessible name exactly as before: the locale-aware loading label
 * (`ui.m_1rza5t5`) in a visually hidden span inside `role="status"`. Pass
 * `[announce]="false"` where the parent already owns the status region
 * (the global loading bar, `aba-state-message`) so the label is not
 * announced twice.
 *
 * State-driven, not timed: the component only renders the character;
 * whether it shows is decided by the reference-counted
 * `AbaLoadingStateService` in the parent. No timer, no fake completion, no
 * invented progress. The container is a fixed size (96 px, 44 px compact)
 * so showing/hiding it never shifts layout. `prefers-reduced-motion`
 * renders a static frame.
 *
 * Superseded: the Slice B SVG disc mark (white octagram star + rising bars
 * on the teal gradient disc). Its source contracts were replaced one-for-one
 * by the character contracts in `aba-loading-logo.spec.ts`; the boot
 * fallback in `index.html` still uses the static SVG mark deliberately —
 * it renders before any asset pipeline exists and stays a no-dependency
 * frame.
 */
@Component({
  selector: 'aba-loading-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="aiba-loader" [class.aiba-loader--compact]="compact()" [attr.role]="announce() ? 'status' : null">
      <img class="aiba-loader__figure" src="identity/loader-character.png" alt="" aria-hidden="true" draggable="false" />
      @if (!compact()) { <span class="aiba-loader__shadow" aria-hidden="true"></span> }
      @if (announce()) { <span class="aiba-loader__label">{{ loadingLabel }}</span> }
    </span>
  `,
  styles: [`
    :host{display:inline-flex;flex:0 0 auto}
    .aiba-loader{position:relative;display:inline-flex;flex:0 0 auto;flex-direction:column;align-items:center;justify-content:flex-start;width:96px;height:108px}
    .aiba-loader--compact{width:44px;height:44px}
    .aiba-loader__figure{display:block;width:96px;height:96px;object-fit:contain;animation:aiba-loader-bob 1.44s ease-in-out infinite}
    .aiba-loader--compact .aiba-loader__figure{width:44px;height:44px;animation-name:aiba-loader-bob-compact}
    .aiba-loader__shadow{display:block;width:64px;height:10px;margin-top:2px;border-radius:50%;background:#0f172a2e;animation:aiba-loader-shadow 1.44s ease-in-out infinite}
    @keyframes aiba-loader-bob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-7px) rotate(-1deg)}}
    @keyframes aiba-loader-bob-compact{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-2px) rotate(-1deg)}}
    @keyframes aiba-loader-shadow{0%,100%{transform:scaleX(1);opacity:1}50%{transform:scaleX(.86);opacity:.7}}
    .aiba-loader__label{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
    @media(prefers-reduced-motion:reduce){.aiba-loader__figure,.aiba-loader__shadow{animation:none}}
  `],
})
export class AbaLoadingLogoComponent {
  /** Compact 44px size for inline use (global bar, state-message placeholders). */
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
