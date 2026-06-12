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
- `assets/js/pantrypal.js` - PantryPal app behavior extracted from `pantrypal.html`

## Current Architecture

The app is plain HTML/CSS/JS and is intended to run as static files on GitHub Pages. Supabase provides auth and database storage. App pages currently use the Supabase anon key directly from the browser, so database access should be protected with safe Row Level Security policies before treating this as production-hardened.

Authentication currently preserves existing behavior by storing `fp_email` and `fp_pass` in `localStorage` for automatic login. This is a known security debt and should be replaced with Supabase session/token handling in a later refactor.

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
