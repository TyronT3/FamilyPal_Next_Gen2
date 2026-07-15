# FamilyPal Next Gen Project Context

Last updated: 2026-07-15

This document is the working memory for the FamilyPal staging refactor. Read it before making changes so the staging app stays coherent and the live FamilyPal app is not accidentally affected.

## Core Rule

Work only in the GitHub-connected staging folder:

`C:\Users\hvns\Documents\GitHub\FamilyPal_Next_Gen`

Do not edit the old live folder unless explicitly asked:

`C:\Users\hvns\Desktop\Projects\FamilyPal`

The staging app is intended to become the replacement for the current live FamilyPal app after testing.

## Current Status

- Project type: plain HTML, CSS, and JavaScript.
- Hosting target: GitHub Pages.
- Backend: Supabase.
- Current git branch: `main`.
- Current staging repo was clean when this document was created.
- The user has tested the staged app repeatedly after the refactors and confirmed core behavior works.
- RLS has been enabled and tested successfully in the staging Supabase project.
- No seed/demo data should be added. The staging database may contain copied old app history for realistic testing.

## Supabase Project

Staging Supabase URL:

`https://dcevozgqpemuivhakgro.supabase.co`

The anon key is stored in `assets/js/familypal-core.js`. This is expected for a static GitHub Pages app. The anon key is public by design, but database access must be protected by Supabase Auth and Row Level Security.

Never put a Supabase service role key in this repo or in browser JavaScript.

## App Pages

- `index.html`: login and account creation page.
- `home.html`: FamilyPal launcher.
- `settings.html`: shared household settings.
- `pantrypal.html`: PantryPal app shell and PantryPal-specific inline styles.
- `babypal.html`: BabyPal app shell and BabyPal-specific inline styles.
- `chorepal.html`: ChoresPal app shell and ChoresPal-specific inline styles.

GitHub Pages expects `index.html` as the entry point.

Earlier filename mapping:

- `familypal-home.html` became `index.html`.
- `home-html.html` became `home.html`.
- `babypal (2).html` became `babypal.html`.

## Shared Assets

- `assets/css/familypal.css`: shared layout, app shell, cards, modals, buttons, tabs, light mode, and common mobile behavior.
- `assets/css/familypal-refined.css`: refined visual system and responsive overrides shared by every page.
- `assets/js/familypal-core.js`: shared Supabase config, auth, session handling, REST helper, auth guard, sign in, sign up, sign out.
- `assets/js/familypal-theme.js`: shared light/dark theme persistence and toggle behavior.
- `assets/js/familypal-ui.js`: shared bottom navigation, personalised display names, dialog accessibility, custom confirmations, and undo feedback.
- `assets/js/settings.js`: shared household settings behavior.
- `assets/js/pantrypal.js`: PantryPal behavior.
- `assets/js/babypal.js`: BabyPal behavior.
- `assets/js/chorepal.js`: ChoresPal behavior.

## Authentication And Security

Current auth behavior:

- Login happens through Supabase Auth.
- App pages call `FamilyPal.requireSession()` before loading so a stale email without a usable token does not open the app shell.
- Supabase data calls go through `sbFetch`, which is an alias for `FamilyPal.requestJson`.
- Normal data requests send the signed-in user's Supabase access token as `Authorization: Bearer <token>`.
- `localStorage` stores:
  - `fp_email`
  - `fp_access_token`
  - `fp_refresh_token`
  - `fp_token_expires_at`
  - `fp_theme`
- Any legacy `fp_pass` value is cleared immediately when `familypal-core.js` loads (not just on sign-in/out).
- All app pages call `FamilyPal.startTokenRefresh()` after `requireSession()` succeeds, which refreshes the access token every 30 minutes in the background so idle sessions stay alive.

Important limitation:

- RLS currently blocks anonymous table access.
- Any authenticated FamilyPal user can still access the shared household tables.
- The schema does not yet isolate rows by household or user.
- A future stronger security pass should add household/user ownership columns and tighten RLS around those columns.

Supabase Auth settings to keep checked:

- Authentication URL configuration should allow the GitHub Pages staging URL.
- Add redirect URLs for the staging site if Supabase requires them.

## Supabase Migrations

Migrations live in `supabase/migrations`.

### Initial Schema

`supabase/migrations/20260612000000_initial_schema.sql`

