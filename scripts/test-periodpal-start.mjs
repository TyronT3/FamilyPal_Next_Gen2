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
context.cycles = history.concat([{ id:'open', start_date:'2026-09-26', end_date:null }]);
context.buildModel();
assert.equal(context.isLoggedPeriod('2026-09-26'), true);
assert.equal(context.isLoggedPeriod('2026-09-27'), true, 'An unstopped period remains logged after its start');
assert.equal(context.isLoggedPeriod('2026-09-28'), true, 'An unstopped period remains logged through today');
assert.equal(context.isLoggedPeriod('2026-09-29'), false, 'A future continuation is not logged');
assert.equal(context.isPredictedPeriod('2026-09-29'), true, 'A future continuation may be predicted from average duration');
assert.equal(context.isPredictedPeriod('2026-10-01'), false);
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
const renderForecast = context.renderForecast;
const renderCalendar = context.renderCalendar;
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
assert.equal(context.isLoggedPeriod('2026-09-28'), true);
assert.equal(context.isLoggedPeriod('2026-09-29'), false);
assert.equal(context.isPredictedPeriod('2026-09-29'), true);
assert.equal(context.isPredictedPeriod('2026-10-02'), true);
assert.equal(context.isPredictedPeriod('2026-10-03'), false);
assert.equal(context.isPredictedPeriod('2026-09-28'), false);
assert.equal(context.fertilitySummary('2026-09-28').title, 'Before estimated fertile window');
assert.equal(context.fertilitySummary('2026-10-08').title, 'Inside estimated fertile window');
assert.equal(context.fertilitySummary('2026-10-12').title, 'Possible ovulation today');
assert.equal(context.fertilitySummary('2026-10-14').title, 'After estimated fertile window');
assert.equal(context.fertilitySummary('2026-11-01').title, 'Timing uncertain');
assert.equal(context.riskForDate('2026-07-15', 'none', false).level, 'unknown');
const current = context.cycles.find(c => c.id === 'new');
current.end_date = '2026-09-28';
assert.equal(context.isPredictedPeriod('2026-09-29'), false, 'Ending the period must remove continuation estimates');
current.end_date = '2026-10-02';
assert.equal(context.isLoggedPeriod('2026-09-29'), false, 'Even an entered future end must not mark future days logged');
current.end_date = null;
assert.deepEqual(renders, ['renderForecast', 'renderCalendar', 'renderToday']);
assert.equal(context.isPredictedPeriod('2026-08-26'), false);
assert.equal(context.isPredictedPeriod('2026-10-26'), true);
await context.quickStartPeriod(null);
assert.equal(writes, 1, 'Repeated click must not create a duplicate');
const nodes = new Map();
context.document = {getElementById(id) { if (!nodes.has(id)) nodes.set(id, {innerHTML:'',style:{}}); return nodes.get(id); }};
context.esc = value => String(value || '');
context.viewMonth = new Date(2026, 8, 1);
renderForecast();
renderCalendar();
context.openDay('2026-09-29');
assert.doesNotMatch(nodes.get('forecast-content').innerHTML, /Fertility and pregnancy risk/);
assert.doesNotMatch(nodes.get('forecast-content').innerHTML, /Log sex \/ contraception/);
assert.match(nodes.get('forecast-content').innerHTML, /<summary>How estimates work<\/summary>/);
assert.match(nodes.get('calendar-grid').innerHTML, /class="day predicted" onclick="openDay\('2026-09-29'\)/);
assert.match(nodes.get('calendar-grid').innerHTML, /aria-label="Tuesday, September 29, 2026, predicted period"/);
assert.doesNotMatch(nodes.get('day-content').innerHTML, /Logged period/);
assert.match(nodes.get('day-content').innerHTML, /Predicted period/);
assert.match(nodes.get('day-content').innerHTML, /Before estimated fertile window/);
assert.doesNotMatch(nodes.get('day-content').innerHTML, /Log sex \/ contraception/);
context.cycles = history.slice();
context.buildModel();
context.sbFetch = async () => { throw new Error('Save failed'); };
await context.quickStartPeriod(null);
assert.equal(context.model.nextStart, '2026-08-26', 'Failed saves must not change predictions');
console.log('PeriodPal late-start prediction checks passed.');
