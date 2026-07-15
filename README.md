# FamilyPal

FamilyPal is a private, mobile-first household organiser for pantry stock, baby care, chores and cycle tracking. It is a static web app built with plain HTML, CSS and JavaScript, with Supabase providing authentication and data storage.

**Live app:** [tyront3.github.io/FamilyPal_Next_Gen2](https://tyront3.github.io/FamilyPal_Next_Gen2/)

## What is included

- **PantryPal** — inventory, shopping lists, expiry dates, price history, barcode scanning and Open Food Facts lookup.
- **BabyPal** — feeds, diapers, sleep, pumping, health logs, trends and school-day batch entry.
- **ChoresPal** — recurring chores, shared completion, points, goals, streaks and history.
- **PeriodPal** — cycle calendar, daily logging, forecasts, medication records, analytics, import and data-quality tools.
- **Household settings** — display names, pronouns, privacy preferences, diaper-stock linking, theme and account controls.

## Architecture

FamilyPal has no framework or build step. GitHub Pages serves the files directly, and the browser talks to Supabase through its REST and Auth APIs.

| Area | Files |
| --- | --- |
| Entry and dashboard | `index.html`, `home.html` |
| Feature pages | `pantrypal.html`, `babypal.html`, `chorepal.html`, `periodpal.html` |
| Settings and utilities | `settings.html`, `priceseeder.html` |
| Shared runtime | `assets/js/familypal-core.js`, `familypal-ui.js`, `familypal-theme.js` |
| Feature logic | `assets/js/pantrypal.js`, `babypal.js`, `chorepal.js`, `periodpal.js`, `settings.js` |
| Styling | `assets/css/familypal.css`, `familypal-refined.css` |
| Database history | `supabase/migrations/` |

`index.html` is intentionally the GitHub Pages entry point and contains sign-in. A successful sign-in opens `home.html`, the authenticated dashboard.

## Local development

Serve the repository root with any static file server. For example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`. Camera-based barcode scanning requires a secure context, so test it on HTTPS or the deployed GitHub Pages site.

There is no dependency installation or compilation step.

## Supabase setup

1. Create a Supabase project.
2. Run every SQL file in `supabase/migrations/` in filename order.
3. Put the project URL and public anon key in `assets/js/familypal-core.js`.
4. Configure Supabase Auth redirect URLs for the local and GitHub Pages addresses you use.
5. Deploy the repository root through GitHub Pages.

The initial-schema migration reflects the historical starting state and is followed immediately by the authenticated-RLS migration. Do not run only the initial migration on an existing secured database.

The browser-visible anon key is expected in a static app. Never place a Supabase service-role key in this repository or in client-side JavaScript.

## Security model

- Supabase Auth manages user sessions.
- Access and refresh tokens are stored in browser `localStorage`; passwords are not stored.
- Data requests include the signed-in user's bearer token.
- Row Level Security blocks anonymous table access.
- Current policies allow any authenticated FamilyPal account to use the shared tables. The schema does not yet isolate data by household.

This is suitable for the current single-household deployment, but a multi-household version must add household ownership columns and household-scoped RLS policies.

## Verification

Run JavaScript syntax checks before committing:

```powershell
Get-ChildItem assets/js -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
```

The manual release checklist is in [MAINTAINING.md](MAINTAINING.md).

## Deployment

GitHub Pages deploys from `main` at the repository root. After changing a shared CSS or JavaScript asset, update the common `?v=` query value in every HTML page so existing installations do not reuse stale browser caches.

Application data lives in Supabase and is not changed by a GitHub Pages deployment.

## Current limitations

- No automated end-to-end test suite.
- No service worker or full offline mode; PantryPal only queues supported shopping scans.
- Page-specific CSS still lives inside some HTML files.
- Scripts use browser globals rather than ES modules.
- RLS is authenticated-wide rather than household-scoped.
