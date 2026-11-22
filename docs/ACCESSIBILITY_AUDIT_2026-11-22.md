# Accessibility audit — 2026-11-22 (Linear 3A-329)

Local-only audit (the owner's 2026-11-17 decision keeps browser tooling out of
CI). Tooling: axe-core 4.x + headless Chromium driven locally against the
production build served on localhost; keyboard walks and a 200%-zoom proxy
(640 CSS px viewport) scripted the same way; static template/token sweeps over
the frontend sources. No paid device or cloud service was used.

## Surfaces audited dynamically (axe WCAG 2.0/2.1 A+AA, plus a 2.2 AA run)

| Surface | Result |
| --- | --- |
| Login (Arabic, RTL) | **0 violations** (also 0 with `wcag22aa` tags included) |
| Login (English, LTR) | **0 violations** |
| Sign-up (Arabic) | **0 violations** |
| Sign-up (English) | **0 violations** |
| Login @ 640px (200% zoom proxy) | **0 violations**, no horizontal overflow |
| Sign-up @ 640px | **0 violations**, no horizontal overflow |

`color-contrast` lands in axe's "incomplete" bucket on the login card
(gradient background it cannot resolve); the token-level contrast review
below covers the same ground deterministically.

## Keyboard pass

- Login tab order is logical (language toggle → email → password → submit →
  demo entry → create account → wraps), and **every stop shows a solid 3px
  focus outline**.
- Sign-up tab order likewise logical with visible outlines on every stop.
- The shared confirm dialog (`aba-confirm-dialog`) moves focus to the cancel
  action on open, traps Tab inside, closes on Escape and restores focus.
- No positive `tabindex` anywhere; no anchor-as-button patterns; no click
  handlers on non-interactive elements (the one hit is the confirm dialog's
  backdrop, a mouse-only dismiss convenience next to full keyboard support).

## Static sweeps (all templates)

- Images without `alt`: **0**. Icon-only buttons without an accessible name:
  **0**. Fields without a label/aria: **0 truly unlabelled** (the app's
  wrapping-`<label>` pattern covers the rest; the single raw hit was text
  inside a doc comment in `aba-date-range`, whose inputs are caller-projected
  and labelled by every caller).
- Reduced motion: the shell controls rule in `styles.css`, the identity
  loader (`aba-loading-logo`) and the skeleton shimmer all honor
  `prefers-reduced-motion: reduce`.

## Contrast (token level, computed)

| Token / use | Ratio | Verdict |
| --- | --- | --- |
| `--aiba-muted` #5f6e83 on white | 5.19:1 | AA pass |
| `--aba-color-text-tertiary` #6b7280 on white | ~4.8:1 | AA pass (also pinned by `accessibility-colors.spec.ts`) |
| `--aba-color-success-text` #065f46 | ~7.0:1 | AA pass |
| `--aba-color-warning-text` #92400e | ~6.9:1 | AA pass |
| `--aiba-muted-soft` #94a3b8 on white | 2.56:1 | **fail for content text** |

## Fix shipped in this batch

- **Product catalog SKU label** (`.product-catalog__sku > span`) rendered
  content text in `muted-soft` at 2.56:1. It now uses `--aiba-muted`
  (#5f6e83, 5.19:1) — the same readable muted tone the rest of the app uses
  for secondary content. Regression-pinned by a new test in
  `accessibility-colors.spec.ts`. (`muted-soft` remains only for placeholder
  text, which is exempt from the AA text-contrast requirement.)

## NOT RUN — follow-ups (explicit)

- **Authenticated-workspace dynamic axe/keyboard runs:** the demo login mints
  a Firebase custom token server-side, so no local authenticated harness
  exists without Firebase Admin credentials; the shell/workspaces were
  covered by the static sweeps and the token review above instead. Re-run
  dynamically when an authenticated local harness or a staging identity is
  available.
- **Physical iPhone / iOS Safari** and **screen readers** (NVDA/VoiceOver):
  not run — no device/lab available locally; deferred by the approved scope.
- Physical Android and installed-PWA journeys: not run (unchanged standing
  acceptance gap).
