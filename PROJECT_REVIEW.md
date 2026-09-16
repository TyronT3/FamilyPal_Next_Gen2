# FamilyPal review — 16 September 2026

This was a source review of the shared runtime, page shells and feature scripts, with deeper work on PeriodPal. Browser checks used synthetic records on localhost. No production records were changed, and authenticated end-to-end workflows were not exercised against the live database.

## Implemented

### PeriodPal

- Renamed “Insights & Cleanup” to “Insights”. Reports default to the last six months; the reporting range can be changed. Duplicate starts are collapsed for period counts and symptom/flow summaries.
- Moved import audits, duplicate cleanup, old measurement and medication reviews, prediction diagnostics and historical pregnancy analysis into collapsed sections under **Data → History maintenance**. These are optional tools, not a checklist that must be cleared. No history was deleted.
- Timeline defaults to 90 days, supports all history, and offers additional batches of 100 entries. Old notes remain accessible without overwhelming the daily view.
- Hid the repeated forecast panel on Analytics so reports appear nearer the top of the screen.
- Fixed month navigation skipping months from dates such as January 31. Calendar dates are keyboard-accessible buttons.
- Fixed pregnancy-test text parsing: “not pregnant” is negative; an arbitrary digit `1` does not mean positive; conflicting text is left unclassified. This changes record interpretation, not the clinical prediction model.
- Paginated PeriodPal history reads instead of relying on one server-limited response. Cycles and intimacy older than the previous loading window are now accessible. Prediction eligibility remains limited to recent, confirmed, non-prediction cycles.
- Backup exports now fetch every PeriodPal table from the server, including medication definitions, rather than exporting only loaded arrays. Failed reads prevent a success download.
- Added native FamilyPal backup restore. It validates record IDs and adds missing records by their existing IDs, leaving current records untouched. Repeating a restore is safe; it is not a rollback of edits. This also accepts the previous export shape, but cannot recover history omitted from an older backup.

### Other features

- ChoresPal date grouping now uses local calendar dates rather than UTC, preventing near-midnight records from being grouped under yesterday.
- Home quick-log timestamps now combine the selected time with the local date.
- BabyPal’s original school-day form uses the local date. Overnight sleep entries now advance the end timestamp as well as calculating a positive duration.
- JournalPal discards pending read/decryption results when the vault was locked or its key changed, preventing a late result from repopulating cleared plaintext.

## Remaining priorities

| Priority | Area | Finding and suggested next step |
| --- | --- | --- |
| High | PantryPal / shared nappy stock | Stock updates read a quantity and then write a replacement. Two devices can overwrite each other's decrements. Use atomic database operations and transactionally link stock history to changes. This requires a migration and deployment, not just UI edits. |
| High | PantryPal offline shopping | Queue entries store absolute quantities. Synchronising later can overwrite newer stock, and collapsing several queued operations loses individual purchase history. Replace this with uniquely identified quantity-change operations and transactional replay. |
| Medium | BabyPal original School Day form | Its multi-request save can partially succeed; retrying can duplicate successful entries. The new paper grid has stable-ID retry handling, but the original form needs the same approach. |
| Medium | Cross-feature reports | BabyPal, ChoresPal, PantryPal, WellbeingPal and JournalPal still have bounded or unpaginated queries in places. Pantry reports explicitly cap history at 500 rows. PeriodPal is fixed; a shared pagination API and explicit coverage labels should follow. |
| Medium | WellbeingPal | Core check-ins and auxiliary cycle/chore insights load in one `Promise.all`. A failed auxiliary query can prevent the screen from loading. Isolate optional data and show which associations are unavailable. |
| Medium | PeriodPal model | Confidence currently reflects sample count, not cycle variability or recency. Intervals outside 18–45 days are omitted, period lengths are clamped, and the fallback is 28 days. These limitations should be visible; any change to the medical estimation assumptions deserves separate validation. |
| Medium | PeriodPal historical interpretation | An old period without an end date can still appear ongoing. Historical intimacy is assessed using the current model. Retrospective pregnancy-event ranking should not be presented as proof of causation. The latter is now out of the main Insights view. |
| Medium | BabyPal reporting | School-only logging cannot estimate unseen home changes. Feed heatmap darkness reflects recording frequency, not a complete daily routine. Average sleep start combines morning/afternoon/night sessions and discards minutes; separate nap/time groups would be more meaningful. |
| Medium | Settings | Settings fields save in independent requests. A failure can leave a partial update; a single upsert batch would provide clearer all-or-nothing behaviour. |
| Low | UI consistency | Some dynamically rendered history cards still rely on clickable containers; convert these to labelled buttons/links. Report sample sizes and date ranges should be consistent across features. |

## Verification

- Existing regression suite retained.
- Added tests for month boundaries, pregnancy-result parsing, capped-page pagination, full-table backup collection, validated/repeated restore and local chore dates.
- Added an asynchronous JournalPal lock/decryption regression test.
- Browser checks verified the simplified PeriodPal report, collapsed maintenance tools, recent timeline and access to an old sample note via **All history**.
- No changes to authentication, RLS, journal encryption algorithms or database schema.

## Suggested next reporting improvements

1. Show sample counts alongside every average and label “recorded” totals consistently.
2. Add PeriodPal symptom frequency by cycle phase with a minimum sample threshold and an explicit unknown/unlogged category.
3. Separate school and home BabyPal patterns; compare similar time windows instead of treating school records as a whole day.
4. Provide a focused PeriodPal summary export with selected dates, cycle lengths and reported symptoms, keeping technical import diagnostics separate.
5. After data integrity work, add authenticated smoke tests in a dedicated test household, rather than writing test data to the live household.
