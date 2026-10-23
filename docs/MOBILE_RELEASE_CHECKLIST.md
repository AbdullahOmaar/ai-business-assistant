# Mobile release checklist

This checklist is the release gate for the Angular PWA on Android phones. A successful build or HTTP 200 response is not a substitute for a device smoke test.

## Implemented in the mobile branch

- [x] Hide the desktop top bar on phone-sized layouts.
- [x] Keep four primary bottom-navigation destinations: Home, Invoices, Customers, and More.
- [x] Move Products, Payments, AI Assistant, language switching, and sign-out into the More menu.
- [x] Style the bottom navigation with safe-area spacing, a clear active state, and larger touch targets.
- [x] Set Arabic as the default document language and RTL direction; update both when the user switches languages.
- [x] Localize primary navigation accessible labels and titles for Arabic and English.
- [x] Add 192px and 512px SVG icon entries to the PWA manifest.
- [x] Reserve vertical space for the fixed install control and its help message.
- [x] Version the service-worker shell cache and precache the install icons.
- [x] Do not cache API responses or business data in the service worker.

## Automated release checks (verified for the merged mobile change)

- [x] GitHub Actions workflow `Verify backend and frontend` completed successfully for the merged mobile change.
- [x] Vercel reported successful production deployment checks for both frontend and backend on the merge commit.
- [x] Inline review findings for the install-control spacing and manifest icon entries were resolved in the mobile branch.

These automated checks do not replace the physical-device and authenticated workflow checks below.

## Required manual checks before release

- [ ] On Android Chrome, confirm the top app bar is absent and the bottom navigation remains visible while scrolling.
- [ ] Tap each primary destination and each More-menu item; verify the correct section opens and the More menu closes.
- [ ] Verify the menu and install help fit on 320px-wide screens and do not cover critical form actions.
- [ ] Switch Arabic → English → Arabic; confirm page direction, navigation labels, and accessible names update.
- [ ] Confirm the install button does not overlap the workspace selector or page title.
- [ ] Confirm Chrome offers installation when its PWA criteria are met; verify the browser-menu fallback otherwise.
- [ ] Install the app, launch it from the home screen, reload, and confirm the shell loads.
- [ ] Verify API/business data is not cached and sign-out clears visible business data.
- [ ] Run the latest GitHub Actions checks and verify the production deployment commit in Vercel.
- [ ] Complete an authenticated smoke test for login, workspace isolation, invoices, payments, and assistant error handling.

## Safety

Do not mark this release complete solely because the Vercel preview is READY. Do not enable paid resources or change production secrets as part of these checks.
