import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = readFileSync(resolve(root, 'assets/js/babypal.js'), 'utf8');
const tabNames = ['today', 'history', 'trends', 'health'];
const elements = Object.fromEntries(tabNames.map((name) => [`tab-${name}`, { style: { display: '' } }]));
const tabButtons = tabNames.map(() => ({ classList: { add() {}, remove() {} } }));
const calls = [];

const context = {
  clearInterval,
  clearTimeout,
  console,
  Date,
  document: {
    createElement: () => ({ textContent: '', innerHTML: '' }),
    getElementById: (id) => elements[id] || null,
    querySelectorAll: (selector) => selector === '.tab' ? tabButtons : []
  },
  FamilyPal: {},
  FamilyPalUI: {},
  localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
  setInterval,
  setTimeout,
  window: {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'assets/js/babypal.js' });

context.loadToday = () => calls.push('today');
context.loadHistory = () => calls.push('history');
context.loadTrends = () => calls.push('trends');
context.loadHealth = () => calls.push('health');

for (const [index, name] of tabNames.entries()) {
  calls.length = 0;
  assert.doesNotThrow(() => context.switchTab(name, tabButtons[index]));
  assert.deepEqual(calls, [name]);
  for (const candidate of tabNames) {
    assert.equal(elements[`tab-${candidate}`].style.display, candidate === name ? 'block' : 'none');
  }
}

console.log('BabyPal tab-switching checks passed.');
