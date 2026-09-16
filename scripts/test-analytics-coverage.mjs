import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function browserContext() {
  const context = {
    clearInterval,
    clearTimeout,
    console,
    Date,
    document: {
      createElement: () => ({ textContent: '', innerHTML: '' }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    FamilyPal: {},
    FamilyPalUI: {},
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    setInterval,
    setTimeout,
    window: { addEventListener() {}, location: { search: '' } }
  };
  context.window.window = context.window;
  return context;
}

const babyContext = browserContext();
babyContext.window = babyContext;
babyContext.addEventListener = () => {};
vm.createContext(babyContext);
vm.runInContext(readFileSync(resolve(root, 'assets/js/babypal.js'), 'utf8'), babyContext, { filename: 'assets/js/babypal.js' });

const babyDays = [new Date(2026, 6, 1, 12), new Date(2026, 6, 2, 12), new Date(2026, 6, 3, 12), new Date(2026, 6, 4, 12)];
const babyRows = [
  { logged_at: new Date(2026, 6, 1, 8).toISOString() },
  { logged_at: new Date(2026, 6, 1, 12).toISOString() },
  { logged_at: new Date(2026, 6, 2, 9).toISOString() }
];
const babySeries = babyContext.buildObservedDaySeries(
  babyDays,
  babyRows,
  babyContext.localDateKey,
  row => row.logged_at,
  () => 1
);
assert.deepEqual(Array.from(babySeries, day => day.state), ['logged', 'logged', 'unknown', 'unknown']);
assert.deepEqual(Array.from(babySeries, day => day.val), [2, 1, null, null]);
assert.equal(babyContext.estimateRecordedDiaperUsage(babySeries).average, 1.5);
assert.equal(babyContext.estimateRecordedDiaperUsage(babySeries).days, 2);
// Legacy completion flags must not prefer one day over another or turn gaps into zero usage.
const mixedDays = [{state:'complete',val:8},{state:'partial',val:4},{state:'unknown',val:null},{state:'unknown',val:null}];
assert.equal(babyContext.estimateRecordedDiaperUsage(mixedDays).average, 6);
assert.equal(babyContext.estimateRecordedDiaperUsage(mixedDays).days, 2);
assert.equal(babyContext.estimateRecordedDiaperUsage([{val:null}]).average, null);
assert.equal(babyContext.estimateRecordedDiaperUsage([{val:4}]).average, 4);

const at = (day, hour, minute = 0) => new Date(2026, 6, day, hour, minute).toISOString();
const schoolNote = 'School paper • 2026-07-01';
const comparison = babyContext.buildSchoolHomeComparison(
  [
    { feed_type:'bottle', logged_at:at(1,8), notes:schoolNote },
    { feed_type:'bottle', logged_at:at(2,9), notes:'School day form • 2026-07-02' },
    { feed_type:'bottle', logged_at:at(1,10), notes:null }, // excluded: tagged school date
    { feed_type:'bottle', logged_at:at(3,11), notes:null }
  ],
  [
    { logged_at:at(1,12), notes:schoolNote },
    { logged_at:at(2,12), notes:'School day form • 2026-07-02' },
    { logged_at:at(3,13), notes:null },
    { logged_at:at(4,18), notes:null } // excluded: outside the comparable window
  ],
  [
    { sleep_start:at(1,8), sleep_end:at(1,9), notes:schoolNote },
    { sleep_start:at(3,6,30), sleep_end:at(3,7,30), notes:null }
  ]
);
assert.equal(comparison.school.days,2);
assert.equal(comparison.school.bottlesPerDay,1);
assert.equal(comparison.school.diapersPerDay,1);
assert.equal(comparison.school.sleepMinutes,60);
assert.equal(comparison.home.days,1);
assert.equal(comparison.home.bottles,1);
assert.equal(comparison.home.sleepMinutes,30);

const pantryContext = browserContext();
pantryContext.window.window = pantryContext.window;
vm.createContext(pantryContext);
vm.runInContext(readFileSync(resolve(root, 'assets/js/pantrypal.js'), 'utf8'), pantryContext, { filename: 'assets/js/pantrypal.js' });

const pantryItems = [{ id: 'milk', name: 'Milk', qty_stocked: 2, qty_open: 0, min_stock: 1 }];
const pantrySnapshots = [
  { item_id: 'milk', snapshot_date: '2026-07-01', captured_at: '2026-07-01T06:00:00Z', qty_stocked: 9, qty_open: 1 },
  { item_id: 'milk', snapshot_date: '2026-07-05', captured_at: '2026-07-05T06:00:00Z', qty_stocked: 6, qty_open: 1 }
];
const pantryHistory = [{ date: '2026-07-03T10:00:00Z', item: pantryItems[0], action: 'Bought 1 more (shop)' }];
const forecasts = pantryContext.buildPantrySnapshotForecasts(pantryItems, pantrySnapshots, pantryHistory);
assert.equal(forecasts.length, 1);
assert.equal(forecasts[0].estimatedUsed, 4);
assert.equal(forecasts[0].observedDays, 4);
assert.equal(forecasts[0].daysLeft, 1);
assert.equal(pantryContext.buildPantrySnapshotForecasts(pantryItems, [], pantryHistory).length, 0);

const migration = readFileSync(resolve(root, 'supabase/migrations/20260716120000_add_analytics_observation_markers.sql'), 'utf8');
assert.match(migration, /create table if not exists public\.baby_tracking_days/i);
assert.match(migration, /create table if not exists public\.pantry_inventory_snapshots/i);
const babySource = readFileSync(resolve(root, 'assets/js/babypal.js'), 'utf8');
assert.doesNotMatch(babySource, /baby_tracking_days|day-complete-btn|toggleTodayTracking/);
const schoolSaveSource = babySource.slice(babySource.indexOf('async function saveSchoolDay'), babySource.indexOf('// ── Modal helpers'));
assert.match(schoolSaveSource, /School day form/);
assert.match(schoolSaveSource, /consumeDiaperStock\('BabyPal school day'\)/);
assert.match(readFileSync(resolve(root, 'pantrypal.html'), 'utf8'), /Finish inventory check/);

console.log('BabyPal and PantryPal analytics coverage checks passed.');
