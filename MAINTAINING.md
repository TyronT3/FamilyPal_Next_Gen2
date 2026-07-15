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

JournalPal deliberately stores neither its passphrase nor its unwrapped vault key in browser storage. The key exists only in memory while `journalpal.html` is unlocked and is discarded on lock, inactivity or page exit.

## Shared settings

The `settings` table stores:

- `household_name`
- `baby_name`
- `person_1_name`
- `person_2_name`
- `baby_pronouns`
- `hide_period_details`
- `diaper_item_id`
- `period_comfort_item_ids` — JSON array of existing PantryPal item IDs selected for near-period stock reminders

Profile text replacement is display-only. Existing ChoresPal records use the original internal person values, so changing a display name must not rewrite historical database values.

## Cross-feature behaviour

BabyPal and ChoresPal can both decrement the PantryPal item selected as `diaper_item_id`.

PeriodPal reads `period_comfort_item_ids` separately from its core cycle queries. Keep that lookup non-blocking: a PantryPal or settings failure must not prevent the calendar, forecasts or daily logging from loading. Comfort-supply reminders are advisory and must never change stock automatically.

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
7. Per-user JournalPal vaults and encrypted entry storage.
8. Shared structured WellbeingPal profiles, daily logs, household context and medication adherence.

The current RLS model is intentionally single-household: anonymous access is blocked, but authenticated accounts share the same rows. Household isolation requires a dedicated schema and policy migration.

JournalPal does not follow the shared-table model. `journal_vaults` and `journal_entries` must remain scoped to `(select auth.uid()) = owner_id`. Never replace those policies with authenticated-wide access.

WellbeingPal follows the user's explicit single-household sharing rule: both authenticated accounts may read structured wellbeing data, but only the owner may change their profile, daily logs or medication data. `wellbeing_household_context` is intentionally shared for both reading and writing.

## WellbeingPal data contract

- Keep mood, energy, stress, sleep quality, movement and symptoms structured; do not add a notes or free-writing column.
- Send all prose about feelings to JournalPal, where it remains encrypted and excluded from insights.
- Keep medication names, dosage and adherence structured and shared between household accounts.
- Use separate Supabase Auth accounts to associate check-ins with husband and wife roles.
- Insights may read structured WellbeingPal, PeriodPal and ChoresPal data, but must never query `journal_vaults` or `journal_entries`.
- Keep dynamic WellbeingPal output inside `[data-no-personalize]` so already-resolved account names are not processed as legacy profile tokens.
- Present personal comparisons as associations, not causes or medical diagnoses, and require minimum sample sizes before showing them.

## JournalPal encryption contract

- Encrypt only JournalPal payloads; do not silently extend journal encryption to any other FamilyPal table.
- Use a random 256-bit vault key for entries and AES-GCM with a new random 96-bit IV for every encryption.
- Wrap the vault key with AES-GCM using a key derived from the journal passphrase by PBKDF2-HMAC-SHA256 at 600,000 iterations and a random 128-bit salt.
- Keep entry titles, entry dates and bodies together inside the encrypted JSON payload.
- Bind entry ciphertext to its row ID using authenticated additional data.
- Never store, log, transmit or add recovery for the journal passphrase or unwrapped vault key without an explicit security redesign.
- Keep `[data-private-content]` excluded from shared profile text replacement so journal text is never modified after decryption.
- Separate journals require separate Supabase Auth accounts. Shared sign-in credentials cannot identify two people securely.

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

All HTML pages reference shared assets with the same query version, for example `?v=20260715.12`. Increment it when CSS or JavaScript changes and update every HTML entry point together.

The query is only a cache key; it is not an application release number.

## Release checklist

### Static checks

```powershell
npm test
git diff --check
git status --short
```

`npm test` has no external dependencies. GitHub Actions runs the same command for every push and pull request.

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
- JournalPal: create or unlock a test vault, save/edit/delete an entry, lock it, confirm a wrong passphrase fails, and verify the database contains ciphertext only.
- WellbeingPal: connect each account to the correct role, save both daily check-ins, update household context, log medication status and review each person's Insights.
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
