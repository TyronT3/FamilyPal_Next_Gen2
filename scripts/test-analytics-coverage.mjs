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
  new Set(['2026-07-01', '2026-07-03']),
  babyContext.localDateKey,
  row => row.logged_at,
  () => 1
);
assert.deepEqual(Array.from(babySeries, day => day.state), ['complete', 'partial', 'complete', 'unknown']);
assert.deepEqual(Array.from(babySeries, day => day.val), [2, 1, 0, null]);

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
assert.match(readFileSync(resolve(root, 'babypal.html'), 'utf8'), /id="baby-tracking-status"/);
assert.match(readFileSync(resolve(root, 'pantrypal.html'), 'utf8'), /Finish inventory check/);

console.log('BabyPal and PantryPal analytics coverage checks passed.');
