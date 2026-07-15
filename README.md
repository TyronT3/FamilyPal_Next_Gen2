# FamilyPal Next Gen

FamilyPal is a GitHub Pages household organizer backed by Supabase. This staging repo is the safe refactor workspace for the existing live FamilyPal site.

## Pages

- `index.html` - login and account creation
- `home.html` - FamilyPal app launcher
- `settings.html` - shared household settings
- `pantrypal.html` - PantryPal inventory, shopping, barcode scanning, and Open Food Facts lookup
- `babypal.html` - BabyPal feeds, diapers, sleep, pumping, health, undo, and diaper stock tracking
- `chorepal.html` - ChoresPal chores, points, goals, streaks, and BabyPal diaper-log integration

## Shared Assets

- `assets/js/familypal-core.js` - shared Supabase config, REST helper, auth guard, login, signup, and sign-out helpers
- `assets/js/familypal-theme.js` - shared light/dark theme persistence and toggle behavior
- `assets/js/familypal-ui.js` - shared navigation, household personalisation, accessible dialogs, keyboard behavior, confirmations, and undo feedback
- `assets/css/familypal-refined.css` - refined design tokens, responsive app shell, dashboard, navigation, and component overrides
- `assets/js/settings.js` - shared household settings page behavior
- `assets/js/pantrypal.js` - PantryPal app behavior extracted from `pantrypal.html`
- `assets/js/babypal.js` - BabyPal app behavior extracted from `babypal.html`
- `assets/js/chorepal.js` - ChoresPal app behavior extracted from `chorepal.html`

## Current Architecture

The app is plain HTML/CSS/JS and is intended to run as static files on GitHub Pages. Supabase provides auth and database storage. The anon key is public by design for login/signup and REST requests, but normal app data requests now attach the signed-in user's Supabase access token.

Authentication stores `fp_email`, `fp_access_token`, `fp_refresh_token`, and `fp_token_expires_at` in `localStorage`. Any legacy `fp_pass` value is cleared immediately when `familypal-core.js` loads. All app pages start a 30-minute background token refresh after login so sessions stay alive during extended idle use.

The Quagga.js barcode scanning library (~300 KB) is loaded on demand the first time the scanner is opened, not on page load.

The migration `supabase/migrations/20260612010000_enable_authenticated_rls.sql` enables Row Level Security and allows only authenticated users to manage the current shared household tables. This blocks anonymous table access, but it is not yet per-household isolation because the schema does not have household/user ownership columns.

## Refactor Path

1. Preserve current behavior.
2. Keep GitHub Pages filenames and links normalized.
3. Document the staging project.
4. Extract shared CSS and JavaScript.
5. Centralize Supabase, auth, and client helpers.
6. Refactor one app at a time: PantryPal, BabyPal, then ChoresPal.
7. Test locally before pushing to the staging repo.

## Local Testing

These files can be opened directly in a browser, or served with any static file server from the repository root. Barcode scanning generally requires a secure context, so camera testing should happen on HTTPS GitHub Pages or a local secure setup.

## Older Notes

`pantrypal-docs (2).md` contains older setup and feature notes. Treat it as historical reference until it is reviewed and merged into current documentation.
