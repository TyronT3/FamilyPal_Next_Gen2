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
var sexFilterStart='',sexFilterEnd='';
var calendarFilters=loadCalendarFilters();

function loadCalendarFilters(){
  var defaults={period:true,predicted:true,fertile:true,ovulation:true,intimacy:true,notes:true,events:true};
  try{return Object.assign(defaults,JSON.parse(localStorage.getItem('periodpal_calendar_filters')||'{}'));}catch(e){return defaults;}
}

function toggleCalendarFilter(key){
  calendarFilters[key]=!calendarFilters[key];
  localStorage.setItem('periodpal_calendar_filters',JSON.stringify(calendarFilters));
  renderCalendar();
}

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
    periodNotes.sort(function(a,b){return b.note_date.localeCompare(a.note_date);});
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
  var sorted=modelCycles().sort(function(a,b){return a.start_date.localeCompare(b.start_date);});
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
  if(!modelCycles().length){
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
  var sorted=modelCycles().sort(function(a,b){return a.start_date.localeCompare(b.start_date);});
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
    if(calendarFilters.period&&isLoggedPeriod(key)){cls.push('period');dots.push('tag-period');}
    if(calendarFilters.predicted&&isPredictedPeriod(key)){cls.push('predicted');dots.push('tag-predicted');}
    if(calendarFilters.fertile&&isBetween(key,model.fertileStart,model.fertileEnd)){cls.push('fertile');dots.push('tag-fertile');}
    if(calendarFilters.ovulation&&key===model.ovulation){cls.push('ovulation');dots.push('tag-ovulation');}
    if(calendarFilters.intimacy&&intimacy.some(function(x){return x.logged_date===key;}))dots.push('tag-intimacy');
    if(calendarFilters.notes&&periodNotes.some(function(x){return x.note_date===key;}))dots.push('tag-note');
    if(calendarFilters.events&&visibleEvents().some(function(x){return x.event_date===key;}))dots.push('tag-event');
    html+='<div class="'+cls.join(' ')+'" onclick="openDay(\''+key+'\')"><div class="day-num">'+d.getDate()+'</div><div class="day-tags">'+dots.slice(0,4).map(function(c){return'<i class="tag-dot '+c+'"></i>';}).join('')+'</div></div>';
  }
  document.getElementById('calendar-grid').innerHTML=html;
  renderCalendarFilters();
}

function renderCalendarFilters(){
  var el=document.getElementById('calendar-filters');
  if(!el)return;
  var labels={period:'Logged',predicted:'Predicted',fertile:'Fertile',ovulation:'Ovulation',intimacy:'Intimacy',notes:'Notes',events:'Symptoms'};
  el.innerHTML=Object.keys(labels).map(function(k){
    return '<button class="filter-chip '+(calendarFilters[k]?'active':'')+'" onclick="toggleCalendarFilter(\''+k+'\')">'+esc(labels[k])+'</button>';
  }).join('');
}

