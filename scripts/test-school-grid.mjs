import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const elements=new Map();
const storage=new Map();
const c={Date,Number,JSON,Object,crypto:{randomUUID},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',style:{},focus(){}});return elements.get(id);}},toast(){},activeTab:'trends',FamilyPalUI:{runBusy:async(b,t,fn)=>fn(),confirm:async()=>true}};
vm.createContext(c);vm.runInContext(readFileSync(new URL('../assets/js/babypal-school-grid.js',import.meta.url),'utf8'),c);
const day={milk:[16,22],diapers:{18:'wet',24:'soiled'},sleep:[19,20,21,27],ml:''};
const rows=c.paperRows(day,'2026-01-09');
assert.equal(rows.baby_feeds[0].amount_ml,null);
assert.equal(rows.baby_diapers[1].diaper_type,'soiled');
assert.match(rows.baby_diapers[0].notes,/^School paper • 2026-01-09$/);
assert.deepEqual(Array.from(rows.baby_sleep,s=>s.duration_mins),[90,30]);
assert.equal(new Date(rows.baby_sleep[0].sleep_start).getHours(),9);
assert.equal(new Date(rows.baby_sleep[0].sleep_start).getMinutes(),30);
assert.equal(new Date(rows.baby_sleep[0].sleep_end).getHours(),11);
assert.throws(()=>c.paperRows({...day,ml:'-1'},'2026-01-09'),/Bottle amount/);
assert.throws(()=>c.paperRows(day,'2999-01-09'),/valid date/);
assert.equal(c.paperRows({...day,ml:'120'},'2026-01-09').baby_feeds[0].amount_ml,120);
c.paperState={version:1,date:'2026-01-09',days:{'2026-01-09':structuredClone(day)},saved:[]};
c.paperToggle('diapers',18);assert.equal(c.paperDay().diapers[18],'soiled');
c.paperToggle('diapers',18);assert.equal(c.paperDay().diapers[18],undefined);
c.paperNext();assert.equal(c.paperState.date,'2026-01-12');
c.paperDateChange('2026-01-09');assert.equal(c.paperDay().milk.length,2);
// Simulate a response lost after an insert. A reload/retry must reuse the same IDs.
const inserted=new Map();let fail=true,posts=0;
c.paperDay().diapers[18]='wet';
let stockCalls=0,stockFailure=true;
c.consumeDiaperStock=async()=>{stockCalls++;if(stockFailure&&stockCalls===2)return {failed:true};return {changed:true};};
c.sbFetch=async(url,opts)=>{
  if(!opts)return [];
  posts++;
  assert.match(opts.headers.Prefer,/ignore-duplicates/);
  const payload=JSON.parse(opts.body);
  for(const row of payload)inserted.set(row.id,row);
  if(fail&&url.includes('baby_diapers'))throw new Error('Connection interrupted');
};
await c.paperSave({});
assert.ok(c.paperDay().pending);assert.equal(c.paperState.date,'2026-01-09');
const pendingIds=Object.values(c.paperDay().pending).flat().map(r=>r.id);
c.openSchoolGrid(); // restore the persisted pending paper, as after a reload
assert.deepEqual(Object.values(c.paperDay().pending).flat().map(r=>r.id),pendingIds);
fail=false;await c.paperSave({});
assert.equal(c.paperDay().stockAdjusted,1);assert.equal(c.paperState.date,'2026-01-09');
stockFailure=false;await c.paperSave({});
assert.equal(inserted.size,pendingIds.length);
assert.equal(stockCalls,3); // two successful stock decrements and one failed attempt
assert.equal(c.paperState.date,'2026-01-12');
assert.equal(c.paperState.saved.length,1);
c.paperDateChange('2026-01-09');const before=posts;await c.paperSave({});assert.equal(posts,before);
// Existing records require confirmation; cancelling sends no writes.
c.paperDateChange('2026-01-08');c.paperDay().milk=[16];
c.sbFetch=async(url,opts)=>{assert.equal(opts,undefined);return [{id:'existing'}];};
c.FamilyPalUI.confirm=async()=>false;await c.paperSave({});assert.equal(c.paperDay().pending,undefined);
assert.equal(c.paperBusy,false);
console.log('School paper time mapping, draft restore, duplicate warning and interrupted-save checks passed.');
