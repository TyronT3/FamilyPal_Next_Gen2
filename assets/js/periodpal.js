function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function todayKey(){return dateKey(new Date());}
function dateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parseDay(s){var p=(s||'').split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
function addDays(s,n){var d=typeof s==='string'?parseDay(s):new Date(s);d.setDate(d.getDate()+n);return dateKey(d);}
function daysBetween(a,b){return Math.round((parseDay(b)-parseDay(a))/86400000);}
function fmtDate(s){return parseDay(s).toLocaleDateString([],{year:'numeric',month:'short',day:'numeric'});}
function fmtFullDate(s){return parseDay(s).toLocaleDateString([],{weekday:'long',year:'numeric',month:'long',day:'numeric'});}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

var cycles=[],intimacy=[],exclusions=[],periodEvents=[],periodNotes=[],periodMeasurements=[],periodMedLogs=[],viewMonth=new Date(),activeTab='calendar';
var model={avgCycle:28,avgPeriod:5,lastStart:null,nextStart:null,periodEnd:null,ovulation:null,fertileStart:null,fertileEnd:null,confidence:'low'};
var importRows=[],jsonImportData=null;

function switchTab(tab,btn){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  ['calendar','log','history','reports'].forEach(function(t){document.getElementById('tab-'+t).style.display=t===tab?'block':'none';});
  if(tab==='history')renderHistory();
  if(tab==='reports')renderReports();
}

async function loadData(){
  try{
    var start=new Date();start.setMonth(start.getMonth()-14);
    var end=new Date();end.setMonth(end.getMonth()+4);
    var results=await Promise.all([
      sbFetch('/rest/v1/period_cycles?start_date=gte.'+dateKey(start)+'&order=start_date.desc&select=*'),
      sbFetch('/rest/v1/period_intimacy?logged_date=gte.'+dateKey(start)+'&logged_date=lte.'+dateKey(end)+'&order=logged_date.desc&select=*'),
      sbFetch('/rest/v1/period_exclusions?order=start_date.desc&select=*'),
      sbFetch('/rest/v1/period_events?order=event_date.desc&select=*'),
      sbFetch('/rest/v1/period_notes?order=note_date.desc&select=*'),
      sbFetch('/rest/v1/period_measurements?order=measurement_date.desc&select=*'),
      sbFetch('/rest/v1/period_medication_logs?order=log_date.desc&select=*')
    ]);
    cycles=results[0]||[];
    intimacy=results[1]||[];
    exclusions=results[2]||[];
    periodEvents=results[3]||[];
    periodNotes=results[4]||[];
    periodMeasurements=results[5]||[];
    periodMedLogs=results[6]||[];
    buildModel();
    renderForecast();
    renderCalendar();
    if(activeTab==='history')renderHistory();
    if(activeTab==='reports')renderReports();
  }catch(e){
    document.getElementById('forecast-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+esc(e.message)+'</div>';
  }
}

function buildModel(){
  var sorted=usableCycles().sort(function(a,b){return a.start_date.localeCompare(b.start_date);});
  var intervals=[];
  for(var i=1;i<sorted.length;i++){
    var diff=daysBetween(sorted[i-1].start_date,sorted[i].start_date);
    if(diff>=18&&diff<=45)intervals.push(diff);
  }
  var recentIntervals=intervals.slice(-6);
  var avgCycle=recentIntervals.length?Math.round(recentIntervals.reduce(function(s,n){return s+n;},0)/recentIntervals.length):28;
  var lengths=sorted.filter(function(c){return c.end_date;}).slice(-6).map(function(c){return clamp(daysBetween(c.start_date,c.end_date)+1,1,12);});
  var avgPeriod=lengths.length?Math.round(lengths.reduce(function(s,n){return s+n;},0)/lengths.length):5;
  var last=sorted[sorted.length-1]||null;
  var nextStart=last?addDays(last.start_date,avgCycle):null;
  var periodEnd=nextStart?addDays(nextStart,avgPeriod-1):null;
  var ovulation=nextStart?addDays(nextStart,-14):null;
  model={
    avgCycle:avgCycle,
    avgPeriod:avgPeriod,
    lastStart:last?last.start_date:null,
    nextStart:nextStart,
    periodEnd:periodEnd,
    ovulation:ovulation,
    fertileStart:ovulation?addDays(ovulation,-5):null,
    fertileEnd:ovulation?addDays(ovulation,1):null,
    confidence:recentIntervals.length>=3?'good':recentIntervals.length>=1?'medium':'low'
  };
}

function renderForecast(){
  var el=document.getElementById('forecast-content');
  if(!usableCycles().length){
    el.innerHTML='<div class="forecast-grid">'+
      '<div class="forecast-card fc-rose"><div class="fc-lbl">Next period</div><div class="fc-val">Log first</div><div class="fc-sub">Add the latest start date to begin predictions.</div></div>'+
      '<div class="forecast-card fc-blue"><div class="fc-lbl">Fertile window</div><div class="fc-val">Unknown</div><div class="fc-sub">Needs cycle history.</div></div>'+
      '</div><div class="trust-note">PeriodPal estimates from logged dates only. Pregnancy or excluded ranges are kept in history but ignored for predictions.</div>';
    return;
  }
  var daysTo=daysBetween(todayKey(),model.nextStart);
  var periodText=daysTo===0?'Today':daysTo>0?'In '+daysTo+' day'+(daysTo!==1?'s':''):Math.abs(daysTo)+' day'+(Math.abs(daysTo)!==1?'s':'')+' late';
  var fertileText=isBetween(todayKey(),model.fertileStart,model.fertileEnd)?'Now':fmtDate(model.fertileStart)+' - '+fmtDate(model.fertileEnd);
  var conf=model.confidence==='good'?'Good':model.confidence==='medium'?'Building':'Early';
  el.innerHTML='<div class="forecast-grid">'+
    '<div class="forecast-card fc-rose"><div class="fc-lbl">Next period</div><div class="fc-val">'+esc(periodText)+'</div><div class="fc-sub">'+fmtDate(model.nextStart)+' · '+model.avgCycle+' day avg cycle</div></div>'+
    '<div class="forecast-card fc-blue"><div class="fc-lbl">Fertile window</div><div class="fc-val">'+esc(fertileText)+'</div><div class="fc-sub">Ovulation estimate '+fmtDate(model.ovulation)+'</div></div>'+
    '<div class="forecast-card fc-coral"><div class="fc-lbl">Period length</div><div class="fc-val">'+model.avgPeriod+' days</div><div class="fc-sub">Based on completed logs</div></div>'+
      '<div class="forecast-card fc-yellow"><div class="fc-lbl">Confidence</div><div class="fc-val">'+conf+'</div><div class="fc-sub">'+(model.confidence==='good'?'3+ cycles logged':model.confidence==='medium'?'More cycles will improve this':'Using 28 day default')+'</div></div>'+
    '</div><div class="trust-note">Estimates use cycle history, a roughly 14 day luteal phase, and a fertile window around the 5 days before ovulation through about 1 day after. Calendar-only estimates can be wrong, especially with irregular cycles.</div>';
}

function avgCycleRange(){
  var sorted=usableCycles().sort(function(a,b){return a.start_date.localeCompare(b.start_date);});
  var vals=[];
  for(var i=1;i<sorted.length;i++){
    var diff=daysBetween(sorted[i-1].start_date,sorted[i].start_date);
    if(diff>=18&&diff<=45)vals.push(diff);
  }
  if(!vals.length)return null;
  return {min:Math.min.apply(null,vals),max:Math.max.apply(null,vals),count:vals.length};
}

function renderCalendar(){
  var y=viewMonth.getFullYear(),m=viewMonth.getMonth();
  document.getElementById('month-title').textContent=viewMonth.toLocaleDateString([],{month:'long',year:'numeric'});
  var first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
  var html='';
  for(var i=0;i<42;i++){
    var d=new Date(start);d.setDate(start.getDate()+i);
    var key=dateKey(d),cls=['day'],dots=[];
    if(d.getMonth()!==m)cls.push('out');
    if(key===todayKey())cls.push('today');
    if(isLoggedPeriod(key)){cls.push('period');dots.push('tag-period');}
    if(isPredictedPeriod(key)){cls.push('predicted');dots.push('tag-predicted');}
    if(isBetween(key,model.fertileStart,model.fertileEnd)){cls.push('fertile');dots.push('tag-fertile');}
    if(key===model.ovulation){cls.push('ovulation');dots.push('tag-ovulation');}
    if(intimacy.some(function(x){return x.logged_date===key;}))dots.push('tag-intimacy');
    if(periodNotes.some(function(x){return x.note_date===key;}))dots.push('tag-note');
    if(periodEvents.some(function(x){return x.event_date===key;}))dots.push('tag-event');
    html+='<div class="'+cls.join(' ')+'" onclick="openDay(\''+key+'\')"><div class="day-num">'+d.getDate()+'</div><div class="day-tags">'+dots.slice(0,4).map(function(c){return'<i class="tag-dot '+c+'"></i>';}).join('')+'</div></div>';
  }
  document.getElementById('calendar-grid').innerHTML=html;
}

function moveMonth(delta){viewMonth.setMonth(viewMonth.getMonth()+delta);renderCalendar();}
function isBetween(key,start,end){return start&&end&&key>=start&&key<=end;}
function isExcludedDate(key){return exclusions.some(function(x){return key>=x.start_date&&key<=x.end_date;});}
function isExcludedCycle(c){return isExcludedDate(c.start_date);}
function usableCycles(){return cycles.filter(function(c){return !isExcludedCycle(c);});}
function isLoggedPeriod(key){return cycles.some(function(c){return key>=c.start_date&&key<=(c.end_date||todayKey());});}
function isPredictedPeriod(key){return isBetween(key,model.nextStart,model.periodEnd);}

function riskForDate(key,protection,ec){
  if(!model.lastStart)return{level:'unknown',label:'Unknown',detail:'Not enough cycle history yet.'};
  var fertile=isBetween(key,model.fertileStart,model.fertileEnd);
  var ov=key===model.ovulation;
  var protectedStrong=['pill','iud','implant','injection'].indexOf(protection)>=0;
  if(ec)return{level:'medium',label:'Reduced',detail:'Emergency contraception was marked. Follow the product guidance and test if the next period is late.'};
  if(protectedStrong)return{level:'low',label:'Low estimate',detail:'Marked protected by '+protection+'. No method is 100%.'};
  if(protection==='condom')return{level:fertile?'medium':'low',label:fertile?'Some risk':'Low estimate',detail:fertile?'Condom use during the estimated fertile window.':'Condom use outside the estimated fertile window.'};
  if(protection==='withdrawal')return{level:fertile?'high':'medium',label:fertile?'Higher risk':'Some risk',detail:'Withdrawal is less reliable, especially near fertile days.'};
  if(protection==='other')return{level:fertile?'medium':'low',label:fertile?'Review method':'Lower estimate',detail:'Risk depends on what protection was used.'};
  if(fertile)return{level:'high',label:ov?'Highest estimate':'High estimate',detail:'Unprotected intimacy during the estimated fertile window.'};
  return{level:'medium',label:'Possible',detail:'Outside the estimated fertile window, but ovulation can shift.'};
}

function openDay(key){
  var dayCycles=cycles.filter(function(c){return key>=c.start_date&&key<=(c.end_date||todayKey());});
  var dayInt=intimacy.filter(function(x){return x.logged_date===key;});
  var dayNotes=periodNotes.filter(function(x){return x.note_date===key;});
  var dayEvents=periodEvents.filter(function(x){return x.event_date===key;});
  var dayMeasurements=periodMeasurements.filter(function(x){return x.measurement_date===key;});
  var dayMeds=periodMedLogs.filter(function(x){return x.log_date===key;});
  var dayExclusions=exclusions.filter(function(x){return key>=x.start_date&&key<=x.end_date;});
  var tags=[];
  if(dayExclusions.length)dayExclusions.forEach(function(x){tags.push('<div class="log-item" onclick="closeModal(\'day-modal\');openExclusionModal(\''+x.id+'\')"><div class="log-icon">🚫</div><div class="log-info"><div class="log-title">Excluded from estimates</div><div class="log-detail">'+esc(x.reason||'excluded')+' · '+fmtDate(x.start_date)+' - '+fmtDate(x.end_date)+(x.notes?' · '+esc(x.notes):'')+'</div></div></div>');});
  if(dayCycles.length)dayCycles.forEach(function(c){tags.push('<div class="log-item" onclick="closeModal(\'day-modal\');openCycleModal(\''+c.id+'\')"><div class="log-icon">🩸</div><div class="log-info"><div class="log-title">Logged period</div><div class="log-detail">'+esc(c.flow||'medium')+(c.symptoms&&c.symptoms.length?' · '+esc(c.symptoms.join(', ')):'')+(c.notes?' · '+esc(c.notes):'')+'</div></div></div>');});
  if(isPredictedPeriod(key))tags.push('<div class="log-item"><div class="log-icon">🌙</div><div class="log-info"><div class="log-title">Predicted period</div><div class="log-detail">Based on '+model.avgCycle+' day average cycle.</div></div></div>');
  if(isBetween(key,model.fertileStart,model.fertileEnd))tags.push('<div class="log-item"><div class="log-icon">🌱</div><div class="log-info"><div class="log-title">Estimated fertile window</div><div class="log-detail">Ovulation estimate: '+fmtDate(model.ovulation)+'.</div></div></div>');
  dayNotes.forEach(function(n){tags.push('<div class="log-item" onclick="closeModal(\'day-modal\');openNoteModal(\''+n.note_id+'\')"><div class="log-icon">📝</div><div class="log-info"><div class="log-title">Note</div><div class="log-detail">'+esc(n.note_text)+'</div></div></div>');});
  dayEvents.forEach(function(e){tags.push('<div class="log-item" onclick="closeModal(\'day-modal\');openEventModal(\''+e.event_id+'\')"><div class="log-icon">✨</div><div class="log-info"><div class="log-title">'+esc(eventTitle(e))+'</div><div class="log-detail">'+esc(eventDetail(e))+'</div></div></div>');});
  dayMeasurements.forEach(function(m){tags.push('<div class="log-item" onclick="closeModal(\'day-modal\');openMeasurementModal(\''+m.measurement_id+'\')"><div class="log-icon">📏</div><div class="log-info"><div class="log-title">'+esc(measurementTitle(m))+'</div><div class="log-detail">'+esc(measurementDetail(m))+'</div></div></div>');});
  dayMeds.forEach(function(m){tags.push('<div class="log-item" onclick="closeModal(\'day-modal\');openMedicationLogModal(\''+m.log_id+'\')"><div class="log-icon">💊</div><div class="log-info"><div class="log-title">'+esc(m.name||'Medication')+'</div><div class="log-detail">'+esc(medicationDetail(m))+'</div></div></div>');});
  dayInt.forEach(function(x){
    var r=riskForDate(x.logged_date,x.protection,x.emergency_contraception);
    tags.push('<div class="log-item" onclick="openIntimacyModal(\''+x.id+'\')"><div class="log-icon">🛡️</div><div class="log-info"><div class="log-title">Pregnancy risk note</div><div class="log-detail">'+esc(protectionLabel(x.protection))+(x.notes?' · '+esc(x.notes):'')+'<br><span class="risk-pill risk-'+r.level+'">'+esc(r.label)+'</span></div></div></div>');
  });
  document.getElementById('day-title').textContent=fmtFullDate(key);
  document.getElementById('day-content').innerHTML=(tags.length?tags.join(''):'<div class="empty-log">Nothing logged for this day</div>')+
    '<button class="btn btn-primary" onclick="closeModal(\'day-modal\');openCycleModal(null,\''+key+'\')">Log Period Here</button>'+
    '<button class="btn btn-secondary" onclick="closeModal(\'day-modal\');openIntimacyModal(null,\''+key+'\')">Log Pregnancy Risk Note</button>';
  document.getElementById('day-modal').style.display='flex';
}

function openLogPicker(){document.getElementById('log-picker-modal').style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}
function closeModalClick(e){if(e.target===e.currentTarget)closeModal(e.currentTarget.id);}

function openImportModal(){
  importRows=[];
  jsonImportData=null;
  document.getElementById('json-import-file').value='';
  document.getElementById('import-text').value='';
  document.getElementById('exclude-start').value='';
  document.getElementById('exclude-end').value='';
  document.getElementById('exclude-notes').value='';
  document.getElementById('import-preview').style.display='none';
  document.getElementById('import-preview').innerHTML='';
  document.getElementById('import-save-btn').style.display='none';
  document.getElementById('import-modal').style.display='flex';
}

function loadJsonImportFile(input){
  var file=input.files&&input.files[0];
  if(!file)return;
  var reader=new FileReader();
  reader.onload=function(){
    try{
      jsonImportData=JSON.parse(reader.result);
      previewJsonImport();
    }catch(e){
      jsonImportData=null;
      document.getElementById('import-preview').style.display='block';
      document.getElementById('import-preview').innerHTML='<div style="color:var(--red)">Could not read JSON: '+esc(e.message)+'</div>';
      document.getElementById('import-save-btn').style.display='none';
    }
  };
  reader.readAsText(file);
}

function previewJsonImport(){
  var d=jsonImportData||{};
  var cyclesIn=(d.cycles||[]).filter(function(c){return !c.is_prediction;});
  var forecasts=(d.cycles||[]).filter(function(c){return c.is_prediction;});
  var pregnancy=(d.cycles||[]).filter(function(c){return c.record_status==='pregnancy_gap';});
  var events=d.events||[],notes=d.notes||[],measurements=d.measurements||[],medDefs=d.medication_definitions||[],medLogs=d.medication_logs||[];
  var cats={};
  events.forEach(function(e){cats[e.category]=(cats[e.category]||0)+1;});
  var preview=document.getElementById('import-preview');
  preview.style.display='block';
  preview.innerHTML='<div style="color:var(--muted);margin-bottom:8px">Full JSON import preview</div>'+
    '<div class="report-row"><span>Confirmed cycles</span><strong>'+cyclesIn.length+'</strong></div>'+
    '<div class="report-row"><span>Pregnancy exclusions</span><strong>'+pregnancy.length+'</strong></div>'+
    '<div class="report-row"><span>Forecast rows skipped</span><strong>'+forecasts.length+'</strong></div>'+
    '<div class="report-row"><span>Daily events</span><strong>'+events.length+'</strong></div>'+
    '<div style="font-size:11px;color:var(--muted);margin:6px 0">'+esc(Object.keys(cats).map(function(k){return k+': '+cats[k];}).join(' · '))+'</div>'+
    '<div class="report-row"><span>Notes</span><strong>'+notes.length+'</strong></div>'+
    '<div class="report-row"><span>Measurements</span><strong>'+measurements.length+'</strong></div>'+
    '<div class="report-row"><span>Medication definitions</span><strong>'+medDefs.length+'</strong></div>'+
    '<div class="report-row"><span>Medication logs</span><strong>'+medLogs.length+'</strong></div>';
  document.getElementById('import-save-btn').style.display='block';
}

function parseCsvLine(line){
  var out=[],cur='',quoted=false;
  for(var i=0;i<line.length;i++){
    var ch=line[i],next=line[i+1];
    if(ch==='"'&&quoted&&next==='"'){cur+='"';i++;continue;}
    if(ch==='"'){quoted=!quoted;continue;}
    if(ch===','&&!quoted){out.push(cur.trim());cur='';continue;}
    cur+=ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeFlow(flow){
  flow=(flow||'medium').toLowerCase().trim();
  return ['spotting','light','medium','heavy'].indexOf(flow)>=0?flow:'medium';
}

function parseImportRows(text){
  var rows=[],errors=[];
  text.split(/\r?\n/).forEach(function(raw,idx){
    var line=raw.trim();
    if(!line)return;
    var parts=parseCsvLine(line);
    var start=parts[0]||'',end=parts[1]||'',flow=normalizeFlow(parts[2]);
    var symptomText=parts[3]||'';
    var notes=parts.slice(4).join(', ').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)){errors.push('Line '+(idx+1)+': start date must be YYYY-MM-DD');return;}
    if(end&&!/^\d{4}-\d{2}-\d{2}$/.test(end)){errors.push('Line '+(idx+1)+': end date must be YYYY-MM-DD or blank');return;}
    if(end&&end<start){errors.push('Line '+(idx+1)+': end date is before start date');return;}
    var symptoms=symptomText?symptomText.split(/[|;]/).map(function(s){return s.trim().toLowerCase();}).filter(Boolean):[];
    rows.push({start_date:start,end_date:end||null,flow:flow,symptoms:symptoms,notes:notes||null});
  });
  return {rows:rows,errors:errors};
}

function previewImport(){
  if(jsonImportData){previewJsonImport();return;}
  var parsed=parseImportRows(document.getElementById('import-text').value);
  importRows=parsed.rows;
  var preview=document.getElementById('import-preview');
  preview.style.display='block';
  document.getElementById('import-save-btn').style.display=importRows.length?'block':'none';
  var html='';
  if(parsed.errors.length)html+='<div style="color:var(--red);margin-bottom:10px">'+parsed.errors.map(esc).join('<br>')+'</div>';
  if(importRows.length){
    html+='<div style="color:var(--muted);margin-bottom:8px">'+importRows.length+' row'+(importRows.length!==1?'s':'')+' ready to import</div>';
    html+=importRows.slice(0,20).map(function(r){
      return '<div class="report-row"><span>'+esc(r.start_date)+(r.end_date?' to '+esc(r.end_date):'')+'</span><strong>'+esc(r.flow)+'</strong></div>'+
        ((r.symptoms.length||r.notes)?'<div style="font-size:11px;color:var(--muted);margin:-4px 0 6px">'+esc([r.symptoms.join(', '),r.notes].filter(Boolean).join(' · '))+'</div>':'');
    }).join('');
    if(importRows.length>20)html+='<div style="color:var(--muted);font-size:11px">Showing first 20 rows.</div>';
  }else if(!parsed.errors.length){
    html='<div style="color:var(--muted)">No rows found. Paste one period per line first.</div>';
  }
  preview.innerHTML=html;
}

async function saveImportRows(){
  if(jsonImportData){await saveJsonImport();return;}
  if(!importRows.length){toast('Preview rows first');return;}
  var exStart=document.getElementById('exclude-start').value;
  var exEnd=document.getElementById('exclude-end').value;
  var exNotes=document.getElementById('exclude-notes').value.trim();
  if((exStart&&!exEnd)||(!exStart&&exEnd)){toast('Add both pregnancy start and end dates');return;}
  if(exStart&&exEnd&&exEnd<exStart){toast('Pregnancy end date must be after start date');return;}
  var existing={};
  cycles.forEach(function(c){existing[c.start_date]=true;});
  var rows=importRows.filter(function(r){return !existing[r.start_date];}).map(function(r){
    return {start_date:r.start_date,end_date:r.end_date,flow:r.flow,symptoms:r.symptoms,notes:r.notes,updated_at:new Date().toISOString()};
  });
  if(!rows.length&&!exStart){toast('Those start dates already exist');return;}
  try{
    if(rows.length)await sbFetch('/rest/v1/period_cycles',{method:'POST',body:JSON.stringify(rows)});
    if(exStart&&exEnd){
      await sbFetch('/rest/v1/period_exclusions',{method:'POST',body:JSON.stringify({start_date:exStart,end_date:exEnd,reason:'pregnancy',notes:exNotes||null,updated_at:new Date().toISOString()})});
    }
    closeModal('import-modal');
    toast((rows.length?'Imported '+rows.length+' period log'+(rows.length!==1?'s':''):'Saved exclusion range')+(exStart&&exEnd?' and pregnancy range':''));
    loadData();
  }catch(e){toast('Import error: '+e.message);}
}

function chunk(arr,size){
  var out=[];
  for(var i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));
  return out;
}

async function upsertRows(table,rows,conflictKey){
  if(!rows.length)return 0;
  var total=0;
  var batches=chunk(rows,100);
  for(var i=0;i<batches.length;i++){
    await sbFetch('/rest/v1/'+table+'?on_conflict='+conflictKey,{
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(batches[i])
    });
    total+=batches[i].length;
  }
  return total;
}

function mapImportedFlow(c){
  var flow=(c.flow||'medium').toLowerCase();
  if(['spotting','light','medium','heavy'].indexOf(flow)>=0)return flow;
  return 'medium';
}

function sexProtection(e){
  try{
    var raw=JSON.parse(e.raw_value||e.value_text||'{}');
    return raw.condom?'condom':'none';
  }catch(err){return 'none';}
}

async function saveJsonImport(){
  var d=jsonImportData||{};
  var allCycles=d.cycles||[];
  var confirmed=allCycles.filter(function(c){return !c.is_prediction;});
  var pregnancy=allCycles.filter(function(c){return c.record_status==='pregnancy_gap';});
  var cycleRows=confirmed.map(function(c){
    return {
      import_record_id:c.record_id,
      source_app:c.source_app||null,
      source_record_id:c.source_record_id==null?null:String(c.source_record_id),
      start_date:c.period_start,
      end_date:c.period_end||null,
      flow:mapImportedFlow(c),
      symptoms:[],
      notes:c.notes||null,
      record_status:c.record_status||'historical',
      is_prediction:!!c.is_prediction,
      is_confirmed:c.is_confirmed!==false,
      next_cycle_start:c.next_cycle_start||null,
      cycle_length_days:c.cycle_length_days||null,
      updated_at:new Date().toISOString()
    };
  });
  var exclusionRows=pregnancy.map(function(c){
    return {
      import_record_id:c.record_id,
      source_app:c.source_app||null,
      start_date:c.period_start,
      end_date:c.next_cycle_start?addDays(c.next_cycle_start,-1):c.period_end,
      reason:'pregnancy',
      notes:c.notes||'Imported pregnancy/postpartum gap',
      updated_at:new Date().toISOString()
    };
  });
  var eventRows=(d.events||[]).map(function(e){
    return {
      event_id:e.event_id,
      source_app:e.source_app||null,
      source_record_id:e.source_record_id==null?null:String(e.source_record_id),
      event_date:e.event_date,
      event_datetime:e.event_datetime||null,
      category:e.category,
      code:e.code==null?null:String(e.code),
      label:e.label||null,
      severity_code:e.severity_code==null?null:String(e.severity_code),
      value_text:e.value_text==null?null:String(e.value_text),
      value_number:e.value_number==null?null:e.value_number,
      unit:e.unit||null,
      is_prediction:!!e.is_prediction,
      raw_value:e.raw_value==null?null:String(e.raw_value)
    };
  });
  var intimacyRows=(d.events||[]).filter(function(e){return e.category==='sex'&&!e.is_prediction;}).map(function(e){
    return {
      import_event_id:e.event_id,
      source_app:e.source_app||null,
      logged_date:e.event_date,
      protection:sexProtection(e),
      emergency_contraception:false,
      notes:e.label||'Imported sex record',
      updated_at:new Date().toISOString()
    };
  });
  var noteRows=(d.notes||[]).map(function(n){
    return {
      note_id:n.note_id,
      source_app:n.source_app||null,
      source_record_id:n.source_record_id==null?null:String(n.source_record_id),
      note_date:n.note_date,
      note_datetime:n.note_datetime||null,
      note_text:n.text||'',
      source_created_at:n.created_at||null,
      source_updated_at:n.updated_at||null
    };
  });
  var measurementRows=(d.measurements||[]).map(function(m){
    return {
      measurement_id:m.measurement_id,
      source_app:m.source_app||null,
      source_record_id:m.source_record_id==null?null:String(m.source_record_id),
      measurement_date:m.measurement_date,
      measurement_datetime:m.measurement_datetime||null,
      measurement_type:m.type,
      value:m.value==null?null:m.value,
      unit:m.unit||null,
      normalized_value:m.normalized_value==null?null:m.normalized_value,
      normalized_unit:m.normalized_unit||null,
      raw_value:m.raw_value==null?null:String(m.raw_value)
    };
  });
  var medDefRows=(d.medication_definitions||[]).map(function(m){
    return {
      medication_id:m.medication_id,
      source_app:m.source_app||null,
      source_record_id:m.source_record_id==null?null:String(m.source_record_id),
      source_pill_id:m.source_pill_id==null?null:String(m.source_pill_id),
      name:m.name||null,
      classify_code:m.classify_code==null?null:String(m.classify_code),
      pill_type_code:m.pill_type_code==null?null:String(m.pill_type_code),
      start_datetime:m.start_datetime||null,
      end_datetime:m.end_datetime||null,
      notification_enabled_code:m.notification_enabled_code==null?null:String(m.notification_enabled_code),
      configuration_json:m.configuration_json||null,
      extension_json:m.extension_json||null
    };
  });
  var medLogRows=(d.medication_logs||[]).map(function(m){
    return {
      log_id:m.log_id,
      source_app:m.source_app||null,
      source_record_id:m.source_record_id==null?null:String(m.source_record_id),
      log_date:m.log_date,
      source_pill_id:m.source_pill_id==null?null:String(m.source_pill_id),
      name:m.name||null,
      take_status_code:m.take_status_code==null?null:String(m.take_status_code),
      pill_type_code:m.pill_type_code==null?null:String(m.pill_type_code),
      raw_value:m.raw_value==null?null:String(m.raw_value)
    };
  });
  try{
    var savedCycles=await upsertRows('period_cycles',cycleRows,'import_record_id');
    await upsertRows('period_exclusions',exclusionRows,'import_record_id');
    await upsertRows('period_events',eventRows,'event_id');
    await upsertRows('period_intimacy',intimacyRows,'import_event_id');
    await upsertRows('period_notes',noteRows,'note_id');
    await upsertRows('period_measurements',measurementRows,'measurement_id');
    await upsertRows('period_medication_definitions',medDefRows,'medication_id');
    await upsertRows('period_medication_logs',medLogRows,'log_id');
    closeModal('import-modal');
    toast('Imported JSON history: '+savedCycles+' cycles');
    loadData();
  }catch(e){toast('JSON import error: '+e.message);}
}

function openCycleModal(id,day){
  var c=id?cycles.find(function(x){return x.id===id;}):null;
  document.getElementById('cycle-modal-title').textContent=c?'Edit Period':'Period Details';
  document.getElementById('cycle-id').value=c?c.id:'';
  document.getElementById('cycle-start').value=c?c.start_date:(day||todayKey());
  document.getElementById('cycle-end').value=c&&c.end_date?c.end_date:'';
  document.getElementById('cycle-notes').value=c&&c.notes?c.notes:'';
  selectFlow(c&&c.flow?c.flow:'medium');
  document.querySelectorAll('input[name="symptom"]').forEach(function(box){box.checked=!!(c&&c.symptoms&&c.symptoms.indexOf(box.value)>=0);});
  document.getElementById('cycle-delete-btn').style.display=c?'block':'none';
  document.getElementById('cycle-modal').style.display='flex';
}

function selectFlow(flow,btn){
  document.getElementById('cycle-flow').value=flow;
  document.querySelectorAll('[data-flow]').forEach(function(b){b.classList.toggle('selected',b.getAttribute('data-flow')===flow);});
  if(btn)btn.classList.add('selected');
}

async function saveCycle(){
  var id=document.getElementById('cycle-id').value;
  var start=document.getElementById('cycle-start').value;
  var end=document.getElementById('cycle-end').value;
  if(!start){toast('Choose a start date');return;}
  if(end&&end<start){toast('End date must be after start date');return;}
  var symptoms=[].slice.call(document.querySelectorAll('input[name="symptom"]:checked')).map(function(b){return b.value;});
  var payload={start_date:start,end_date:end||null,flow:document.getElementById('cycle-flow').value,symptoms:symptoms,notes:document.getElementById('cycle-notes').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(id)await sbFetch('/rest/v1/period_cycles?id=eq.'+id,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    else await sbFetch('/rest/v1/period_cycles',{method:'POST',body:JSON.stringify(payload)});
    closeModal('cycle-modal');toast('Period saved');loadData();
  }catch(e){toast('Error: '+e.message);}
}

async function quickStartPeriod(){
  try{
    await sbFetch('/rest/v1/period_cycles',{method:'POST',body:JSON.stringify({start_date:todayKey(),flow:'medium'})});
    toast('Period start logged');loadData();
  }catch(e){toast('Error: '+e.message);}
}

async function quickEndPeriod(){
  var open=cycles.slice().sort(function(a,b){return b.start_date.localeCompare(a.start_date);}).find(function(c){return !c.end_date;});
  if(!open){toast('No open period to end');return;}
  try{
    await sbFetch('/rest/v1/period_cycles?id=eq.'+open.id,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({end_date:todayKey(),updated_at:new Date().toISOString()})});
    toast('Period end logged');loadData();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteCycle(){
  var id=document.getElementById('cycle-id').value;
  if(!id||!confirm('Delete this period log?'))return;
  try{await sbFetch('/rest/v1/period_cycles?id=eq.'+id,{method:'DELETE'});closeModal('cycle-modal');toast('Period deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function openIntimacyModal(id,day){
  var x=id?intimacy.find(function(r){return r.id===id;}):null;
  document.getElementById('intimacy-modal-title').textContent=x?'Edit Pregnancy Risk Note':'Pregnancy Risk Note';
  document.getElementById('intimacy-id').value=x?x.id:'';
  document.getElementById('intimacy-date').value=x?x.logged_date:(day||todayKey());
  document.getElementById('intimacy-protection').value=x?x.protection:'none';
  document.getElementById('intimacy-ec').checked=!!(x&&x.emergency_contraception);
  document.getElementById('intimacy-notes').value=x&&x.notes?x.notes:'';
  document.getElementById('intimacy-delete-btn').style.display=x?'block':'none';
  updateRiskPreview();
  document.getElementById('intimacy-date').onchange=updateRiskPreview;
  document.getElementById('intimacy-protection').onchange=updateRiskPreview;
  document.getElementById('intimacy-ec').onchange=updateRiskPreview;
  document.getElementById('intimacy-modal').style.display='flex';
}

function updateRiskPreview(){
  var r=riskForDate(document.getElementById('intimacy-date').value,document.getElementById('intimacy-protection').value,document.getElementById('intimacy-ec').checked);
  document.getElementById('risk-preview').innerHTML='<strong>'+esc(r.label)+'</strong><br>'+esc(r.detail)+' This is a calendar estimate, not a diagnosis or contraception guarantee.';
}

async function saveIntimacy(){
  var id=document.getElementById('intimacy-id').value;
  var day=document.getElementById('intimacy-date').value;
  if(!day){toast('Choose a date');return;}
  var payload={logged_date:day,protection:document.getElementById('intimacy-protection').value,emergency_contraception:document.getElementById('intimacy-ec').checked,notes:document.getElementById('intimacy-notes').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(id)await sbFetch('/rest/v1/period_intimacy?id=eq.'+id,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    else await sbFetch('/rest/v1/period_intimacy',{method:'POST',body:JSON.stringify(payload)});
    closeModal('intimacy-modal');toast('Risk note saved');loadData();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteIntimacy(){
  var id=document.getElementById('intimacy-id').value;
  if(!id||!confirm('Delete this risk note?'))return;
  try{await sbFetch('/rest/v1/period_intimacy?id=eq.'+id,{method:'DELETE'});closeModal('intimacy-modal');toast('Risk note deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function eventTitle(e){
  return (e.label||e.category||'Event')+(e.code&&!e.label?' code '+e.code:'');
}

function eventDetail(e){
  var parts=[e.category];
  if(e.severity_code)parts.push('severity '+e.severity_code);
  if(e.value_text)parts.push(e.value_text);
  if(e.value_number!=null)parts.push(String(e.value_number)+(e.unit?' '+e.unit:''));
  if(e.raw_value&&!e.value_text)parts.push(e.raw_value);
  return parts.filter(Boolean).join(' · ')||'Imported event';
}

function measurementTitle(m){
  return (m.measurement_type||'Measurement').replace(/_/g,' ');
}

function measurementDetail(m){
  var primary=m.value!=null?String(m.value)+(m.unit?' '+m.unit:''):'No value';
  var normalized=m.normalized_value!=null?'normalized '+m.normalized_value+(m.normalized_unit?' '+m.normalized_unit:''):'';
  return [primary,normalized,m.raw_value].filter(Boolean).join(' · ');
}

function medicationDetail(m){
  return ['status '+(m.take_status_code||'unknown'),m.pill_type_code?'type '+m.pill_type_code:'',m.raw_value].filter(Boolean).join(' · ');
}

function dateTimeLabel(date,datetime){
  if(!datetime)return fmtFullDate(date);
  try{return new Date(datetime).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return fmtFullDate(date);}
}

function openExclusionModal(id){
  var x=id?exclusions.find(function(r){return r.id===id;}):null;
  document.getElementById('exclusion-modal-title').textContent=x?'Edit Excluded Range':'Excluded Range';
  document.getElementById('exclusion-id').value=x?x.id:'';
  document.getElementById('exclusion-start').value=x?x.start_date:'';
  document.getElementById('exclusion-end').value=x?x.end_date:'';
  document.getElementById('exclusion-reason').value=x&&x.reason?x.reason:'pregnancy';
  document.getElementById('exclusion-notes').value=x&&x.notes?x.notes:'';
  document.getElementById('exclusion-delete-btn').style.display=x?'block':'none';
  document.getElementById('exclusion-modal').style.display='flex';
}

async function saveExclusion(){
  var id=document.getElementById('exclusion-id').value;
  var start=document.getElementById('exclusion-start').value;
  var end=document.getElementById('exclusion-end').value;
  if(!start||!end){toast('Choose start and end dates');return;}
  if(end<start){toast('End date must be after start date');return;}
  var payload={start_date:start,end_date:end,reason:document.getElementById('exclusion-reason').value,notes:document.getElementById('exclusion-notes').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(id)await sbFetch('/rest/v1/period_exclusions?id=eq.'+id,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    else await sbFetch('/rest/v1/period_exclusions',{method:'POST',body:JSON.stringify(payload)});
    closeModal('exclusion-modal');toast('Exclusion saved');loadData();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteExclusion(){
  var id=document.getElementById('exclusion-id').value;
  if(!id||!confirm('Delete this excluded range?'))return;
  try{await sbFetch('/rest/v1/period_exclusions?id=eq.'+id,{method:'DELETE'});closeModal('exclusion-modal');toast('Exclusion deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function detailInput(label,id,value,type){
  type=type||'text';
  return '<div class="date-row"><label>'+esc(label)+'</label><input type="'+type+'" id="'+id+'" value="'+esc(value||'')+'"></div>';
}

function detailArea(label,id,value){
  return '<div class="field"><label>'+esc(label)+'</label><textarea id="'+id+'">'+esc(value||'')+'</textarea></div>';
}

function openNoteModal(id){
  var n=periodNotes.find(function(r){return r.note_id===id;});
  if(!n)return;
  document.getElementById('history-detail-title').textContent='Note';
  document.getElementById('history-detail-content').innerHTML=
    detailInput('Date','detail-note-date',n.note_date,'date')+
    detailArea('Note','detail-note-text',n.note_text)+
    '<button class="btn btn-primary" onclick="saveNote(\''+n.note_id+'\')">Save Note</button>'+
    '<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteNote(\''+n.note_id+'\')">Delete Note</button>';
  document.getElementById('history-detail-modal').style.display='flex';
}

async function saveNote(id){
  var payload={note_date:document.getElementById('detail-note-date').value,note_text:document.getElementById('detail-note-text').value.trim()};
  if(!payload.note_date||!payload.note_text){toast('Date and note are required');return;}
  try{await sbFetch('/rest/v1/period_notes?note_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});closeModal('history-detail-modal');toast('Note saved');loadData();}catch(e){toast('Error: '+e.message);}
}

async function deleteNote(id){
  if(!confirm('Delete this note?'))return;
  try{await sbFetch('/rest/v1/period_notes?note_id=eq.'+encodeURIComponent(id),{method:'DELETE'});closeModal('history-detail-modal');toast('Note deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function openEventModal(id){
  var e=periodEvents.find(function(r){return r.event_id===id;});
  if(!e)return;
  document.getElementById('history-detail-title').textContent=eventTitle(e);
  document.getElementById('history-detail-content').innerHTML=
    '<div class="detail-grid"><div class="detail-chip"><span>Source</span><strong>'+esc(e.source_app||'imported')+'</strong></div><div class="detail-chip"><span>ID</span><strong>'+esc(e.event_id)+'</strong></div></div>'+
    detailInput('Date','detail-event-date',e.event_date,'date')+
    detailInput('Category','detail-event-category',e.category)+
    detailInput('Label','detail-event-label',e.label||'')+
    detailInput('Code','detail-event-code',e.code||'')+
    detailInput('Severity','detail-event-severity',e.severity_code||'')+
    detailInput('Value','detail-event-value-text',e.value_text||'')+
    detailInput('Number','detail-event-value-number',e.value_number==null?'':e.value_number,'number')+
    detailInput('Unit','detail-event-unit',e.unit||'')+
    detailArea('Raw value','detail-event-raw',e.raw_value||'')+
    '<button class="btn btn-primary" onclick="saveEvent(\''+e.event_id+'\')">Save Event</button>'+
    '<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteEvent(\''+e.event_id+'\')">Delete Event</button>';
  document.getElementById('history-detail-modal').style.display='flex';
}

async function saveEvent(id){
  var num=document.getElementById('detail-event-value-number').value;
  var payload={
    event_date:document.getElementById('detail-event-date').value,
    category:document.getElementById('detail-event-category').value.trim(),
    label:document.getElementById('detail-event-label').value.trim()||null,
    code:document.getElementById('detail-event-code').value.trim()||null,
    severity_code:document.getElementById('detail-event-severity').value.trim()||null,
    value_text:document.getElementById('detail-event-value-text').value.trim()||null,
    value_number:num===''?null:Number(num),
    unit:document.getElementById('detail-event-unit').value.trim()||null,
    raw_value:document.getElementById('detail-event-raw').value.trim()||null
  };
  if(!payload.event_date||!payload.category){toast('Date and category are required');return;}
  try{await sbFetch('/rest/v1/period_events?event_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});closeModal('history-detail-modal');toast('Event saved');loadData();}catch(e){toast('Error: '+e.message);}
}

async function deleteEvent(id){
  if(!confirm('Delete this event?'))return;
  try{await sbFetch('/rest/v1/period_events?event_id=eq.'+encodeURIComponent(id),{method:'DELETE'});closeModal('history-detail-modal');toast('Event deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function openMeasurementModal(id){
  var m=periodMeasurements.find(function(r){return r.measurement_id===id;});
  if(!m)return;
  document.getElementById('history-detail-title').textContent=measurementTitle(m);
  document.getElementById('history-detail-content').innerHTML=
    detailInput('Date','detail-measure-date',m.measurement_date,'date')+
    detailInput('Type','detail-measure-type',m.measurement_type)+
    detailInput('Value','detail-measure-value',m.value==null?'':m.value,'number')+
    detailInput('Unit','detail-measure-unit',m.unit||'')+
    detailInput('Normalized','detail-measure-normalized',m.normalized_value==null?'':m.normalized_value,'number')+
    detailInput('Norm unit','detail-measure-normalized-unit',m.normalized_unit||'')+
    detailArea('Raw value','detail-measure-raw',m.raw_value||'')+
    '<button class="btn btn-primary" onclick="saveMeasurement(\''+m.measurement_id+'\')">Save Measurement</button>'+
    '<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteMeasurement(\''+m.measurement_id+'\')">Delete Measurement</button>';
  document.getElementById('history-detail-modal').style.display='flex';
}

async function saveMeasurement(id){
  var val=document.getElementById('detail-measure-value').value;
  var norm=document.getElementById('detail-measure-normalized').value;
  var payload={
    measurement_date:document.getElementById('detail-measure-date').value,
    measurement_type:document.getElementById('detail-measure-type').value.trim(),
    value:val===''?null:Number(val),
    unit:document.getElementById('detail-measure-unit').value.trim()||null,
    normalized_value:norm===''?null:Number(norm),
    normalized_unit:document.getElementById('detail-measure-normalized-unit').value.trim()||null,
    raw_value:document.getElementById('detail-measure-raw').value.trim()||null
  };
  if(!payload.measurement_date||!payload.measurement_type){toast('Date and type are required');return;}
  try{await sbFetch('/rest/v1/period_measurements?measurement_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});closeModal('history-detail-modal');toast('Measurement saved');loadData();}catch(e){toast('Error: '+e.message);}
}

async function deleteMeasurement(id){
  if(!confirm('Delete this measurement?'))return;
  try{await sbFetch('/rest/v1/period_measurements?measurement_id=eq.'+encodeURIComponent(id),{method:'DELETE'});closeModal('history-detail-modal');toast('Measurement deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function openMedicationLogModal(id){
  var m=periodMedLogs.find(function(r){return r.log_id===id;});
  if(!m)return;
  document.getElementById('history-detail-title').textContent=m.name||'Medication';
  document.getElementById('history-detail-content').innerHTML=
    detailInput('Date','detail-med-date',m.log_date,'date')+
    detailInput('Name','detail-med-name',m.name||'')+
    detailInput('Status','detail-med-status',m.take_status_code||'')+
    detailInput('Type','detail-med-type',m.pill_type_code||'')+
    detailArea('Raw value','detail-med-raw',m.raw_value||'')+
    '<button class="btn btn-primary" onclick="saveMedicationLog(\''+m.log_id+'\')">Save Medication Log</button>'+
    '<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteMedicationLog(\''+m.log_id+'\')">Delete Medication Log</button>';
  document.getElementById('history-detail-modal').style.display='flex';
}

async function saveMedicationLog(id){
  var payload={
    log_date:document.getElementById('detail-med-date').value,
    name:document.getElementById('detail-med-name').value.trim()||null,
    take_status_code:document.getElementById('detail-med-status').value.trim()||null,
    pill_type_code:document.getElementById('detail-med-type').value.trim()||null,
    raw_value:document.getElementById('detail-med-raw').value.trim()||null
  };
  if(!payload.log_date){toast('Date is required');return;}
  try{await sbFetch('/rest/v1/period_medication_logs?log_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});closeModal('history-detail-modal');toast('Medication log saved');loadData();}catch(e){toast('Error: '+e.message);}
}

async function deleteMedicationLog(id){
  if(!confirm('Delete this medication log?'))return;
  try{await sbFetch('/rest/v1/period_medication_logs?log_id=eq.'+encodeURIComponent(id),{method:'DELETE'});closeModal('history-detail-modal');toast('Medication log deleted');loadData();}catch(e){toast('Error: '+e.message);}
}

function renderHistory(){
  var rows=[],lastDate=null;
  cycles.forEach(function(c){rows.push({type:'cycle',date:c.start_date,row:c});});
  intimacy.forEach(function(x){rows.push({type:'intimacy',date:x.logged_date,row:x});});
  periodNotes.forEach(function(n){rows.push({type:'note',date:n.note_date,row:n});});
  periodEvents.forEach(function(e){rows.push({type:'event',date:e.event_date,row:e});});
  periodMeasurements.forEach(function(m){rows.push({type:'measurement',date:m.measurement_date,row:m});});
  periodMedLogs.forEach(function(m){rows.push({type:'medication',date:m.log_date,row:m});});
  rows.sort(function(a,b){return b.date.localeCompare(a.date);});
  var exclusionHtml='<div class="history-section"><h3>Excluded ranges</h3>'+
    (exclusions.length?exclusions.map(function(x){
      return '<div class="log-item" onclick="openExclusionModal(\''+x.id+'\')"><div class="log-icon">🚫</div><div class="log-info"><div class="log-title">'+esc((x.reason||'excluded').replace(/_/g,' '))+'</div><div class="log-detail">'+fmtDate(x.start_date)+' - '+fmtDate(x.end_date)+' · '+(daysBetween(x.start_date,x.end_date)+1)+' days'+(x.notes?' · '+esc(x.notes):'')+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
    }).join(''):'<div class="empty-log" style="padding:12px">No excluded ranges yet</div>')+
    '<button class="btn btn-secondary" onclick="openExclusionModal()">Add Excluded Range</button></div>';
  var timeline=rows.length?rows.slice(0,220).map(function(item){
      var heading='';
      if(item.date!==lastDate){lastDate=item.date;heading='<div class="timeline-date">'+fmtFullDate(item.date)+'</div>';}
      if(item.type==='cycle'){
        var c=item.row,len=c.end_date?daysBetween(c.start_date,c.end_date)+1:null;
        return heading+'<div class="log-item" onclick="openCycleModal(\''+c.id+'\')"><div class="log-icon">🩸</div><div class="log-info"><div class="log-title">Period started</div><div class="log-detail">'+esc(c.flow||'medium')+(len?' · '+len+' day'+(len!==1?'s':''):' · still active')+(isExcludedCycle(c)?' · excluded from predictions':'')+(c.symptoms&&c.symptoms.length?' · '+esc(c.symptoms.join(', ')):'')+(c.notes?' · '+esc(c.notes):'')+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
      }
      if(item.type==='intimacy'){
        var x=item.row,r=riskForDate(x.logged_date,x.protection,x.emergency_contraception);
        return heading+'<div class="log-item" onclick="openIntimacyModal(\''+x.id+'\')"><div class="log-icon">🛡️</div><div class="log-info"><div class="log-title">Risk note</div><div class="log-detail">'+esc(protectionLabel(x.protection))+(x.emergency_contraception?' · emergency contraception':'')+(x.notes?' · '+esc(x.notes):'')+'<br><span class="risk-pill risk-'+r.level+'">'+esc(r.label)+'</span></div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
      }
      if(item.type==='note'){
        var n=item.row;
        return heading+'<div class="log-item" onclick="openNoteModal(\''+n.note_id+'\')"><div class="log-icon">📝</div><div class="log-info"><div class="log-title">Note</div><div class="log-detail">'+esc(n.note_text)+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
      }
      if(item.type==='event'){
        var e=item.row;
        return heading+'<div class="log-item" onclick="openEventModal(\''+e.event_id+'\')"><div class="log-icon">✨</div><div class="log-info"><div class="log-title">'+esc(eventTitle(e))+'</div><div class="log-detail">'+esc(eventDetail(e))+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
      }
      if(item.type==='measurement'){
        var m=item.row;
        return heading+'<div class="log-item" onclick="openMeasurementModal(\''+m.measurement_id+'\')"><div class="log-icon">📏</div><div class="log-info"><div class="log-title">'+esc(measurementTitle(m))+'</div><div class="log-detail">'+esc(measurementDetail(m))+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
      }
      var med=item.row;
      return heading+'<div class="log-item" onclick="openMedicationLogModal(\''+med.log_id+'\')"><div class="log-icon">💊</div><div class="log-info"><div class="log-title">'+esc(med.name||'Medication')+'</div><div class="log-detail">'+esc(medicationDetail(med))+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
    }).join(''):'<div class="empty-log">No period history yet</div>';
  document.getElementById('history-content').innerHTML=exclusionHtml+'<div class="timeline-group"><h3 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Timeline</h3>'+timeline+'</div>';
}

function renderReports(){
  var el=document.getElementById('reports-content');
  if(!cycles.length){el.innerHTML='<div class="empty-log">No period logs to report yet</div>';return;}
  var usable=usableCycles();
  var sorted=usable.slice().sort(function(a,b){return b.start_date.localeCompare(a.start_date);});
  var completed=usable.filter(function(c){return c.end_date;});
  var range=avgCycleRange();
  var noteCycles=sorted.filter(function(c){return c.notes||c.symptoms&&c.symptoms.length;});
  var symptomCounts={},flowCounts={},eventCatCounts={},measurementTypeCounts={},medCounts={};
  usable.forEach(function(c){
    flowCounts[c.flow||'medium']=(flowCounts[c.flow||'medium']||0)+1;
    (c.symptoms||[]).forEach(function(s){symptomCounts[s]=(symptomCounts[s]||0)+1;});
  });
  periodEvents.forEach(function(e){
    eventCatCounts[e.category]=(eventCatCounts[e.category]||0)+1;
    if(e.category==='symptom')symptomCounts[e.label||('code '+e.code)]=(symptomCounts[e.label||('code '+e.code)]||0)+1;
  });
  periodMeasurements.forEach(function(m){measurementTypeCounts[m.measurement_type]=(measurementTypeCounts[m.measurement_type]||0)+1;});
  periodMedLogs.forEach(function(m){medCounts[m.name||'Medication']=(medCounts[m.name||'Medication']||0)+1;});
  var symptomRows=Object.keys(symptomCounts).sort(function(a,b){return symptomCounts[b]-symptomCounts[a];});
  var flowRows=Object.keys(flowCounts).sort(function(a,b){return flowCounts[b]-flowCounts[a];});
  var maxSym=symptomRows.length?symptomCounts[symptomRows[0]]:1;
  var maxFlow=flowRows.length?flowCounts[flowRows[0]]:1;
  var eventRows=Object.keys(eventCatCounts).sort(function(a,b){return eventCatCounts[b]-eventCatCounts[a];});
  var measurementRows=Object.keys(measurementTypeCounts).sort(function(a,b){return measurementTypeCounts[b]-measurementTypeCounts[a];});
  var medRows=Object.keys(medCounts).sort(function(a,b){return medCounts[b]-medCounts[a];});
  var avgPeriod=completed.length?Math.round(completed.reduce(function(s,c){return s+daysBetween(c.start_date,c.end_date)+1;},0)/completed.length):model.avgPeriod;
  el.innerHTML='<div class="report-wrap">'+
    '<div class="report-grid">'+
      '<div class="report-card"><div class="r-val">'+cycles.length+'</div><div class="r-lbl">Periods logged</div></div>'+
      '<div class="report-card"><div class="r-val">'+usable.length+'</div><div class="r-lbl">Used for estimates</div></div>'+
      '<div class="report-card"><div class="r-val">'+model.avgCycle+'d</div><div class="r-lbl">Avg cycle</div></div>'+
      '<div class="report-card"><div class="r-val">'+avgPeriod+'d</div><div class="r-lbl">Avg period</div></div>'+
      '<div class="report-card"><div class="r-val">'+periodEvents.length+'</div><div class="r-lbl">Daily events</div></div>'+
      '<div class="report-card"><div class="r-val">'+periodNotes.length+'</div><div class="r-lbl">Notes</div></div>'+
    '</div>'+
    (exclusions.length?'<div class="report-list"><h3>Excluded ranges</h3>'+exclusions.map(function(x){return '<div class="report-row"><span>'+fmtDate(x.start_date)+' - '+fmtDate(x.end_date)+'<br><small style="color:var(--muted)">'+esc(x.reason||'excluded')+(x.notes?' · '+esc(x.notes):'')+'</small></span><strong>'+daysBetween(x.start_date,x.end_date)+'d</strong></div>';}).join('')+'</div>':'')+
    '<div class="report-list"><h3>Cycle range</h3><div class="report-row"><span>Shortest - longest estimated cycle</span><strong>'+(range?range.min+'-'+range.max+'d':'-')+'</strong></div></div>'+
    '<div class="report-list"><h3>Symptoms</h3>'+
      (symptomRows.length?symptomRows.map(function(s){var pct=Math.round(symptomCounts[s]/maxSym*100);return '<div class="report-row"><div style="flex:1"><div>'+esc(s)+'</div><div class="report-bar"><span style="width:'+pct+'%"></span></div></div><strong>'+symptomCounts[s]+'</strong></div>';}).join(''):'<div class="empty-log" style="padding:12px">No symptoms logged yet</div>')+
    '</div>'+
    (eventRows.length?'<div class="report-list"><h3>Imported event categories</h3>'+eventRows.map(function(k){return '<div class="report-row"><span>'+esc(k)+'</span><strong>'+eventCatCounts[k]+'</strong></div>';}).join('')+'</div>':'')+
    (periodNotes.length?'<div class="report-list"><h3>Imported notes</h3>'+periodNotes.slice(0,30).map(function(n){return '<div class="note-card"><div class="note-date">'+fmtFullDate(n.note_date)+'</div><div class="log-detail">'+esc(n.note_text)+'</div></div>';}).join('')+'</div>':'')+
    (measurementRows.length?'<div class="report-list"><h3>Measurements</h3>'+measurementRows.map(function(k){return '<div class="report-row"><span>'+esc(k)+'</span><strong>'+measurementTypeCounts[k]+'</strong></div>';}).join('')+'</div>':'')+
    (medRows.length?'<div class="report-list"><h3>Medication logs</h3>'+medRows.map(function(k){return '<div class="report-row"><span>'+esc(k)+'</span><strong>'+medCounts[k]+'</strong></div>';}).join('')+'</div>':'')+
    '<div class="report-list"><h3>Flow</h3>'+
      (flowRows.length?flowRows.map(function(f){var pct=Math.round(flowCounts[f]/maxFlow*100);return '<div class="report-row"><div style="flex:1"><div>'+esc(f)+'</div><div class="report-bar"><span style="width:'+pct+'%"></span></div></div><strong>'+flowCounts[f]+'</strong></div>';}).join(''):'')+
    '</div>'+
    '<div class="report-list"><h3>Notes and Symptoms Timeline</h3>'+
      (noteCycles.length?noteCycles.map(function(c){var len=c.end_date?daysBetween(c.start_date,c.end_date)+1:null;return '<div class="note-card" onclick="openCycleModal(\''+c.id+'\')"><div class="note-date">'+fmtFullDate(c.start_date)+'</div><div class="note-meta">'+esc(c.flow||'medium')+(len?' · '+len+' day'+(len!==1?'s':''):' · active')+(c.symptoms&&c.symptoms.length?' · '+esc(c.symptoms.join(', ')):'')+'</div>'+(c.notes?'<div class="log-detail">'+esc(c.notes)+'</div>':'')+'</div>';}).join(''):'<div class="empty-log" style="padding:12px">No notes or symptoms logged yet</div>')+
    '</div>'+
  '</div>';
}

function protectionLabel(p){
  return {none:'No protection / unknown',condom:'Condom',withdrawal:'Withdrawal',pill:'Hormonal pill',iud:'IUD',implant:'Implant',injection:'Injection',other:'Other protection'}[p]||'Unknown';
}

var toastTimer;
function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},2500);}

window.onload=async function(){
  if(!await FamilyPal.requireSession())return;
  FamilyPal.startTokenRefresh();
  viewMonth=new Date();
  loadData();
};