Creates the current tables and indexes. It intentionally contains no seed data.

Important: this migration ends by disabling RLS because it was written before the token/RLS security pass. Do not rerun only this file on an existing secured database, because it will turn RLS off.

For a fresh database, run migrations in order:

1. `20260612000000_initial_schema.sql`
2. `20260612010000_enable_authenticated_rls.sql`

### RLS Security Migration

`supabase/migrations/20260612010000_enable_authenticated_rls.sql`

This migration:

- Enables RLS on all current FamilyPal data tables.
- Revokes table access from `anon`.
- Grants select, insert, update, and delete to `authenticated`.
- Adds permissive authenticated policies for the current single-household app.

This is tested and working in staging.

## Database Tables

PantryPal:

- `categories`
- `items`
- `history`

BabyPal:

- `baby_feeds`
- `baby_diapers`
- `baby_sleep`
- `baby_pumping`
- `baby_health`

Shared:

- `settings`

ChoresPal:

- `chores`
- `chore_logs`
- `chore_goals`

Intentionally not included:

- `baby_crying`, because that feature was disabled and is not needed in the current app.

## Cross-App Behavior

ChoresPal can write diaper logs into BabyPal.

Relevant pieces:

- `chores.babypal_link` can be `diaper`.
- When completing a linked diaper chore, ChoresPal writes to:
  - `chore_logs`
  - `baby_diapers`
- BabyPal's Today view reads `baby_diapers` by today's `logged_at` range, so ChoresPal-created diaper logs should appear there.

This behavior was previously fixed and tested.

## PantryPal Features

PantryPal currently supports:

- Pantry item cards.
- Search.
- Status filters: all, stocked, low, open, empty, expiring, priority.
- Clickable stat chips: stocked, low, open, empty, total.
- Category grouping.
- Add/edit/delete pantry items.
- Quantity tracking:
  - `qty_stocked`
  - `qty_open`
  - `min_stock`
- Item expiry tracking.
- Priority items.
- Item rating:
  - `unsure`
  - `love`
  - `hate`
- Unit of measure.
- Quick actions:
  - bought one more
  - open one
  - finished one
- Quick inventory modal.
- Priority modal.
- Category manager.
- Category rename and merge tools.
- Table view.
- Pantry reports with price-aware history summaries and CSV export.
- Shopping mode.
- Shopping mode ticked items stored in `localStorage` as `pp_ticked`.
- Shopping mode reset ticks.
- Offline shopping scan queue stored in `localStorage` as `pp_queue`.
- Unknown scans stored in `localStorage` as `pp_unknown`.
- Barcode scanning with QuaggaJS (lazy-loaded on first scan, not on page load).
- Barcode product lookup with Open Food Facts.
- Offline shopping scan queue syncs concurrently (batch stock PATCHes + single history insert) on reconnect.

Known testing note:

- Camera/barcode scanning generally requires HTTPS. Test camera features on GitHub Pages or another secure context.

## BabyPal Features

BabyPal currently supports:

- Today view.
- History view.
- Trends view.
- Bottle feeds.
- Breast feeds.
- Diapers.
- Sleep sessions.
- Pumping.
- Health tracking for temperature, weight, medicine, and health notes.
- Undo for recent BabyPal logs.
- Quick time presets for feed, diaper, pumping, and health logs.
- Sleep timer state stored locally as `bp_sleep_start`.
- Sleep warning preference stored locally as `bp_sleep_warn`.
- Diaper logs can decrement a selected PantryPal diaper item stored in Supabase `settings` as `diaper_item_id`.

Disabled/omitted:

- Baby crying tracking.

## ChoresPal Features

ChoresPal currently supports:

- Today tab.
- Goals tab.
- History tab.
- Setup tab.
- Daily, weekly, monthly, and once-off chores.
- Chore assignments:
  - Tyron
  - Ansonette
  - rotating
- Points and score calculations.
- Shared chores with `completed_by_2`.
- Goal tracking for weekly/monthly goals.
- Current chore streak cards.
- Starter chores.
- Soft delete for chores by setting `active=false`.
- BabyPal diaper linked chores.

Previously fixed:

- Chore cards should not show both tick marks unless both people have completed/shared the chore for the day.

## Design And UX Direction

The goal is one cohesive FamilyPal suite, not three unrelated apps behind a launcher.

Current design direction:

