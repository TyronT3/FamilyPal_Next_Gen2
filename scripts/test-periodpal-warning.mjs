import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = readFileSync(resolve(root, 'assets/js/periodpal.js'), 'utf8');

function createEscapingElement() {
  let value = '';
  return {
    set textContent(next) { value = String(next ?? ''); },
    get innerHTML() {
      return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }
  };
}

const context = {
  clearTimeout,
  console,
  Date,
  document: { createElement: createEscapingElement },
  FamilyPal: {},
  FamilyPalUI: {},
  localStorage: { getItem: () => null, removeItem: () => {}, setItem: () => {} },
  setTimeout,
  window: {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'assets/js/periodpal.js' });

context.todayKey = () => '2026-07-15';
context.model.nextStart = '2026-07-18';

context.comfortSupplies = null;
assert.equal(context.comfortSupplyWarning(), '');

context.comfortSupplies = [];
assert.match(context.comfortSupplyWarning(), /Choose supplies/);

context.comfortSupplies = [{ name: '<Pads>', qty_stocked: 0, qty_open: 0, min_stock: 1 }];
const warning = context.comfortSupplyWarning();
assert.match(warning, /Comfort supplies running low/);
assert.match(warning, /&lt;Pads&gt; — out/);

context.comfortSupplies = [{ name: 'Pads', qty_stocked: 2, qty_open: 0, min_stock: 1 }];
assert.match(context.comfortSupplyWarning(), /Comfort supplies ready/);

context.model.nextStart = '2026-08-01';
assert.equal(context.comfortSupplyWarning(), '');
assert.deepEqual(Array.from(context.parseComfortSupplyIds('not-json')), []);

console.log('PeriodPal comfort-supply warning checks passed.');
