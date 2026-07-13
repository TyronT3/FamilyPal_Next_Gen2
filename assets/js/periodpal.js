function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function todayKey(){return dateKey(new Date());}
function dateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parseDay(s){var p=(s||'').split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
function addDays(s,n){var d=typeof s==='string'?parseDay(s):new Date(s);d.setDate(d.getDate()+n);return dateKey(d);}
function daysBetween(a,b){return Math.round((parseDay(b)-parseDay(a))/86400000);}
function fmtDate(s){return parseDay(s).toLocaleDateString([],{month:'short',day:'numeric'});}
function fmtFullDate(s){return parseDay(s).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

var cycles=[],intimacy=[],viewMonth=new Date(),activeTab='calendar';
var model={avgCycle:28,avgPeriod:5,lastStart:null,nextStart:null,periodEnd:null,ovulation:null,fertileStart:null,fertileEnd:null,confidence:'low'};

function switchTab(tab,btn){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  ['calendar','log','history'].forEach(function(t){document.getElementById('tab-'+t).style.display=t===tab?'block':'none';});
  if(tab==='history')renderHistory();
}

async function loadData(){
  try{
    var start=new Date();start.setMonth(start.getMonth()-14);
    var end=new Date();end.setMonth(end.getMonth()+4);
    var results=await Promise.all([
      sbFetch('/rest/v1/period_cycles?start_date=gte.'+dateKey(start)+'&order=start_date.desc&select=*'),
      sbFetch('/rest/v1/period_intimacy?logged_date=gte.'+dateKey(start)+'&logged_date=lte.'+dateKey(end)+'&order=logged_date.desc&select=*')
    ]);
    cycles=results[0]||[];
    intimacy=results[1]||[];
    buildModel();
    renderForecast();
    renderCalendar();
    if(activeTab==='history')renderHistory();
  }catch(e){
    document.getElementById('forecast-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+esc(e.message)+'</div>';
  }
}

function buildModel(){
  var sorted=cycles.slice().sort(function(a,b){return a.start_date.localeCompare(b.start_date);});
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
  if(!cycles.length){
    el.innerHTML='<div class="forecast-grid">'+
      '<div class="forecast-card fc-rose"><div class="fc-lbl">Next period</div><div class="fc-val">Log first</div><div class="fc-sub">Add the latest start date to begin predictions.</div></div>'+
      '<div class="forecast-card fc-blue"><div class="fc-lbl">Fertile window</div><div class="fc-val">Unknown</div><div class="fc-sub">Needs cycle history.</div></div>'+
      '</div><div class="trust-note">PeriodPal estimates from logged dates only. It is not contraception or medical advice.</div>';
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
    html+='<div class="'+cls.join(' ')+'" onclick="openDay(\''+key+'\')"><div class="day-num">'+d.getDate()+'</div><div class="day-tags">'+dots.slice(0,4).map(function(c){return'<i class="tag-dot '+c+'"></i>';}).join('')+'</div></div>';
  }
  document.getElementById('calendar-grid').innerHTML=html;
}

function moveMonth(delta){viewMonth.setMonth(viewMonth.getMonth()+delta);renderCalendar();}
function isBetween(key,start,end){return start&&end&&key>=start&&key<=end;}
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
  var tags=[];
  if(dayCycles.length)tags.push('<div class="log-item"><div class="log-icon">🩸</div><div class="log-info"><div class="log-title">Logged period</div><div class="log-detail">'+esc(dayCycles[0].flow||'medium')+(dayCycles[0].symptoms&&dayCycles[0].symptoms.length?' · '+esc(dayCycles[0].symptoms.join(', ')):'')+'</div></div></div>');
  if(isPredictedPeriod(key))tags.push('<div class="log-item"><div class="log-icon">🌙</div><div class="log-info"><div class="log-title">Predicted period</div><div class="log-detail">Based on '+model.avgCycle+' day average cycle.</div></div></div>');
  if(isBetween(key,model.fertileStart,model.fertileEnd))tags.push('<div class="log-item"><div class="log-icon">🌱</div><div class="log-info"><div class="log-title">Estimated fertile window</div><div class="log-detail">Ovulation estimate: '+fmtDate(model.ovulation)+'.</div></div></div>');
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

function renderHistory(){
  var rows=[];
  cycles.forEach(function(c){rows.push({type:'cycle',date:c.start_date,row:c});});
  intimacy.forEach(function(x){rows.push({type:'intimacy',date:x.logged_date,row:x});});
  rows.sort(function(a,b){return b.date.localeCompare(a.date);});
  document.getElementById('history-content').innerHTML='<div class="history-section"><h3>Recent logs</h3>'+
    (rows.length?rows.slice(0,80).map(function(item){
      if(item.type==='cycle'){
        var c=item.row,len=c.end_date?daysBetween(c.start_date,c.end_date)+1:null;
        return '<div class="log-item" onclick="openCycleModal(\''+c.id+'\')"><div class="log-icon">🩸</div><div class="log-info"><div class="log-title">Period started '+fmtDate(c.start_date)+'</div><div class="log-detail">'+esc(c.flow||'medium')+(len?' · '+len+' day'+(len!==1?'s':''):' · still active')+(c.symptoms&&c.symptoms.length?' · '+esc(c.symptoms.join(', ')):'')+(c.notes?' · '+esc(c.notes):'')+'</div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
      }
      var x=item.row,r=riskForDate(x.logged_date,x.protection,x.emergency_contraception);
      return '<div class="log-item" onclick="openIntimacyModal(\''+x.id+'\')"><div class="log-icon">🛡️</div><div class="log-info"><div class="log-title">Risk note '+fmtDate(x.logged_date)+'</div><div class="log-detail">'+esc(protectionLabel(x.protection))+(x.emergency_contraception?' · emergency contraception':'')+(x.notes?' · '+esc(x.notes):'')+'<br><span class="risk-pill risk-'+r.level+'">'+esc(r.label)+'</span></div></div><div class="log-actions"><button class="undo-btn">Edit</button></div></div>';
    }).join(''):'<div class="empty-log">No period logs yet</div>')+'</div>';
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