- Shared app shell across pages.
- Shared CSS variables.
- Light/dark theme support.
- Mobile-first improvements.
- Avoid large marketing-style landing pages.
- Keep the first screen useful.
- Controls should be tappable and not cramped on mobile.

Recent PantryPal usability improvements:

- Mobile filters use a compact grid instead of squashing.
- Search has a clear button.
- Stat chips act as filters.
- Shopping Mode has Reset Ticks.
- Empty search/filter results show more useful text.

## Local Storage Keys

Shared:

- `fp_email`
- `fp_access_token`
- `fp_refresh_token`
- `fp_token_expires_at`
- `fp_theme`

Legacy cleanup:

- `fp_pass` is cleared on every `familypal-core.js` load. No manual cleanup needed.

PantryPal:

- `pp_queue`
- `pp_unknown`
- `pp_ticked`

BabyPal:

- `bp_sleep_start`
- `bp_sleep_warn`
- `bp_diaper_item_id` may exist as an old local cache; the active shared value is `settings.key='diaper_item_id'`.

Shared Supabase settings:

- `diaper_item_id`
- `household_name`
- `baby_name`
- `person_1_name`
- `person_2_name`

## Safe Testing Checklist

Use this checklist before committing behavior changes.

Login and navigation:

- Open `index.html`.
- Sign in by clicking Sign In.
- Sign in by pressing Enter in the password field.
- Confirm redirect to `home.html`.
- Open PantryPal, BabyPal, and ChoresPal without logging in again.
- Sign out and confirm protected app pages require login again.

Theme:

- Toggle light/dark mode.
- Confirm the choice persists between apps.

PantryPal:

- Load items.
- Search items.
- Clear search.
- Tap stat chips and filter buttons.
- Add an item.
- Edit an item.
- Use quick actions on an item card.
- Use Quick Inventory.
- Use Priority Items.
- Use Category Manager.
- Use Table View and save a row.
- Open Shopping Mode.
- Tick shopping items.
- Reset shopping ticks.
- Share/print shopping list if needed.
- Test barcode scanning only on HTTPS.

BabyPal:

- Log a bottle feed.
- Log a breast feed.
- Log wet and soiled diapers.
- Confirm the selected PantryPal diaper item decreases by 1 per diaper log.
- Log pumping.
- Start and stop a sleep session.
- Confirm Today, History, and Trends views update.

ChoresPal:

- Complete a normal chore.
- Complete a shared chore.
- Undo a chore log.
- Add/edit/soft-delete a chore in Setup.
- Create a weekly/monthly goal.
- Complete a BabyPal-linked diaper chore.
- Confirm the diaper appears in BabyPal Today and History.
- Confirm the selected PantryPal diaper item decreases by 1 for linked diaper chores.

Security:

- Confirm data still loads after RLS is enabled.
- Confirm anonymous app data requests do not work when logged out.
- Confirm no password is stored in `localStorage` as `fp_pass` after sign-in.

Mobile:

- Test each app at phone width.
- Confirm top actions wrap or remain usable.
- Confirm no button text is crushed.
- Confirm modals fit and scroll.
- Confirm important actions are reachable with one hand.

## Before Commit

Recommended quick checks:

```powershell
& 'C:\Users\hvns\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check assets\js\familypal-core.js
& 'C:\Users\hvns\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check assets\js\pantrypal.js
& 'C:\Users\hvns\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check assets\js\babypal.js
& 'C:\Users\hvns\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check assets\js\chorepal.js
```

