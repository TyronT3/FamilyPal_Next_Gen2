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

assert.deepEqual(Array.from(context.EVENT_CATEGORIES), [
  'symptom', 'mood', 'sex', 'workout', 'water', 'pregnancy_test', 'other'
]);
assert.ok(context.EVENT_MOODS.length >= 10, 'Mood logging should offer a useful range of choices');
assert.ok(context.EVENT_SYMPTOMS.length >= 10, 'Symptom logging should offer a useful range of choices');
assert.ok(context.EVENT_SEX_OPTIONS.length >= 4, 'Intimacy logging should be choice-based');
assert.ok(context.EVENT_WORKOUTS.length >= 8, 'Workout logging should include common and custom workouts');

assert.equal(context.normaliseEventCategory('mood'), 'mood');
assert.equal(context.normaliseEventCategory('unknown_import_category'), 'other');
assert.equal(context.eventEditorTitle('pregnancy_test', false), 'Log pregnancy test');
assert.equal(context.eventEditorTitle('workout', true), 'Edit workout');
assert.equal(context.eventDetail({ category: 'water', label: 'Water', value_number: 500, unit: 'ml' }), '500 ml');
assert.equal(context.eventDetail({ category: 'symptom', label: 'Cramps · Fatigue' }), '2 symptoms selected');
assert.equal(context.friendlyEventTitle({ category: 'sex', label: 'Protected sex' }), 'Protected sex');

const moodChoices = context.eventChoiceMarkup('test-mood', context.EVENT_MOODS, 'Calm', false);
assert.match(moodChoices, /😊 Happy/);
assert.match(moodChoices, /data-value="Calm" aria-pressed="true"/);

const symptomChoices = context.eventChoiceMarkup('test-symptoms', context.EVENT_SYMPTOMS, 'Cramps · Fatigue', true);
assert.match(symptomChoices, /data-value="Cramps" aria-pressed="true"/);
assert.match(symptomChoices, /data-value="Fatigue" aria-pressed="true"/);

assert.match(source, /Choose Positive or Negative/);
assert.match(source, /Enter how much water you drank/);
assert.match(source, /Name your custom workout/);
assert.doesNotMatch(source, /Quick names/);

let fields = {};
let savedPayload = null;
context.document.getElementById = (id) => fields[id] || null;
context.FamilyPalUI.runBusy = async (_button, _label, callback) => callback();
context.sbFetch = async (_url, options) => {
  savedPayload = JSON.parse(options.body);
  return [];
};
context.closeModal = () => {};
context.loadData = () => {};
context.toast = () => {};

function value(input) { return { value: input }; }

async function saveCategory(category, categoryFields) {
  fields = {
    'detail-event-date': value('2026-07-16'),
    'detail-event-category': value(category),
    ...categoryFields
  };
  savedPayload = null;
  context.eventEditorState = {};
  await context.saveEvent('', null);
  assert.ok(savedPayload, `${category} should produce a saved payload`);
  return savedPayload;
}

let payload = await saveCategory('mood', { 'detail-event-label': value('Calm') });
assert.equal(payload.label, 'Calm');

payload = await saveCategory('symptom', { 'detail-event-label': value('Cramps · Fatigue') });
assert.equal(payload.label, 'Cramps · Fatigue');

payload = await saveCategory('sex', { 'detail-event-label': value('Protected sex') });
assert.equal(payload.label, 'Protected sex');

payload = await saveCategory('workout', {
  'detail-event-workout': value('Running'),
  'detail-event-workout-duration': value('30'),
  'detail-event-workout-intensity': value('Moderate')
});
assert.equal(payload.label, 'Running');
assert.equal(payload.value_number, 30);
assert.equal(payload.unit, 'min');
assert.equal(payload.severity_code, 'Moderate');

payload = await saveCategory('water', { 'detail-event-water': value('750') });
assert.equal(payload.label, 'Water');
assert.equal(payload.value_number, 750);
assert.equal(payload.unit, 'ml');

payload = await saveCategory('pregnancy_test', { 'detail-event-result': value('Positive') });
assert.equal(payload.label, 'Pregnancy test');
assert.equal(payload.value_text, 'Positive');

payload = await saveCategory('other', {
  'detail-event-label': value('Custom entry'),
  'detail-event-value-text': value('Friendly description'),
  'detail-event-value-number': value('2'),
  'detail-event-unit': value('times'),
  'detail-event-severity': value('Moderate'),
  'detail-event-code': value('custom'),
  'detail-event-raw': value('Original details')
});
assert.equal(payload.label, 'Custom entry');
assert.equal(payload.value_text, 'Friendly description');
assert.equal(payload.value_number, 2);
assert.equal(payload.unit, 'times');
assert.equal(payload.severity_code, 'Moderate');

console.log('PeriodPal guided event-editor checks passed.');
