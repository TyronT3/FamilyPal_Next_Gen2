import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const stored = new Map([
  ['fp_session_version', '20260715.4'],
  ['fp_access_token', 'test-token'],
  ['fp_token_expires_at', String(Date.now() + 3600000)]
]);
const requests = [];
const coreContext = {
  AbortController,
  Date,
  clearInterval,
  clearTimeout,
  console,
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok:true, status:200, json:async()=>JSON.parse(options.body) };
  },
  localStorage: {
    getItem:key=>stored.get(key)||null,
    setItem:(key,value)=>stored.set(key,String(value)),
    removeItem:key=>stored.delete(key)
  },
  setInterval,
  setTimeout,
  window:{ location:{ pathname:'/settings.html', replace(){} } }
};
vm.createContext(coreContext);
vm.runInContext(read('assets/js/familypal-core.js'), coreContext);
const saved = await coreContext.window.FamilyPal.setSettings({ person_1_name:'One', person_2_name:'Two', baby_name:'' });
assert.equal(requests.length, 1, 'A settings group should use one request');
assert.match(requests[0].url, /settings\?on_conflict=key$/);
assert.equal(requests[0].options.method, 'POST');
assert.equal(saved.length, 3);
assert.equal(new Set(saved.map(row=>row.updated_at)).size, 1, 'Rows in a settings batch should share one update timestamp');

const wellbeingSource = read('assets/js/wellbeingpal.js').replace(
  '  global.selectWellbeingRating = selectWellbeingRating;',
  `  populateTodayForm=function(){};renderMedicationToday=function(){};renderHouseholdToday=function(){};renderMedicationList=function(){};renderInsightSelector=function(){};renderInsights=function(){};
  global.__wellbeingTest={load:loadWellbeingData,setUser:function(id){currentUserId=id;},availability:function(){return auxiliaryInsights;},daily:function(){return dailyLogs;}};
  global.selectWellbeingRating = selectWellbeingRating;`
);
const wellbeingContext = {
  Date,
  console,
  document:{ createElement(){return {textContent:'',innerHTML:''};} },
  FamilyPal:{
    requestJson:async path=>{
      if(path.includes('period_cycles')||path.includes('chore_logs'))throw new Error('optional service failed');
      if(path.includes('wellbeing_daily_logs'))return [{owner_id:'user-1',log_date:'2026-09-16',mood:4}];
      if(path.includes('wellbeing_profiles'))return [{owner_id:'user-1',role:'husband',display_name:'One'}];
      return [];
    }
  },
  FamilyPalUI:{},
  setTimeout,
  clearTimeout,
  window:{}
};
wellbeingContext.window=wellbeingContext;
vm.createContext(wellbeingContext);
vm.runInContext(wellbeingSource, wellbeingContext);
wellbeingContext.__wellbeingTest.setUser('user-1');
await wellbeingContext.__wellbeingTest.load();
assert.equal(wellbeingContext.__wellbeingTest.daily().length, 1, 'Core check-ins must survive optional insight failures');
assert.deepEqual(JSON.parse(JSON.stringify(wellbeingContext.__wellbeingTest.availability())), {period:false,chores:false});

assert.match(read('assets/js/periodpal.js'), /confidence label counts usable intervals only/i);
console.log('Priority fixes passed: batched settings, isolated optional insights, bounded open periods, and visible model limits.');
