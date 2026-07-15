# Maintaining FamilyPal

This guide records the current implementation contracts that are easy to break during routine changes.

## Page lifecycle

Authenticated pages follow this order:

1. `FamilyPal.requireSession()` checks for a stored session and redirects to `index.html` when none exists.
2. `FamilyPal.startTokenRefresh()` starts the shared background refresh timer.
3. The page shell becomes visible and feature data loads.
4. `FamilyPalUI.loadProfile()` applies household display names without blocking primary navigation.

Do not start profile requests before the session guard. Do not make rendering depend on optional personalisation data.

`familypal-core.js` owns authentication, token refresh, request timeouts, REST headers and session-expiry redirects. Feature files should use `FamilyPal.requestJson()` or its `sbFetch` alias instead of calling Supabase directly.

## Shared browser state

Shared keys:

| Key | Purpose |
| --- | --- |
| `fp_email` | Signed-in email shown in the UI |
| `fp_access_token` | Supabase access token |
| `fp_refresh_token` | Supabase refresh token |
| `fp_token_expires_at` | Refresh threshold |
| `fp_session_version` | One-time client-session migrations |
| `fp_theme` | Light or dark preference |

Feature keys:

| Key | Purpose |
| --- | --- |
| `pp_queue` | Pantry shopping scans awaiting sync |
| `pp_unknown` | Unrecognised barcodes |
| `pp_ticked` | Shopping-list checkmarks |
| `bp_sleep_start` | Active sleep timer |
| `bp_sleep_warn` | Long-sleep warning threshold |
| `bp_diaper_item_id` | Fallback cache for the shared diaper item |
| `periodpal_calendar_filters` | PeriodPal calendar visibility filters |

The legacy `fp_pass` key is deleted when the shared runtime loads. Never reintroduce password persistence.

## Shared settings

The `settings` table stores:

- `household_name`
- `baby_name`
- `person_1_name`
- `person_2_name`
- `baby_pronouns`
- `hide_period_details`
- `diaper_item_id`

Profile text replacement is display-only. Existing ChoresPal records use the original internal person values, so changing a display name must not rewrite historical database values.

## Cross-feature behaviour

BabyPal and ChoresPal can both decrement the PantryPal item selected as `diaper_item_id`.

When a ChoresPal diaper task is completed, it writes both a `chore_logs` record and a `baby_diapers` record. Undo must restore both the log and linked pantry stock where applicable.

Preserve these paths when changing any of the three features.

## Database migrations

Migrations are immutable history. Do not edit or delete an applied migration merely because the feature it references is old. Add a new migration for every schema or policy change.

For a fresh project, run the files in chronological filename order. The sequence currently covers:

1. Base pantry, baby and chores schema.
2. Authenticated Row Level Security.
3. Removal of the retired `mama_meals` table.
4. Shared settings and BabyPal health records.
5. Pantry unit-price support.
6. PeriodPal tables, exclusions and import history.

The current RLS model is intentionally single-household: anonymous access is blocked, but authenticated accounts share the same rows. Household isolation requires a dedicated schema and policy migration.

## UI conventions

- Keep `index.html` as the GitHub Pages entry and sign-in page.
- Use native links for page-to-page navigation.
- Use the shared bottom navigation and confirmation dialog from `familypal-ui.js`.
- Keep profile updates idempotent; the shared mutation observer must never trigger itself repeatedly.
- Show page shells before nonessential network requests finish.
- Use `FamilyPalUI.setBusy()` for async buttons and always clear busy state in `finally`.
- Keep destructive actions behind the shared confirmation dialog.
- Maintain keyboard labels, dialog roles and visible focus states.

## Cache versioning

All HTML pages reference shared assets with the same query version, for example `?v=20260715.7`. Increment it when CSS or JavaScript changes and update every HTML entry point together.

The query is only a cache key; it is not an application release number.

## Release checklist

### Static checks

```powershell
Get-ChildItem assets/js -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
git status --short
```

### Authentication and navigation

- Sign in with the form button and by pressing Enter.
- Confirm `index.html` opens `home.html` after sign-in.
- Confirm the dashboard email and card summaries render.
- Open every feature from the dashboard and bottom navigation.
- Sign out and confirm protected pages return to sign-in.
- Test once in a normal mobile tab, not only private browsing.

### Feature smoke test

- PantryPal: load, search, change stock, open shopping mode and test a supported undo.
- BabyPal: log and undo a feed or diaper; start and stop sleep.
- ChoresPal: complete and undo a normal and shared chore.
- PeriodPal: open Calendar, Today and Analytics; save one reversible entry.
- Settings: save household names, privacy and diaper-stock selection.

### Deployment

- Push `main` and wait until GitHub Pages serves the new asset query version.
- Reload the live root page and inspect the browser console for errors.
- Recheck sign-in and one data read on the deployed site.

## Known technical debt

- Introduce household and membership tables before supporting unrelated families.
- Add automated authentication/navigation and feature smoke tests.
- Continue extracting large page-specific style blocks from HTML.
- Consider ES modules only as a deliberate repository-wide migration.
- Add full offline support only with a conflict strategy for stock changes.