If Codex cannot find `git` on PATH, use:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
```

Note: the exact Node path may vary by machine/session. In this Codex workspace it has been available under the Codex runtime cache.

## Deployment Notes

Normal workflow:

1. Make changes in staging repo.
2. Test locally or on GitHub Pages staging.
3. Commit changes.
4. Push to GitHub.
5. Wait for GitHub Pages to update.
6. Test the deployed staging page.

For schema/security changes:

1. Deploy compatible frontend code first.
2. Wait for GitHub Pages to update.
3. Test login and basic data reads/writes.
4. Run the SQL migration in Supabase.
5. Retest all apps.

Do not enable stricter database policies before the frontend sends the correct auth token.

## Known Technical Debt

- RLS is authenticated-only, not per-household.
- Supabase config is still a browser-visible static config, which is normal for anon key usage but needs RLS to stay safe.
- HTML files still contain a lot of page-specific inline CSS.
- App JS files are plain global scripts, not modules.
- There is no automated browser test suite.
- There is no build process.
- Some older docs may be outdated.
- Some old text encoding artifacts may still exist in files that were created before the refactor.

## Future Improvement Ideas

Security:

- Add `households`, `household_members`, and ownership columns.
- Change RLS from authenticated-wide to household-scoped.
- Add admin/member roles if this becomes multi-family.
- Review Supabase Auth redirect URLs before production move.

Cohesion:

- Continue moving duplicated page-specific CSS into `assets/css/familypal.css`.
- Standardize app headers and action menus.
- Improve mobile navigation with consistent overflow/menu behavior.

PantryPal:

- Improve barcode flows and unknown item handling.
- Add bulk edit or import/export.
- Add better expiry and low-stock dashboards.
- Add optional price history insights.

BabyPal:

- Make it easier to extract as a standalone school/daycare tracker later.
- Add child/classroom abstraction only if it becomes standalone.
- Add caregiver/user attribution for school usage.

ChoresPal:

- Improve recurring chore logic.
- Add clearer weekly/monthly summaries.
- Add better shared chore completion UX.

Offline support (scoped, not yet started):

- BabyPal and ChoresPal are mostly append-only logs — easy to queue offline and sync on reconnect.
- PantryPal stock quantities are read-modify-write — need delta tracking (+1/-1) instead of absolute values to avoid conflicts when both phones edit the same item offline.
- Estimated effort: ~1 week for a good-enough family app version (no full conflict resolution); ~3 weeks for a solid implementation with service worker and proper conflict handling.
- Decision: hold off until needed. Design doc saved in Claude memory.

Docs:

- Replace or absorb `pantrypal-docs (2).md` after reviewing it.
- Keep this file current after major decisions.

## Do Not Break

- GitHub Pages filenames and links.
- Shared login/session persistence between apps.
- RLS-authenticated data access.
- ChoresPal to BabyPal diaper logging.
- PantryPal barcode scanning and Open Food Facts lookup.
- Existing imported staging data.
- No-seed-data policy.
- The ability to test changes before committing.

## Latest PeriodPal Session — 2026-07-14

Completed in this session:

- Simplified PeriodPal navigation to Calendar, Today, and Analytics.
- Moved reporting, timeline, import/export, and cleanup tools into Analytics.
- Added a Today summary with the current cycle day/phase and editable entries already logged today.
- Added a Data Quality Centre for duplicate period starts, suspicious measurements, hidden code-only imports, and excluded ranges.
- Added a late-period assistant that appears after the estimated period date. It shows days late, relevant fertile-window risk notes, recent pregnancy tests, and quick actions to log a test or start the period. It deliberately presents estimates rather than medical conclusions.
- Improved medication tracking by loading medication definitions, showing active medicines on Today, adding one-tap Taken/Missed updates, and allowing new manual medication logs with Taken/Missed/Skipped statuses.

Implementation notes:

- The late-period assistant uses the existing frontend cycle model and existing `period_events` pregnancy-test records; no schema migration was needed.
- Medication tracking uses the existing `period_medication_definitions` and `period_medication_logs` tables; no schema migration was needed.
- Medication definitions active on the current date are treated as today's medicines. If definitions are absent, distinct names from historical medication logs are offered as fallbacks.
- PeriodPal remains plain global JavaScript in `assets/js/periodpal.js` with page markup/styles in `periodpal.html`.

Good candidates for the next session:

1. Add a separate privacy PIN/app lock for PeriodPal. This needs a deliberate security design; do not present a frontend-only PIN as strong encryption.
2. Add symptom-pattern insights by cycle day, but only show a pattern after enough observations exist.
3. Add pregnancy mode to pause ordinary period forecasts after a confirmed positive test, followed later by a conservative postpartum recovery mode.
4. Add human-readable CSV export alongside the existing JSON backup.
5. Consider proper medication schedules/reminder times if the current daily active-medication assumption is too broad.

Next-session verification:

- Test PeriodPal on the deployed GitHub Pages staging site after the 2026-07-14 push.
- Confirm Today loads medication definitions from Supabase and that Taken/Missed updates the existing same-day record rather than creating duplicates.
- Confirm a pregnancy-test entry created from the late-period assistant appears in Today, Timeline, and pregnancy-related Analytics reports.