function moveMonth(delta){viewMonth.setMonth(viewMonth.getMonth()+delta);renderCalendar();}
function isBetween(key,start,end){return start&&end&&key>=start&&key<=end;}
function isExcludedDate(key){return exclusions.some(function(x){return key>=x.start_date&&key<=x.end_date;});}
function isExcludedCycle(c){return isExcludedDate(c.start_date);}
function usableCycles(){return cycles.filter(function(c){return !isExcludedCycle(c);});}
function cycleForDay(key){
  return cycles.slice().sort(function(a,b){return cycleRank(b)-cycleRank(a);}).find(function(c){return key>=c.start_date&&key<=(c.end_date||todayKey());})||null;
}
function modelCycles(){
  var byStart={};
  usableCycles().forEach(function(c){
    var existing=byStart[c.start_date];
    if(!existing||cycleRank(c)>cycleRank(existing))byStart[c.start_date]=c;
  });
  return Object.keys(byStart).map(function(k){return byStart[k];});
}
function cycleRank(c){
  var rank=c.end_date?10:0;
  if(c.notes)rank+=2;
  if(c.symptoms&&c.symptoms.length)rank+=1;
  if(c.updated_at){
    var ts=Date.parse(c.updated_at);
    if(!isNaN(ts))rank+=Math.min(1,ts/100000000000000);
  }
  return rank;
}
function sortedModelCycles(){return modelCycles().sort(function(a,b){return a.start_date.localeCompare(b.start_date);});}
function cycleWindow(c){
  var sorted=sortedModelCycles();
  var idx=sorted.findIndex(function(x){return x.start_date===c.start_date;});
  var next=idx>=0?sorted[idx+1]:null;
  return {start:c.start_date,end:next?addDays(next.start_date,-1):(c.end_date||addDays(c.start_date,model.avgCycle-1)),next:next};
}
function duplicateCycleGroups(){
  var groups={};
  cycles.forEach(function(c){groups[c.start_date]=groups[c.start_date]||[];groups[c.start_date].push(c);});
  return Object.keys(groups).filter(function(k){return groups[k].length>1;}).map(function(k){
    return {start_date:k,rows:groups[k].slice().sort(function(a,b){return cycleRank(b)-cycleRank(a);})};
  }).sort(function(a,b){return b.start_date.localeCompare(a.start_date);});
}
function modelDiagnostics(){
  var sorted=sortedModelCycles(),used=[],ignored=[];
  for(var i=1;i<sorted.length;i++){
    var diff=daysBetween(sorted[i-1].start_date,sorted[i].start_date);
    var row={from:sorted[i-1].start_date,to:sorted[i].start_date,days:diff};
    if(diff>=18&&diff<=45)used.push(row);
    else ignored.push(Object.assign(row,{reason:diff<18?'too short':'long gap'}));
  }
  cycles.filter(isExcludedCycle).forEach(function(c){ignored.push({from:c.start_date,to:c.end_date||c.start_date,days:c.end_date?daysBetween(c.start_date,c.end_date)+1:1,reason:'excluded range'});});
  duplicateCycleGroups().forEach(function(g){ignored.push({from:g.start_date,to:g.start_date,days:g.rows.length-1,reason:'duplicate starts collapsed'});});
  return {used:used,ignored:ignored,cycleCount:sorted.length};
}
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
  var dayEvents=visibleEvents().filter(function(x){return x.event_date===key;});
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
    '<button class="btn btn-secondary" onclick="closeModal(\'day-modal\');openEventModal(null,\''+key+'\',\'symptom\')">Log Symptom / Mood</button>'+
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
  if(!c&&day)c=cycleForDay(day);
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
  var duplicate=!id?cycles.find(function(c){return c.start_date===start;}):cycles.find(function(c){return c.start_date===start&&c.id!==id;});
  var symptoms=[].slice.call(document.querySelectorAll('input[name="symptom"]:checked')).map(function(b){return b.value;});
  var payload={start_date:start,end_date:end||null,flow:document.getElementById('cycle-flow').value,symptoms:symptoms,notes:document.getElementById('cycle-notes').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(duplicate&&!id)id=duplicate.id;
    if(duplicate&&document.getElementById('cycle-id').value){toast('A period already starts on that date');return;}
    if(id)await sbFetch('/rest/v1/period_cycles?id=eq.'+id,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    else await sbFetch('/rest/v1/period_cycles',{method:'POST',body:JSON.stringify(payload)});
    closeModal('cycle-modal');toast(duplicate?'Updated existing period for that date':'Period saved');loadData();
  }catch(e){toast('Error: '+e.message);}
}

