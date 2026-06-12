# FamilyPal Next Gen

FamilyPal is a GitHub Pages household organizer backed by Supabase. This staging repo is the safe refactor workspace for the existing live FamilyPal site.

## Pages

- `index.html` - login and account creation
- `home.html` - FamilyPal app launcher
- `pantrypal.html` - PantryPal inventory, shopping, barcode scanning, and Open Food Facts lookup
- `babypal.html` - BabyPal feeds, diapers, sleep, pumping, and meal tracking
- `chorepal.html` - ChoresPal chores, points, goals, and BabyPal diaper-log integration

## Shared Assets

- `assets/js/familypal-core.js` - shared Supabase config, REST helper, auth guard, login, signup, and sign-out helpers
- `assets/js/familypal-theme.js` - shared light/dark theme persistence and toggle behavior
- `assets/js/pantrypal.js` - PantryPal app behavior extracted from `pantrypal.html`
- `assets/js/babypal.js` - BabyPal app behavior extracted from `babypal.html`
- `assets/js/chorepal.js` - ChoresPal app behavior extracted from `chorepal.html`

## Current Architecture

The app is plain HTML/CSS/JS and is intended to run as static files on GitHub Pages. Supabase provides auth and database storage. The anon key is public by design for login/signup and REST requests, but normal app data requests now attach the signed-in user's Supabase access token.

Authentication stores `fp_email`, `fp_access_token`, `fp_refresh_token`, and `fp_token_expires_at` in `localStorage`. Older saved `fp_pass` values are removed after the next successful sign-in or sign-out.

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
