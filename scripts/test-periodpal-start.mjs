import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({
  Date, window: {}, localStorage: { getItem: () => null },
  FamilyPalUI: { runBusy: async (_button, _label, callback) => callback() }
});
vm.runInContext(readFileSync(new URL('../assets/js/periodpal.js', import.meta.url), 'utf8'), context);
context.todayKey = () => '2026-09-28';
const history = [
  { id: 'one', start_date: '2026-07-01', end_date: '2026-07-05' },
  { id: 'two', start_date: '2026-07-29', end_date: '2026-08-02' }
];
context.cycles = history.slice();
context.buildModel();
assert.equal(context.model.nextStart, '2026-08-26');
let writes = 0;
context.sbFetch = async (_url, options) => {
  writes++;
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Prefer, 'return=representation');
  return [{ id: 'new', ...JSON.parse(options.body) }];
};
const renders = [];
for (const name of ['renderForecast', 'renderCalendar', 'renderToday']) {
  context[name] = () => { renders.push(name); assert.equal(context.model.lastStart, '2026-09-28'); };
}
context.activeTab = 'log';
context.toast = () => {};
context.openCycleModal = () => {};
context.loadData = () => { throw new Error('Unrelated data reload must not block predictions'); };
await context.quickStartPeriod(null);
assert.equal(context.model.lastStart, '2026-09-28');
assert.equal(context.model.avgCycle, 28, 'Long gap must not prevent anchoring on the new start');
assert.equal(context.model.nextStart, '2026-10-26');
assert.equal(context.model.ovulation, '2026-10-12');
assert.equal(context.model.fertileStart, '2026-10-07');
assert.equal(context.model.fertileEnd, '2026-10-13');
assert.deepEqual(renders, ['renderForecast', 'renderCalendar', 'renderToday']);
assert.equal(context.isPredictedPeriod('2026-08-26'), false);
assert.equal(context.isPredictedPeriod('2026-10-26'), true);
await context.quickStartPeriod(null);
assert.equal(writes, 1, 'Repeated click must not create a duplicate');
context.cycles = history.slice();
context.buildModel();
context.sbFetch = async () => { throw new Error('Save failed'); };
await context.quickStartPeriod(null);
assert.equal(context.model.nextStart, '2026-08-26', 'Failed saves must not change predictions');
console.log('PeriodPal late-start prediction checks passed.');