async function quickStartPeriod(){
  var existing=cycles.find(function(c){return c.start_date===todayKey();});
  if(existing){toast('Period already started today');openCycleModal(existing.id);return;}
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

async function deleteCycleById(id){
  if(!id||!confirm('Delete this duplicate period log?'))return;
  try{await sbFetch('/rest/v1/period_cycles?id=eq.'+id,{method:'DELETE'});toast('Duplicate deleted');loadData();}catch(e){toast('Error: '+e.message);}
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

function hasMeaningfulEventName(e){
  if(!e)return false;
  if(e.category==='sex')return true;
  if(e.label&&String(e.label).trim())return true;
  if(e.category!=='symptom'&&e.category!=='mood'&&(e.value_text||e.value_number!=null||e.unit))return true;
  return false;
}

function visibleEvents(){
  return periodEvents.filter(hasMeaningfulEventName);
}

function importAudit(){
  var hidden=periodEvents.filter(function(e){return !hasMeaningfulEventName(e);});
  var codeOnly=hidden.filter(function(e){return e.category==='symptom'||e.category==='mood';});
  var imported=periodEvents.filter(function(e){return e.source_app&&e.source_app!=='manual';});
  return {
    imported:imported.length,
    totalEvents:periodEvents.length,
    visible:visibleEvents().length,
    hidden:hidden.length,
    codeOnly:codeOnly.length,
    symptomCodes:codeOnly.filter(function(e){return e.category==='symptom';}).length,
    moodCodes:codeOnly.filter(function(e){return e.category==='mood';}).length
  };
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

function openEventModal(id,day,category){
  var e=id?periodEvents.find(function(r){return r.event_id===id;}):null;
  if(id&&!e)return;
  var isNew=!e;
  e=e||{event_id:'',source_app:'manual',event_date:day||todayKey(),category:category||'symptom',label:'',code:'',severity_code:'',value_text:'',value_number:null,unit:'',raw_value:''};
  document.getElementById('history-detail-title').textContent=isNew?'Symptom / Mood':eventTitle(e);
  document.getElementById('history-detail-content').innerHTML=
    '<div class="detail-grid"><div class="detail-chip"><span>Source</span><strong>'+esc(e.source_app||'manual')+'</strong></div><div class="detail-chip"><span>ID</span><strong>'+esc(e.event_id||'new')+'</strong></div></div>'+
    detailInput('Date','detail-event-date',e.event_date,'date')+
    '<div class="date-row"><label>Category</label><select id="detail-event-category"><option value="symptom" '+(e.category==='symptom'?'selected':'')+'>Symptom</option><option value="mood" '+(e.category==='mood'?'selected':'')+'>Mood</option><option value="sex" '+(e.category==='sex'?'selected':'')+'>Sex</option><option value="workout" '+(e.category==='workout'?'selected':'')+'>Workout</option><option value="water" '+(e.category==='water'?'selected':'')+'>Water</option><option value="pregnancy_test" '+(e.category==='pregnancy_test'?'selected':'')+'>Pregnancy test</option><option value="other" '+(['symptom','mood','sex','workout','water','pregnancy_test'].indexOf(e.category)<0?'selected':'')+'>Other</option></select></div>'+
    '<div class="section-label">Quick names</div><div class="type-toggle">'+['Cramps','Headache','Bloating','Fatigue','Nausea','Back pain','Tender breasts','Emotional','Irritable','Happy','Anxious','Low mood'].map(function(s){return '<button class="type-opt" onclick="chooseEventPreset(\''+s.replace(/'/g,'')+'\')">'+esc(s)+'</button>';}).join('')+'</div>'+
    detailInput('Name','detail-event-label',e.label||'')+
    detailInput('Code','detail-event-code',e.code||'')+
    detailInput('Severity','detail-event-severity',e.severity_code||'')+
    detailInput('Value','detail-event-value-text',e.value_text||'')+
    detailInput('Number','detail-event-value-number',e.value_number==null?'':e.value_number,'number')+
    detailInput('Unit','detail-event-unit',e.unit||'')+
    detailArea('Raw value','detail-event-raw',e.raw_value||'')+
    '<button class="btn btn-primary" onclick="saveEvent(\''+(e.event_id||'')+'\')">Save Event</button>'+
    (isNew?'':'<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteEvent(\''+e.event_id+'\')">Delete Event</button>');
  document.getElementById('history-detail-modal').style.display='flex';
}

function chooseEventPreset(name){
  document.getElementById('detail-event-label').value=name;
  document.getElementById('detail-event-category').value=['Emotional','Irritable','Happy','Anxious','Low mood'].indexOf(name)>=0?'mood':'symptom';
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
  if((payload.category==='symptom'||payload.category==='mood')&&!payload.label){toast('Add a meaningful name first');return;}
  try{
    if(id)await sbFetch('/rest/v1/period_events?event_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    else{
      payload.event_id='manual_'+payload.category+'_'+Date.now();
      payload.source_app='manual';
      await sbFetch('/rest/v1/period_events',{method:'POST',body:JSON.stringify(payload)});
    }
    closeModal('history-detail-modal');toast('Event saved');loadData();
  }catch(e){toast('Error: '+e.message);}
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

function entriesForCycle(c){
  var w=cycleWindow(c),start=w.start,end=w.end;
  return {
    window:w,
    cycles:cycles.filter(function(x){return x.start_date===c.start_date;}),
    notes:periodNotes.filter(function(x){return x.note_date>=start&&x.note_date<=end;}),
    events:visibleEvents().filter(function(x){return x.event_date>=start&&x.event_date<=end;}),
    intimacy:intimacy.filter(function(x){return x.logged_date>=start&&x.logged_date<=end;}),
    measurements:periodMeasurements.filter(function(x){return x.measurement_date>=start&&x.measurement_date<=end;}),
    meds:periodMedLogs.filter(function(x){return x.log_date>=start&&x.log_date<=end;})
  };
}

function openCycleDetail(startDate){
  var c=modelCycles().find(function(x){return x.start_date===startDate;})||cycles.find(function(x){return x.start_date===startDate;});
  if(!c)return;
  var data=entriesForCycle(c),w=data.window,len=c.end_date?daysBetween(c.start_date,c.end_date)+1:null;
  document.getElementById('history-detail-title').textContent='Cycle Detail';
  document.getElementById('history-detail-content').innerHTML=
    '<div class="detail-grid">'+
      '<div class="detail-chip"><span>Started</span><strong>'+fmtDate(c.start_date)+'</strong></div>'+
      '<div class="detail-chip"><span>Period length</span><strong>'+(len?len+' days':'active')+'</strong></div>'+
      '<div class="detail-chip"><span>Cycle window</span><strong>'+fmtDate(w.start)+' - '+fmtDate(w.end)+'</strong></div>'+
      '<div class="detail-chip"><span>Entries</span><strong>'+(data.notes.length+data.events.length+data.intimacy.length+data.measurements.length+data.meds.length)+'</strong></div>'+
    '</div>'+
    '<button class="btn btn-secondary" onclick="openCycleModal(\''+c.id+'\')">Edit Period</button>'+
    (data.cycles.length>1?'<div class="report-list"><h3>Duplicate starts</h3>'+data.cycles.map(function(x,i){return '<div class="report-row"><span>'+esc(x.flow||'medium')+(x.end_date?' · ends '+fmtDate(x.end_date):'')+(x.notes?' · '+esc(x.notes):'')+'</span><strong>'+(i===0?'Keep':'')+'</strong></div>'+(i>0?'<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteCycleById(\''+x.id+'\')">Delete Duplicate</button>':'');}).join('')+'</div>':'')+
    '<div class="report-list"><h3>Cycle entries</h3>'+
      (data.events.length?data.events.map(function(e){return '<div class="report-row" onclick="openEventModal(\''+e.event_id+'\')"><span>'+fmtDate(e.event_date)+'<br><small style="color:var(--muted)">'+esc(eventTitle(e))+' · '+esc(eventDetail(e))+'</small></span><strong>'+esc(e.category)+'</strong></div>';}).join(''):'')+
      (data.notes.length?data.notes.map(function(n){return '<div class="report-row" onclick="openNoteModal(\''+n.note_id+'\')"><span>'+fmtDate(n.note_date)+'<br><small style="color:var(--muted)">'+esc(n.note_text)+'</small></span><strong>note</strong></div>';}).join(''):'')+
      (data.intimacy.length?data.intimacy.map(function(x){return '<div class="report-row" onclick="openIntimacyModal(\''+x.id+'\')"><span>'+fmtDate(x.logged_date)+'<br><small style="color:var(--muted)">'+esc(protectionLabel(x.protection))+(x.notes?' · '+esc(x.notes):'')+'</small></span><strong>sex</strong></div>';}).join(''):'')+
      (data.meds.length?data.meds.map(function(m){return '<div class="report-row" onclick="openMedicationLogModal(\''+m.log_id+'\')"><span>'+fmtDate(m.log_date)+'<br><small style="color:var(--muted)">'+esc(m.name||'Medication')+' · '+esc(medicationDetail(m))+'</small></span><strong>med</strong></div>';}).join(''):'')+
      (data.measurements.length?data.measurements.map(function(m){return '<div class="report-row" onclick="openMeasurementModal(\''+m.measurement_id+'\')"><span>'+fmtDate(m.measurement_date)+'<br><small style="color:var(--muted)">'+esc(measurementTitle(m))+' · '+esc(measurementDetail(m))+'</small></span><strong>measure</strong></div>';}).join(''):'')+
      (!(data.events.length||data.notes.length||data.intimacy.length||data.meds.length||data.measurements.length)?'<div class="empty-log" style="padding:12px">No daily entries inside this cycle yet</div>':'')+
    '</div>';
  document.getElementById('history-detail-modal').style.display='flex';
}

function renderHistory(){
  var rows=[],lastDate=null;
  var dupes=duplicateCycleGroups();
  cycles.forEach(function(c){rows.push({type:'cycle',date:c.start_date,row:c});});
  intimacy.forEach(function(x){rows.push({type:'intimacy',date:x.logged_date,row:x});});
  periodNotes.forEach(function(n){rows.push({type:'note',date:n.note_date,row:n});});
  visibleEvents().forEach(function(e){rows.push({type:'event',date:e.event_date,row:e});});
  periodMeasurements.forEach(function(m){rows.push({type:'measurement',date:m.measurement_date,row:m});});
  periodMedLogs.forEach(function(m){rows.push({type:'medication',date:m.log_date,row:m});});
  rows.sort(function(a,b){return b.date.localeCompare(a.date);});
  var exclusionHtml='<div class="history-section"><h3>Excluded ranges</h3>'+
    (exclusions.length?exclusions.map(function(x){
      return '<div class="log-item" onclick="openExclusionModal(\''+x.id+'\')"><div class="log-icon">🚫</div><div class="log-info"><div class="log-title">'+esc((x.reason||'excluded').replace(/_/g,' '))+'</div><div class="log-detail">'+fmtDate(x.start_date)+' - '+fmtDate(x.end_date)+' · '+(daysBetween(x.start_date,x.end_date)+1)+' days'+(x.notes?' · '+esc(x.notes):'')+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
    }).join(''):'<div class="empty-log" style="padding:12px">No excluded ranges yet</div>')+
    '<button class="btn btn-secondary" onclick="openExclusionModal()">Add Excluded Range</button></div>';
  var duplicateHtml=dupes.length?'<div class="history-section"><h3>Duplicate period starts</h3>'+dupes.map(function(g){
    return '<div class="note-card"><div class="note-date">'+fmtFullDate(g.start_date)+'</div><div class="note-meta">'+g.rows.length+' entries found · calculations use one</div>'+
      g.rows.map(function(c,i){return '<div class="report-row"><span>'+esc(c.flow||'medium')+(c.end_date?' · ends '+fmtDate(c.end_date):'')+(c.notes?' · '+esc(c.notes):'')+'</span><strong>'+(i===0?'Keep':'')+'</strong></div>'+(i>0?'<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteCycleById(\''+c.id+'\')">Delete Duplicate</button>':'');}).join('')+
    '</div>';
  }).join('')+'</div>':'';
  var timeline=rows.length?rows.slice(0,220).map(function(item){
      var heading='';
      if(item.date!==lastDate){lastDate=item.date;heading='<div class="timeline-date">'+fmtFullDate(item.date)+'</div>';}
      if(item.type==='cycle'){
        var c=item.row,len=c.end_date?daysBetween(c.start_date,c.end_date)+1:null;
        return heading+'<div class="log-item" onclick="openCycleDetail(\''+c.start_date+'\')"><div class="log-icon">🩸</div><div class="log-info"><div class="log-title">Period started</div><div class="log-detail">'+esc(c.flow||'medium')+(len?' · '+len+' day'+(len!==1?'s':''):' · still active')+(isExcludedCycle(c)?' · excluded from predictions':'')+(c.symptoms&&c.symptoms.length?' · '+esc(c.symptoms.join(', ')):'')+(c.notes?' · '+esc(c.notes):'')+'</div></div><div class="log-actions"><button class="undo-btn">Open</button></div></div>';
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
  document.getElementById('history-content').innerHTML=exclusionHtml+duplicateHtml+'<div class="timeline-group"><h3 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Timeline</h3>'+timeline+'</div>';
}

function sexRawDetails(e){
  var parts=[];
  try{
    var raw=JSON.parse(e.raw_value||e.value_text||'{}');
    if(raw.times!=null)parts.push(raw.times+' time'+(Number(raw.times)===1?'':'s'));
    if(raw.condom!=null)parts.push(raw.condom?'condom marked':'no condom marked');
    if(raw.orgasm_code!=null)parts.push('orgasm code '+raw.orgasm_code);
  }catch(err){}
  if(!parts.length&&e.value_text)parts.push(e.value_text);
  if(!parts.length&&e.value_number!=null)parts.push(String(e.value_number)+(e.unit?' '+e.unit:''));
  return parts.join(' · ')||'Imported sex event';
}

function protectionFromSexEvent(e,match){
  if(match&&match.protection)return match.protection;
  try{
    var raw=JSON.parse(e.raw_value||e.value_text||'{}');
    if(raw.condom===true)return 'condom';
    if(raw.condom===false)return 'none';
  }catch(err){}
  return 'none';
}

function sexReportRows(){
  var rows=[],byImport={},sexEventIds={};
  intimacy.forEach(function(x){if(x.import_event_id)byImport[x.import_event_id]=x;});
  periodEvents.filter(function(e){return e.category==='sex';}).forEach(function(e){
    sexEventIds[e.event_id]=true;
    var match=byImport[e.event_id]||null;
    var protection=protectionFromSexEvent(e,match);
    var risk=match?riskForDate(match.logged_date,match.protection,match.emergency_contraception):riskForDate(e.event_date,protection,false);
    rows.push({
      date:e.event_date,
      kind:'imported',
      title:'Imported sex event',
      detail:sexRawDetails(e)+(match&&match.notes?' · '+match.notes:''),
      protection:protection,
      ec:!!(match&&match.emergency_contraception),
      risk:risk,
      onclick:'openEventModal(\''+e.event_id+'\')'
    });
  });
  intimacy.filter(function(x){return !x.import_event_id||!sexEventIds[x.import_event_id];}).forEach(function(x){
    rows.push({
      date:x.logged_date,
      kind:'risk',
      title:'Pregnancy risk note',
      detail:protectionLabel(x.protection)+(x.notes?' · '+x.notes:''),
      protection:x.protection,
      ec:!!x.emergency_contraception,
      risk:riskForDate(x.logged_date,x.protection,x.emergency_contraception),
      onclick:'openIntimacyModal(\''+x.id+'\')'
    });
  });
  return rows.sort(function(a,b){return b.date.localeCompare(a.date);});
}

function filteredSexRows(rows){
  return rows.filter(function(x){
    return (!sexFilterStart||x.date>=sexFilterStart)&&(!sexFilterEnd||x.date<=sexFilterEnd);
  });
}

function positivePregnancyTests(){
  return periodEvents.filter(function(e){
    var text=[e.category,e.label,e.code,e.value_text,e.raw_value].filter(Boolean).join(' ').toLowerCase();
    return e.category==='pregnancy_test'&&(text.indexOf('positive')>=0||text.indexOf('pregnant')>=0||text.indexOf('1')>=0);
  }).sort(function(a,b){return b.event_date.localeCompare(a.event_date);});
}

function pregnancySourceEstimate(testDate){
  if(!testDate)return null;
  var before=sortedModelCycles().filter(function(c){return c.start_date<=testDate;});
  var last=before[before.length-1]||null;
  var ov=last?addDays(last.start_date,model.avgCycle-14):addDays(testDate,-14);
  var likelyStart=addDays(ov,-5),likelyEnd=addDays(ov,1);
  var broadStart=addDays(testDate,-28),broadEnd=addDays(testDate,-7);
  var sex=sexReportRows().filter(function(x){return x.date>=broadStart&&x.date<=testDate;});
  sex.forEach(function(x){
    x.sourceRank=(x.date>=likelyStart&&x.date<=likelyEnd)?'Most likely':(x.date>=broadStart&&x.date<=broadEnd?'Possible':'Unlikely');
  });
  return {testDate:testDate,last:last,ovulation:ov,likelyStart:likelyStart,likelyEnd:likelyEnd,broadStart:broadStart,broadEnd:broadEnd,sex:sex};
}

function medicationAdherenceRows(){
  var by={};
  periodMedLogs.forEach(function(m){
    var key=(m.log_date||'').slice(0,7),name=m.name||'Medication';
    var id=key+'|'+name;
    by[id]=by[id]||{month:key,name:name,total:0,taken:0,missed:0};
    by[id].total++;
    var status=String(m.take_status_code||m.raw_value||'').toLowerCase();
    if(status==='1'||status.indexOf('taken')>=0)by[id].taken++;
    else by[id].missed++;
  });
  return Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return b.month.localeCompare(a.month)||a.name.localeCompare(b.name);});
}

function applySexReportFilter(){
  sexFilterStart=document.getElementById('sex-filter-start').value;
  sexFilterEnd=document.getElementById('sex-filter-end').value;
  if(sexFilterStart&&sexFilterEnd&&sexFilterEnd<sexFilterStart){toast('End date must be after start date');return;}
  renderReports();
}

function setSexReportRange(days){
  if(days==='all'){
    sexFilterStart='';
    sexFilterEnd='';
  }else{
    sexFilterEnd=todayKey();
    sexFilterStart=addDays(sexFilterEnd,-days+1);
  }
  renderReports();
}

function exportPeriodPalData(){
  var data={
    exported_at:new Date().toISOString(),
    cycles:cycles,
    exclusions:exclusions,
    intimacy:intimacy,
    events:periodEvents,
    notes:periodNotes,
    measurements:periodMeasurements,
    medication_logs:periodMedLogs
  };
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download='periodpal-backup-'+todayKey()+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('PeriodPal backup exported');
}

function renderReports(){
  var el=document.getElementById('reports-content');
  if(!cycles.length&&!periodEvents.length&&!intimacy.length){el.innerHTML='<div class="empty-log">No period logs to report yet</div>';return;}
  var usable=usableCycles();
  var displayEvents=visibleEvents();
  var sorted=usable.slice().sort(function(a,b){return b.start_date.localeCompare(a.start_date);});
  var completed=usable.filter(function(c){return c.end_date;});
  var range=avgCycleRange();
  var noteCycles=sorted.filter(function(c){return c.notes||c.symptoms&&c.symptoms.length;});
  var symptomCounts={},flowCounts={},eventCatCounts={},measurementTypeCounts={},medCounts={};
  usable.forEach(function(c){
    flowCounts[c.flow||'medium']=(flowCounts[c.flow||'medium']||0)+1;
    (c.symptoms||[]).forEach(function(s){symptomCounts[s]=(symptomCounts[s]||0)+1;});
  });
  visibleEvents().forEach(function(e){
    eventCatCounts[e.category]=(eventCatCounts[e.category]||0)+1;
    if(e.category==='symptom'&&e.label)symptomCounts[e.label]=(symptomCounts[e.label]||0)+1;
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
  var sexRows=sexReportRows();
  var shownSexRows=filteredSexRows(sexRows);
  var sexProtected=shownSexRows.filter(function(x){return x.protection&&x.protection!=='none';}).length;
  var sexEc=shownSexRows.filter(function(x){return x.ec;}).length;
  var audit=importAudit();
  var diag=modelDiagnostics();
  var dupes=duplicateCycleGroups();
  var medAdherence=medicationAdherenceRows();
  var pregTests=positivePregnancyTests();
  var pregEstimate=pregnancySourceEstimate(pregTests[0]&&pregTests[0].event_date);
  var cycleBars=sortedModelCycles().map(function(c,i,arr){return i?{start:c.start_date,days:daysBetween(arr[i-1].start_date,c.start_date)}:null;}).filter(Boolean).filter(function(x){return x.days>=1;});
  var maxCycleBar=cycleBars.length?Math.max.apply(null,cycleBars.map(function(x){return x.days;})):1;
  var avgPeriod=completed.length?Math.round(completed.reduce(function(s,c){return s+daysBetween(c.start_date,c.end_date)+1;},0)/completed.length):model.avgPeriod;
  el.innerHTML='<div class="report-wrap">'+
    '<div class="report-grid">'+
      '<div class="report-card"><div class="r-val">'+cycles.length+'</div><div class="r-lbl">Periods logged</div></div>'+
      '<div class="report-card"><div class="r-val">'+usable.length+'</div><div class="r-lbl">Used for estimates</div></div>'+
      '<div class="report-card"><div class="r-val">'+model.avgCycle+'d</div><div class="r-lbl">Avg cycle</div></div>'+
      '<div class="report-card"><div class="r-val">'+avgPeriod+'d</div><div class="r-lbl">Avg period</div></div>'+
      '<div class="report-card"><div class="r-val">'+periodEvents.length+'</div><div class="r-lbl">Daily events</div></div>'+
      '<div class="report-card"><div class="r-val">'+displayEvents.length+'</div><div class="r-lbl">Named events</div></div>'+
      '<div class="report-card"><div class="r-val">'+periodNotes.length+'</div><div class="r-lbl">Notes</div></div>'+
      '<div class="report-card"><div class="r-val">'+shownSexRows.length+'</div><div class="r-lbl">Sex events</div></div>'+
      '<div class="report-card"><div class="r-val">'+sexProtected+'</div><div class="r-lbl">Protected</div></div>'+
    '</div>'+
    '<div class="report-list"><h3>Import Audit</h3>'+
      '<div class="report-row"><span>Imported event rows kept</span><strong>'+audit.imported+'</strong></div>'+
      '<div class="report-row"><span>Named/displayable event rows</span><strong>'+audit.visible+'</strong></div>'+
      '<div class="report-row"><span>Hidden code-only mood/symptom rows</span><strong>'+audit.codeOnly+'</strong></div>'+
      '<div style="font-size:11px;color:var(--muted);line-height:1.4;margin-top:8px">Hidden rows are still stored for future mapping. They are not shown in the timeline because their codes do not have meaningful names yet. Symptoms: '+audit.symptomCodes+' · moods: '+audit.moodCodes+'.</div>'+
    '</div>'+
    '<div class="report-list"><h3>Prediction Confidence</h3>'+
      '<div class="report-row"><span>Cycles available after exclusions and duplicate collapse</span><strong>'+diag.cycleCount+'</strong></div>'+
      '<div class="report-row"><span>Intervals used for average</span><strong>'+diag.used.length+'</strong></div>'+
      '<div class="report-row"><span>Ignored or protected records</span><strong>'+diag.ignored.length+'</strong></div>'+
      (diag.used.length?diag.used.slice(-8).reverse().map(function(x){return '<div class="report-row"><span>'+fmtDate(x.from)+' to '+fmtDate(x.to)+'</span><strong>'+x.days+'d</strong></div>';}).join(''):'<div class="empty-log" style="padding:12px">No normal intervals yet</div>')+
      (diag.ignored.length?'<div style="font-size:11px;color:var(--muted);margin-top:8px">Ignored: '+esc(diag.ignored.slice(-10).map(function(x){return x.reason+' '+fmtDate(x.from);}).join(' · '))+'</div>':'')+
    '</div>'+
    (dupes.length?'<div class="report-list"><h3>Duplicate Cleanup</h3>'+dupes.map(function(g){return '<div class="note-card"><div class="note-date">'+fmtFullDate(g.start_date)+'</div><div class="note-meta">'+g.rows.length+' period-start entries · calculations use the best one</div>'+g.rows.map(function(c,i){return '<div class="report-row"><span>'+esc(c.flow||'medium')+(c.end_date?' · ends '+fmtDate(c.end_date):'')+'</span><strong>'+(i===0?'Keep':'')+'</strong></div>'+(i>0?'<button class="btn btn-secondary" style="color:var(--red)" onclick="deleteCycleById(\''+c.id+'\')">Delete Duplicate</button>':'');}).join('')+'</div>';}).join('')+'</div>':'')+
    (cycleBars.length?'<div class="report-list"><h3>Cycle Length Trend</h3>'+cycleBars.slice(-18).map(function(x){var pct=Math.max(6,Math.round(x.days/maxCycleBar*100));return '<div class="report-row"><div style="flex:1"><div>'+fmtDate(x.start)+' · '+x.days+' days</div><div class="report-bar"><span style="width:'+pct+'%"></span></div></div><strong>'+((x.days>=18&&x.days<=45)?'used':'ignored')+'</strong></div>';}).join('')+'</div>':'')+
    (pregEstimate?'<div class="report-list"><h3>Pregnancy Source Estimate</h3>'+
      '<div class="report-row"><span>Positive test</span><strong>'+fmtDate(pregEstimate.testDate)+'</strong></div>'+
      '<div class="report-row"><span>Estimated ovulation</span><strong>'+fmtDate(pregEstimate.ovulation)+'</strong></div>'+
      '<div class="report-row"><span>Likely fertile window</span><strong>'+fmtDate(pregEstimate.likelyStart)+' - '+fmtDate(pregEstimate.likelyEnd)+'</strong></div>'+
      (pregEstimate.sex.length?pregEstimate.sex.map(function(x){return '<div class="note-card"><div class="note-date">'+fmtFullDate(x.date)+'</div><div class="note-meta">'+esc(x.sourceRank)+' · '+esc(protectionLabel(x.protection))+'</div><div class="log-detail">'+esc(x.detail)+'</div></div>';}).join(''):'<div class="empty-log" style="padding:12px">No sex events found in the broad candidate window</div>')+
      '<div style="font-size:11px;color:var(--muted);line-height:1.4">This ranks timing candidates only. It cannot prove which event caused a pregnancy.</div>'+
    '</div>':'')+
    (sexRows.length?'<div class="report-list"><h3>Sex and Intimacy Events</h3>'+
      '<div class="date-row"><label>From</label><input type="date" id="sex-filter-start" value="'+esc(sexFilterStart)+'"></div>'+
      '<div class="date-row"><label>To</label><input type="date" id="sex-filter-end" value="'+esc(sexFilterEnd)+'"></div>'+
      '<div class="type-toggle">'+
        '<button class="type-opt" onclick="setSexReportRange(30)">30 days</button>'+
        '<button class="type-opt" onclick="setSexReportRange(183)">6 months</button>'+
        '<button class="type-opt" onclick="setSexReportRange(365)">1 year</button>'+
        '<button class="type-opt" onclick="setSexReportRange(\'all\')">All</button>'+
      '</div>'+
      '<button class="btn btn-secondary" onclick="applySexReportFilter()">Apply Date Filter</button>'+
      '<div class="report-row"><span>Showing in selected range</span><strong>'+shownSexRows.length+' of '+sexRows.length+'</strong></div>'+
      '<div class="report-row"><span>Emergency contraception marked</span><strong>'+sexEc+'</strong></div>'+
      (shownSexRows.length?shownSexRows.slice(0,120).map(function(x){
        return '<div class="note-card" onclick="'+x.onclick+'"><div class="note-date">'+fmtFullDate(x.date)+'</div><div class="note-meta">'+esc(x.kind==='imported'?'Imported sex event':'Risk note')+' · '+esc(protectionLabel(x.protection))+(x.ec?' · emergency contraception':'')+'</div><div class="log-detail">'+esc(x.detail)+'</div><span class="risk-pill risk-'+x.risk.level+'">'+esc(x.risk.label)+'</span></div>';
      }).join(''):'<div class="empty-log" style="padding:12px">No sex or intimacy events in this range</div>')+
      (shownSexRows.length>120?'<div style="font-size:11px;color:var(--muted);padding-top:6px">Showing newest 120 records in this range.</div>':'')+
    '</div>':'')+
    (exclusions.length?'<div class="report-list"><h3>Excluded ranges</h3>'+exclusions.map(function(x){return '<div class="report-row"><span>'+fmtDate(x.start_date)+' - '+fmtDate(x.end_date)+'<br><small style="color:var(--muted)">'+esc(x.reason||'excluded')+(x.notes?' · '+esc(x.notes):'')+'</small></span><strong>'+daysBetween(x.start_date,x.end_date)+'d</strong></div>';}).join('')+'</div>':'')+
    '<div class="report-list"><h3>Cycle range</h3><div class="report-row"><span>Shortest - longest estimated cycle</span><strong>'+(range?range.min+'-'+range.max+'d':'-')+'</strong></div></div>'+
    '<div class="report-list"><h3>Symptoms</h3>'+
      (symptomRows.length?symptomRows.map(function(s){var pct=Math.round(symptomCounts[s]/maxSym*100);return '<div class="report-row"><div style="flex:1"><div>'+esc(s)+'</div><div class="report-bar"><span style="width:'+pct+'%"></span></div></div><strong>'+symptomCounts[s]+'</strong></div>';}).join(''):'<div class="empty-log" style="padding:12px">No symptoms logged yet</div>')+
    '</div>'+
    (eventRows.length?'<div class="report-list"><h3>Imported event categories</h3>'+eventRows.map(function(k){return '<div class="report-row"><span>'+esc(k)+'</span><strong>'+eventCatCounts[k]+'</strong></div>';}).join('')+'</div>':'')+
    (periodNotes.length?'<div class="report-list"><h3>Imported notes</h3>'+periodNotes.slice().sort(function(a,b){return b.note_date.localeCompare(a.note_date);}).slice(0,30).map(function(n){return '<div class="note-card"><div class="note-date">'+fmtFullDate(n.note_date)+'</div><div class="log-detail">'+esc(n.note_text)+'</div></div>';}).join('')+'</div>':'')+
    (measurementRows.length?'<div class="report-list"><h3>Measurements</h3>'+measurementRows.map(function(k){return '<div class="report-row"><span>'+esc(k)+'</span><strong>'+measurementTypeCounts[k]+'</strong></div>';}).join('')+'</div>':'')+
    (medAdherence.length?'<div class="report-list"><h3>Medication Adherence</h3>'+medAdherence.slice(0,18).map(function(m){return '<div class="report-row"><span>'+esc(m.month)+' · '+esc(m.name)+'<br><small style="color:var(--muted)">taken '+m.taken+' · missed/unknown '+m.missed+'</small></span><strong>'+m.total+'</strong></div>';}).join('')+'</div>':'')+
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
