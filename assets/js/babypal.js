function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function nowLocal(){var n=new Date();n.setMinutes(n.getMinutes()-n.getTimezoneOffset());return n.toISOString().slice(0,16);}
function toLocalInput(ts){if(!ts)return'';var d=new Date(ts);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
function fmtTime(ts){return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function fmtDateTime(ts){return new Date(ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function todayRange(){var s=new Date();s.setHours(0,0,0,0);var e=new Date();e.setHours(23,59,59,999);return{start:s.toISOString(),end:e.toISOString()};}
function inputTimeMinutesAgo(mins){var n=new Date();n.setMinutes(n.getMinutes()-mins-n.getTimezoneOffset());return n.toISOString().slice(0,16);}
function setLogTime(id,mins){var el=document.getElementById(id);if(el)el.value=inputTimeMinutesAgo(mins||0);}
function getSleepWarn(){return parseInt(localStorage.getItem('bp_sleep_warn')||'6');}
function saveSleepWarn(){var v=parseInt(document.getElementById('sleep-warn-input').value)||6;localStorage.setItem('bp_sleep_warn',v);toast('Sleep warning set to '+v+' hours');}
async function saveDiaperItem(){
  try{
    await FamilyPal.setDiaperItemId(document.getElementById('diaper-item-select').value);
    toast('Diaper pantry item saved for both phones');
  }catch(e){toast('Could not save diaper item: '+e.message);}
}
async function loadDiaperItemOptions(){
  var sel=document.getElementById('diaper-item-select');
  if(!sel)return;
  try{
    var current=await FamilyPal.getDiaperItemId();
    var items=await sbFetch('/rest/v1/items?order=name.asc&select=id,name,brand,qty_stocked');
    sel.innerHTML='<option value="">No pantry item selected</option>'+items.map(function(i){
      return '<option value="'+esc(i.id)+'" '+(i.id===current?'selected':'')+'>'+esc(i.name)+(i.brand?' - '+esc(i.brand):'')+' ('+(i.qty_stocked||0)+' left)</option>';
    }).join('');
  }catch(e){toast('Could not load pantry items: '+e.message);}
}
async function consumeDiaperStock(source){
  try{
    var result=await FamilyPal.decrementDiaperStock(source);
    if(result.skipped)return '';
    if(result.previousQty<1)return ' Diaper stock already 0.';
    return ' '+result.name+' now '+result.qty_stocked+'.';
  }catch(e){return ' Diaper logged, but pantry stock was not updated.';}
}
async function diaperStockInsight(){
  try{
    var itemId=await FamilyPal.getDiaperItemId();
    if(!itemId)return '';
    var rows=await sbFetch('/rest/v1/items?id=eq.'+itemId+'&select=name,qty_stocked,min_stock');
    var item=rows&&rows[0];
    if(!item)return '';
    var qty=item.qty_stocked||0,min=item.min_stock||0;
    if(min>0&&qty<=min)return '<div class="insight-card warning-card"><div class="insight-title">Diaper stock</div><div class="insight-row"><span>'+esc(item.name)+'</span><strong>'+qty+' left</strong></div><div class="log-detail">At or below PantryPal minimum stock of '+min+'.</div></div>';
    return '<div class="insight-card"><div class="insight-title">Diaper stock</div><div class="insight-row"><span>'+esc(item.name)+'</span><strong>'+qty+' left</strong></div></div>';
  }catch(e){return '';}
}

// ── Sleep state ───────────────────────────────────────────
var sleepStart=null,sleepTimerInterval=null;

function loadSleepState(){
  var s=localStorage.getItem('bp_sleep_start');
  if(s){sleepStart=new Date(s);startSleepTimer();}
  updateSleepUI();
}
function saveSleepState(){
  if(sleepStart)localStorage.setItem('bp_sleep_start',sleepStart.toISOString());
  else localStorage.removeItem('bp_sleep_start');
}
function startSleepTimer(){
  if(sleepTimerInterval)clearInterval(sleepTimerInterval);
  sleepTimerInterval=setInterval(function(){
    if(!sleepStart)return;
    var diff=Math.floor((Date.now()-sleepStart)/1000);
    var h=Math.floor(diff/3600),m=Math.floor((diff%3600)/60),s=diff%60;
    var el=document.getElementById('sleep-timer');
    if(el)el.textContent=(h>0?h+':':'')+(String(m).padStart(h>0?2:1,'0'))+':'+String(s).padStart(2,'0');
  },1000);
}
function updateSleepUI(){
  var banner=document.getElementById('sleep-banner');
  var icon=document.getElementById('sleep-btn-icon'),label=document.getElementById('sleep-btn-label'),sub=document.getElementById('sleep-btn-sub');
  var lpIcon=document.getElementById('lp-sleep-icon'),lpLabel=document.getElementById('lp-sleep-label');
  if(sleepStart){
    if(banner)banner.style.display='flex';
    var btn=document.getElementById('sleep-btn');if(btn)btn.className='ql-btn sleep-active';
    if(icon)icon.textContent='☀️';if(label)label.textContent='She woke up!';if(sub)sub.textContent='Stop sleep timer';
    if(lpIcon)lpIcon.textContent='☀️';if(lpLabel)lpLabel.textContent='She woke up!';
  }else{
    if(banner)banner.style.display='none';
    var btn2=document.getElementById('sleep-btn');if(btn2)btn2.className='ql-btn green';
    if(icon)icon.textContent='😴';if(label)label.textContent='She fell asleep';if(sub)sub.textContent='Start sleep timer';
    if(lpIcon)lpIcon.textContent='😴';if(lpLabel)lpLabel.textContent='She fell asleep';
  }
}

function handleSleepBtn(){
  if(sleepStart){wakeUp();}
  else{
    sleepStart=new Date();saveSleepState();startSleepTimer();updateSleepUI();
    toast('😴 Sleep timer started!');
    if(activeTab==='today')loadToday();
  }
}

function wakeUp(){
  if(!sleepStart){openSleepListModal();return;}
  // open sleep edit modal pre-filled with active session
  document.getElementById('sleep-edit-title').textContent='☀️ She woke up!';
  document.getElementById('sleep-edit-id').value='';
  document.getElementById('sleep-edit-start').value=toLocalInput(sleepStart);
  document.getElementById('sleep-edit-end').value=nowLocal();
  document.getElementById('sleep-edit-notes').value='';
  document.getElementById('sleep-delete-btn').style.display='none';
  var diffMins=Math.round((new Date()-sleepStart)/60000);
  if(diffMins>getSleepWarn()*60){
    var h=Math.floor(diffMins/60),m=diffMins%60;
    toast('⚠️ '+h+'h '+m+'m — check the times look right!');
  }
  document.getElementById('sleep-edit-modal').style.display='flex';
}

async function saveSleepEdit(){
  var id=document.getElementById('sleep-edit-id').value;
  var start=document.getElementById('sleep-edit-start').value;
  var end=document.getElementById('sleep-edit-end').value;
  var notes=document.getElementById('sleep-edit-notes').value.trim();
  if(!start){toast('Enter a start time');return;}
  var diffMins=end?Math.round((new Date(end)-new Date(start))/60000):null;
  if(diffMins!==null&&diffMins<0){toast('Wake time must be after sleep time');return;}
  var payload={sleep_start:new Date(start).toISOString(),sleep_end:end?new Date(end).toISOString():null,duration_mins:diffMins,notes:notes||null,logged_at:new Date(start).toISOString()};
  try{
    if(id){
      await sbFetch('/rest/v1/baby_sleep?id=eq.'+id,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
      toast('😴 Session updated');
    }else{
      await sbFetch('/rest/v1/baby_sleep',{method:'POST',body:JSON.stringify(payload)});
      // clear active timer
      if(sleepStart){clearInterval(sleepTimerInterval);sleepTimerInterval=null;sleepStart=null;saveSleepState();updateSleepUI();}
      toast(diffMins!==null?'😴 '+Math.floor(diffMins/60)+'h '+(diffMins%60)+'m logged':'😴 Session saved');
    }
    closeModal('sleep-edit-modal');closeModal('sleep-list-modal');
    if(activeTab==='today')loadToday();
    if(activeTab==='history')loadHistory();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteSleepSession(){
  var id=document.getElementById('sleep-edit-id').value;
  if(!id||!confirm('Delete this sleep session?'))return;
  try{
    await sbFetch('/rest/v1/baby_sleep?id=eq.'+id,{method:'DELETE'});
    toast('Sleep session deleted');
    closeModal('sleep-edit-modal');
    openSleepListModal();
    if(activeTab==='today')loadToday();
  }catch(e){toast('Error: '+e.message);}
}

async function openSleepListModal(){
  document.getElementById('sleep-list-modal').style.display='flex';
  var el=document.getElementById('sleep-sessions-list');
  el.innerHTML='<div class="loading"><span class="spinner"></span></div>';
  try{
    var since=new Date();since.setDate(since.getDate()-3);
    var sessions=await sbFetch('/rest/v1/baby_sleep?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&select=*');
    if(!sessions.length){el.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">No sleep sessions in the last 3 days</div>';return;}
    el.innerHTML=sessions.map(function(s){
      var startStr=s.sleep_start?fmtDateTime(s.sleep_start):'—';
      var endStr=s.sleep_end?fmtTime(s.sleep_end):'Still sleeping 😴';
      var dur=s.duration_mins?(Math.floor(s.duration_mins/60)+'h '+(s.duration_mins%60)+'m'):'—';
      return '<div class="sleep-session-item" onclick="openEditSleepSession(\''+s.id+'\')">'+
        '<div style="font-size:22px">😴</div>'+
        '<div style="flex:1">'+
          '<div style="font-size:14px;font-weight:600">'+startStr+' → '+endStr+'</div>'+
          '<div style="font-size:12px;color:var(--muted)">'+dur+(s.notes?' · '+esc(s.notes):'')+'</div>'+
        '</div>'+
        '<div style="font-size:18px;color:var(--muted)">✏️</div>'+
      '</div>';
    }).join('');
  }catch(e){el.innerHTML='<div style="color:var(--red)">Error: '+e.message+'</div>';}
}

async function openEditSleepSession(id){
  try{
    var sessions=await sbFetch('/rest/v1/baby_sleep?id=eq.'+id+'&select=*');
    var s=sessions[0];if(!s)return;
    document.getElementById('sleep-edit-title').textContent='✏️ Edit Sleep Session';
    document.getElementById('sleep-edit-id').value=id;
    document.getElementById('sleep-edit-start').value=toLocalInput(s.sleep_start);
    document.getElementById('sleep-edit-end').value=s.sleep_end?toLocalInput(s.sleep_end):'';
    document.getElementById('sleep-edit-notes').value=s.notes||'';
    document.getElementById('sleep-delete-btn').style.display='block';
    document.getElementById('sleep-edit-modal').style.display='flex';
  }catch(e){toast('Error: '+e.message);}
}

function openAddSleepModal(){
  document.getElementById('sleep-edit-title').textContent='➕ Add Sleep Session';
  document.getElementById('sleep-edit-id').value='';
  document.getElementById('sleep-edit-start').value=nowLocal();
  document.getElementById('sleep-edit-end').value='';
  document.getElementById('sleep-edit-notes').value='';
  document.getElementById('sleep-delete-btn').style.display='none';
  document.getElementById('sleep-edit-modal').style.display='flex';
}

// ── Tabs ──────────────────────────────────────────────────
var activeTab='today';
function switchTab(tab,btn){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  ['today','log','history','trends','health'].forEach(function(t){document.getElementById('tab-'+t).style.display=t===tab?'block':'none';});
  if(tab==='today')loadToday();
  if(tab==='history')loadHistory();
  if(tab==='trends')loadTrends();
  if(tab==='health')loadHealth();
}

// ── Today ─────────────────────────────────────────────────
async function loadToday(){
  var r=todayRange();
  try{
    var results=await Promise.all([
      sbFetch('/rest/v1/baby_feeds?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&order=logged_at.desc&select=*'),
      sbFetch('/rest/v1/baby_diapers?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&order=logged_at.desc&select=*'),
      sbFetch('/rest/v1/baby_sleep?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&select=*'),
      sbFetch('/rest/v1/baby_pumping?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&select=*')
    ]);
    var feeds=results[0],diapers=results[1],sleeps=results[2],pumps=results[3];
    var totalMl=feeds.filter(function(f){return f.feed_type==='bottle';}).reduce(function(s,f){return s+(f.amount_ml||0);},0);
    var breastFeeds=feeds.filter(function(f){return f.feed_type==='breast';});
    var lastFeed=feeds[0];
    var wet=diapers.filter(function(d){return d.diaper_type==='wet';}).length;
    var soiled=diapers.filter(function(d){return d.diaper_type==='soiled';}).length;
    var totalSleep=sleeps.reduce(function(s,sl){if(sl.sleep_start&&sl.sleep_end)return s+Math.round((new Date(sl.sleep_end)-new Date(sl.sleep_start))/60000);return s;},0);
    var totalPumped=pumps.reduce(function(s,p){return s+(p.amount_ml||0);},0);
    var sleepStr=totalSleep>=60?(Math.floor(totalSleep/60)+'h '+(totalSleep%60)+'m'):totalSleep+'m';
    var recent=[].concat(
      feeds.map(function(f){return{icon:f.feed_type==='bottle'?'🍼':'🤱',title:f.feed_type==='bottle'?'Bottle — '+f.amount_ml+'ml':'Breast — '+f.duration_mins+'min ('+f.breast_side+')',detail:f.notes,ts:f.logged_at};}),
      diapers.map(function(d){return{icon:d.diaper_type==='wet'?'💧':'💩',title:d.diaper_type==='wet'?'Wet diaper':'Soiled diaper',detail:d.notes,ts:d.logged_at};}),
      sleeps.map(function(s){var dur=s.sleep_end?Math.round((new Date(s.sleep_end)-new Date(s.sleep_start))/60000):null;return{icon:'😴',title:dur?'Sleep — '+Math.floor(dur/60)+'h '+(dur%60)+'m':'Sleep started',detail:s.notes,ts:s.logged_at};}),
      pumps.map(function(p){return{icon:'🥛',title:'Pumped — '+p.amount_ml+'ml',detail:p.notes,ts:p.logged_at};})
    ).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);}).slice(0,5);
    document.getElementById('summary-content').innerHTML=
      '<div style="padding:12px 16px 4px;font-size:13px;color:var(--muted)">'+new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})+'</div>'+
      '<div class="summary-grid">'+
      '<div class="summary-card pink"><div class="s-icon">🍼</div><div class="s-val">'+totalMl+'ml</div><div class="s-lbl">Bottle milk</div><div class="s-sub">'+feeds.filter(function(f){return f.feed_type==='bottle';}).length+' bottles · '+breastFeeds.length+' breast</div></div>'+
      '<div class="summary-card blue"><div class="s-icon">🚿</div><div class="s-val">'+(wet+soiled)+'</div><div class="s-lbl">Diapers</div><div class="s-sub">💧 '+wet+' wet · 💩 '+soiled+' soiled</div></div>'+
      '<div class="summary-card green"><div class="s-icon">😴</div><div class="s-val">'+sleepStr+'</div><div class="s-lbl">Sleep</div><div class="s-sub">'+sleeps.length+' session'+(sleeps.length!==1?'s':'')+'</div></div>'+
      '<div class="summary-card teal"><div class="s-icon">🥛</div><div class="s-val">'+totalPumped+'ml</div><div class="s-lbl">Pumped</div><div class="s-sub">'+pumps.length+' session'+(pumps.length!==1?'s':'')+'</div></div>'+
      '<div class="summary-card purple"><div class="s-icon">⏰</div><div class="s-val">'+(lastFeed?fmtTime(lastFeed.logged_at):'—')+'</div><div class="s-lbl">Last feed</div><div class="s-sub">'+(lastFeed?(lastFeed.feed_type==='bottle'?(lastFeed.amount_ml+'ml bottle'):(lastFeed.duration_mins+'min breast')):'No feeds yet')+'</div></div>'+
      '</div>'+
      '<div style="padding:4px 16px 16px"><div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;margin-top:8px">Recent activity</div>'+
      (recent.length?recent.map(function(e){return '<div class="log-item"><div class="log-icon">'+e.icon+'</div><div class="log-info"><div class="log-title">'+esc(e.title)+'</div>'+(e.detail?'<div class="log-detail">'+esc(e.detail)+'</div>':'')+'</div><div class="log-time">'+fmtTime(e.ts)+'</div></div>';}).join(''):'<div class="empty-log">No activity yet today</div>')+
      '</div>';
  }catch(e){document.getElementById('summary-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+e.message+'</div>';}
}

// ── History ───────────────────────────────────────────────
async function loadHistory(){
  try{
    var since=new Date();since.setDate(since.getDate()-7);
    var results=await Promise.all([
      sbFetch('/rest/v1/baby_feeds?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=30&select=*'),
      sbFetch('/rest/v1/baby_diapers?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=30&select=*'),
      sbFetch('/rest/v1/baby_sleep?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=20&select=*'),
      sbFetch('/rest/v1/baby_pumping?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=20&select=*')
    ]);
    var all=[].concat(
      results[0].map(function(f){return{icon:f.feed_type==='bottle'?'🍼':'🤱',title:f.feed_type==='bottle'?'Bottle — '+f.amount_ml+'ml':'Breast — '+f.duration_mins+'min ('+f.breast_side+')',detail:f.notes,ts:f.logged_at};}),
      results[1].map(function(d){return{icon:d.diaper_type==='wet'?'💧':'💩',title:d.diaper_type==='wet'?'Wet diaper':'Soiled diaper',detail:'',ts:d.logged_at};}),
      results[2].map(function(s){var dur=s.sleep_end?Math.round((new Date(s.sleep_end)-new Date(s.sleep_start))/60000):null;return{icon:'😴',title:dur?'Sleep — '+Math.floor(dur/60)+'h '+(dur%60)+'m':'Sleep started',detail:s.notes,ts:s.logged_at};}),
      results[3].map(function(p){return{icon:'🥛',title:'Pumped — '+p.amount_ml+'ml',detail:p.notes,ts:p.logged_at};})
    ).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
    document.getElementById('history-content').innerHTML=all.length?
      '<div class="history-section"><h3>Last 7 days</h3>'+all.map(function(e){return'<div class="log-item"><div class="log-icon">'+e.icon+'</div><div class="log-info"><div class="log-title">'+esc(e.title)+'</div>'+(e.detail?'<div class="log-detail">'+esc(e.detail)+'</div>':'')+'</div><div class="log-time">'+fmtDateTime(e.ts)+'</div></div>';}).join('')+'</div>':
      '<div class="empty-log">No activity in the last 7 days</div>';
  }catch(e){document.getElementById('history-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+e.message+'</div>';}
}

// ── Trends ────────────────────────────────────────────────
async function loadTrends(){
  try{
    var since=new Date();since.setDate(since.getDate()-6);since.setHours(0,0,0,0);
    var results=await Promise.all([sbFetch('/rest/v1/baby_feeds?logged_at=gte.'+since.toISOString()+'&select=*'),sbFetch('/rest/v1/baby_diapers?logged_at=gte.'+since.toISOString()+'&select=*'),sbFetch('/rest/v1/baby_sleep?logged_at=gte.'+since.toISOString()+'&select=*')]);
    var days=[];for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push(d);}
    function dk(d){return d.toISOString().slice(0,10);}
    function dl(d){return d.toLocaleDateString([],{weekday:'short'});}
    var mlPerDay=days.map(function(d){return{lbl:dl(d),val:results[0].filter(function(f){return f.feed_type==='bottle'&&f.logged_at.startsWith(dk(d));}).reduce(function(s,f){return s+(f.amount_ml||0);},0)};});
    var diapersPerDay=days.map(function(d){return{lbl:dl(d),val:results[1].filter(function(dia){return dia.logged_at.startsWith(dk(d));}).length};});
    var sleepPerDay=days.map(function(d){return{lbl:dl(d),val:Math.round(results[2].filter(function(s){return s.sleep_start&&s.sleep_end&&s.logged_at.startsWith(dk(d));}).reduce(function(s,sl){return s+(new Date(sl.sleep_end)-new Date(sl.sleep_start))/60000;},0))};});
    function bar(data,color,unit){var max=Math.max.apply(null,data.map(function(d){return d.val;}).concat([1]));return'<div class="bar-chart">'+data.map(function(d){return'<div class="bar-col"><div class="bar-val">'+(d.val>0?d.val+unit:'')+'</div><div class="bar" style="height:'+Math.max(4,d.val/max*70)+'px;background:'+color+'"></div><div class="bar-lbl">'+d.lbl+'</div></div>';}).join('')+'</div>';}
    document.getElementById('trends-content').innerHTML='<div class="chart-wrap"><div class="chart-card"><h3>🍼 Bottle milk (ml)</h3>'+bar(mlPerDay,'var(--pink)','')+'</div><div class="chart-card"><h3>🚿 Diapers</h3>'+bar(diapersPerDay,'var(--blue)','')+'</div><div class="chart-card"><h3>😴 Sleep (mins)</h3>'+bar(sleepPerDay,'var(--green)','m')+'</div></div>';
  }catch(e){document.getElementById('trends-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+e.message+'</div>';}
}

// ── Log functions ─────────────────────────────────────────
async function logBottleFeed(){var ml=parseInt(document.getElementById('feed-ml').value);if(!ml||ml<1){toast('Enter amount in ml');return;}var time=document.getElementById('feed-time').value||nowLocal();var notes=document.getElementById('feed-notes').value.trim();try{await sbFetch('/rest/v1/baby_feeds',{method:'POST',body:JSON.stringify({feed_type:'bottle',amount_ml:ml,logged_at:new Date(time).toISOString(),notes:notes||null})});closeModal('feed-modal');toast('🍼 '+ml+'ml logged!');if(activeTab==='today')loadToday();}catch(e){toast('Error: '+e.message);}}
async function logBreastFeed(){var mins=parseInt(document.getElementById('breast-mins').value);if(!mins||mins<1){toast('Enter duration');return;}var side=document.getElementById('breast-side').value;var time=document.getElementById('breast-time').value||nowLocal();var notes=document.getElementById('breast-notes').value.trim();try{await sbFetch('/rest/v1/baby_feeds',{method:'POST',body:JSON.stringify({feed_type:'breast',duration_mins:mins,breast_side:side,logged_at:new Date(time).toISOString(),notes:notes||null})});closeModal('breast-modal');toast('🤱 '+mins+'min logged!');if(activeTab==='today')loadToday();}catch(e){toast('Error: '+e.message);}}
async function logDiaper(type){try{await sbFetch('/rest/v1/baby_diapers',{method:'POST',body:JSON.stringify({diaper_type:type,logged_at:new Date().toISOString()})});var stockMsg=await consumeDiaperStock('BabyPal');toast((type==='wet'?'💧 Wet diaper logged!':'💩 Soiled diaper logged!')+stockMsg);if(activeTab==='today')loadToday();}catch(e){toast('Error: '+e.message);}}
async function logPump(){var ml=parseInt(document.getElementById('pump-ml').value);if(!ml||ml<1){toast('Enter amount');return;}var mins=parseInt(document.getElementById('pump-mins').value)||null;var time=document.getElementById('pump-time').value||nowLocal();var notes=document.getElementById('pump-notes').value.trim();try{await sbFetch('/rest/v1/baby_pumping',{method:'POST',body:JSON.stringify({amount_ml:ml,duration_mins:mins,logged_at:new Date(time).toISOString(),notes:notes||null})});closeModal('pump-modal');toast('🥛 '+ml+'ml logged!');if(activeTab==='today')loadToday();}catch(e){toast('Error: '+e.message);}}
function healthTitle(h){
  var value=h.value_numeric!==null&&h.value_numeric!==undefined?h.value_numeric:'';
  var unit=h.unit||'';
  var label=h.label||({temperature:'Temperature',weight:'Weight',medicine:'Medicine',note:'Health note'}[h.health_type]||'Health');
  return label+(value!==''?' - '+value+unit:'');
}

function openDiaperModal(type){
  document.getElementById('diaper-type').value=type;
  document.getElementById('diaper-log-title').textContent=type==='wet'?'Wet Diaper':'Soiled Diaper';
  setLogTime('diaper-time',0);
  document.getElementById('diaper-notes').value='';
  document.getElementById('diaper-log-modal').style.display='flex';
}

async function saveDiaperLog(){
  var type=document.getElementById('diaper-type').value;
  var time=document.getElementById('diaper-time').value||nowLocal();
  var notes=document.getElementById('diaper-notes').value.trim();
  try{
    await sbFetch('/rest/v1/baby_diapers',{method:'POST',body:JSON.stringify({diaper_type:type,logged_at:new Date(time).toISOString(),notes:notes||null})});
    closeModal('diaper-log-modal');
    var stockMsg=await consumeDiaperStock('BabyPal');
    toast((type==='wet'?'Wet diaper logged':'Soiled diaper logged')+stockMsg);
    if(activeTab==='today')loadToday();
    if(activeTab==='history')loadHistory();
  }catch(e){toast('Error: '+e.message);}
}

async function loadToday(){
  var r=todayRange();
  try{
    var results=await Promise.all([
      sbFetch('/rest/v1/baby_feeds?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&order=logged_at.desc&select=*'),
      sbFetch('/rest/v1/baby_diapers?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&order=logged_at.desc&select=*'),
      sbFetch('/rest/v1/baby_sleep?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&select=*'),
      sbFetch('/rest/v1/baby_pumping?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&select=*'),
      sbFetch('/rest/v1/baby_health?logged_at=gte.'+r.start+'&logged_at=lte.'+r.end+'&order=logged_at.desc&select=*')
    ]);
    var feeds=results[0],diapers=results[1],sleeps=results[2],pumps=results[3],health=results[4];
    var totalMl=feeds.filter(function(f){return f.feed_type==='bottle';}).reduce(function(s,f){return s+(f.amount_ml||0);},0);
    var breastFeeds=feeds.filter(function(f){return f.feed_type==='breast';});
    var lastFeed=feeds[0],lastDiaper=diapers[0],lastSleep=sleeps.slice().sort(function(a,b){return new Date(b.logged_at)-new Date(a.logged_at);})[0];
    var wet=diapers.filter(function(d){return d.diaper_type==='wet';}).length;
    var soiled=diapers.filter(function(d){return d.diaper_type==='soiled';}).length;
    var totalSleep=sleeps.reduce(function(s,sl){return sl.sleep_start&&sl.sleep_end?s+Math.round((new Date(sl.sleep_end)-new Date(sl.sleep_start))/60000):s;},0);
    var totalPumped=pumps.reduce(function(s,p){return s+(p.amount_ml||0);},0);
    var sleepStr=totalSleep>=60?Math.floor(totalSleep/60)+'h '+(totalSleep%60)+'m':totalSleep+'m';
    var recent=[].concat(
      feeds.map(function(f){return{icon:f.feed_type==='bottle'?'🍼':'🤱',title:f.feed_type==='bottle'?'Bottle - '+f.amount_ml+'ml':'Breast - '+f.duration_mins+'min ('+f.breast_side+')',detail:f.notes,ts:f.logged_at};}),
      diapers.map(function(d){return{icon:d.diaper_type==='wet'?'💧':'💩',title:d.diaper_type==='wet'?'Wet diaper':'Soiled diaper',detail:d.notes,ts:d.logged_at};}),
      sleeps.map(function(s){var dur=s.sleep_end?Math.round((new Date(s.sleep_end)-new Date(s.sleep_start))/60000):null;return{icon:'😴',title:dur?'Sleep - '+Math.floor(dur/60)+'h '+(dur%60)+'m':'Sleep started',detail:s.notes,ts:s.logged_at};}),
      pumps.map(function(p){return{icon:'🥛',title:'Pumped - '+p.amount_ml+'ml',detail:p.notes,ts:p.logged_at};}),
      health.map(function(h){return{icon:h.health_type==='temperature'?'🌡️':h.health_type==='weight'?'⚖️':h.health_type==='medicine'?'💊':'🩺',title:healthTitle(h),detail:h.notes,ts:h.logged_at};})
    ).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);}).slice(0,6);
    var stockHtml=await diaperStockInsight();
    document.getElementById('summary-content').innerHTML=
      '<div style="padding:12px 16px 4px;font-size:13px;color:var(--muted)">'+new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})+'</div>'+
      stockHtml+
      '<div class="summary-grid">'+
      '<div class="summary-card pink"><div class="s-icon">🍼</div><div class="s-val">'+totalMl+'ml</div><div class="s-lbl">Bottle milk</div><div class="s-sub">'+feeds.filter(function(f){return f.feed_type==='bottle';}).length+' bottles - '+breastFeeds.length+' breast</div></div>'+
      '<div class="summary-card blue"><div class="s-icon">🚿</div><div class="s-val">'+(wet+soiled)+'</div><div class="s-lbl">Diapers</div><div class="s-sub">'+wet+' wet - '+soiled+' soiled</div></div>'+
      '<div class="summary-card green"><div class="s-icon">😴</div><div class="s-val">'+sleepStr+'</div><div class="s-lbl">Sleep</div><div class="s-sub">'+sleeps.length+' session'+(sleeps.length!==1?'s':'')+'</div></div>'+
      '<div class="summary-card teal"><div class="s-icon">🥛</div><div class="s-val">'+totalPumped+'ml</div><div class="s-lbl">Pumped</div><div class="s-sub">'+pumps.length+' session'+(pumps.length!==1?'s':'')+'</div></div>'+
      '<div class="summary-card purple"><div class="s-icon">⏰</div><div class="s-val">'+(lastFeed?fmtTime(lastFeed.logged_at):'-')+'</div><div class="s-lbl">Last feed</div><div class="s-sub">'+(lastFeed?(lastFeed.feed_type==='bottle'?lastFeed.amount_ml+'ml bottle':lastFeed.duration_mins+'min breast'):'No feeds yet')+'</div></div>'+
      '<div class="summary-card yellow"><div class="s-icon">💧</div><div class="s-val">'+(lastDiaper?fmtTime(lastDiaper.logged_at):'-')+'</div><div class="s-lbl">Last diaper</div><div class="s-sub">'+(lastDiaper?(lastDiaper.diaper_type==='wet'?'Wet':'Soiled'):'No diapers yet')+'</div></div>'+
      '<div class="summary-card green"><div class="s-icon">💤</div><div class="s-val">'+(lastSleep?fmtTime(lastSleep.logged_at):'-')+'</div><div class="s-lbl">Last sleep</div><div class="s-sub">'+(lastSleep&&lastSleep.duration_mins?Math.floor(lastSleep.duration_mins/60)+'h '+(lastSleep.duration_mins%60)+'m':'No completed sleep')+'</div></div>'+
      '</div>'+
      '<div style="padding:4px 16px 16px"><div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;margin-top:8px">Recent activity</div>'+
      (recent.length?recent.map(function(e){return '<div class="log-item"><div class="log-icon">'+e.icon+'</div><div class="log-info"><div class="log-title">'+esc(e.title)+'</div>'+(e.detail?'<div class="log-detail">'+esc(e.detail)+'</div>':'')+'</div><div class="log-time">'+fmtTime(e.ts)+'</div></div>';}).join(''):'<div class="empty-log">No activity yet today</div>')+
      '</div>';
  }catch(e){document.getElementById('summary-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+e.message+'</div>';}
}

function openHealthModal(type){
  document.getElementById('health-type').value=type||'temperature';
  document.getElementById('health-label').value='';
  document.getElementById('health-value').value='';
  document.getElementById('health-unit').value='';
  document.getElementById('health-notes').value='';
  setLogTime('health-time',0);
  syncHealthFields();
  document.getElementById('health-modal').style.display='flex';
}

function syncHealthFields(){
  var t=document.getElementById('health-type').value;
  var unit=document.getElementById('health-unit');
  if(t==='temperature')unit.value=unit.value||'C';
  if(t==='weight')unit.value=unit.value||'kg';
  if(t==='medicine')unit.value=unit.value||'ml';
  if(t==='note')unit.value='';
}

async function saveHealthLog(){
  var type=document.getElementById('health-type').value;
  var label=document.getElementById('health-label').value.trim();
  var val=document.getElementById('health-value').value;
  var unit=document.getElementById('health-unit').value.trim();
  var time=document.getElementById('health-time').value||nowLocal();
  var notes=document.getElementById('health-notes').value.trim();
  if(type!=='note'&&!label&&val===''){toast('Add a label or value');return;}
  try{
    await sbFetch('/rest/v1/baby_health',{method:'POST',body:JSON.stringify({health_type:type,label:label||null,value_numeric:val===''?null:parseFloat(val),unit:unit||null,notes:notes||null,logged_at:new Date(time).toISOString()})});
    closeModal('health-modal');
    toast('Health log saved');
    if(activeTab==='health')loadHealth();
    if(activeTab==='today')loadToday();
  }catch(e){toast('Error: '+e.message);}
}

async function loadHealth(){
  try{
    var rows=await sbFetch('/rest/v1/baby_health?order=logged_at.desc&limit=50&select=*');
    document.getElementById('health-content').innerHTML=
      '<div class="quicklog-grid"><div class="ql-btn purple" onclick="openHealthModal(\'temperature\')"><div class="ql-icon">🌡️</div><div class="ql-label">Temperature</div></div><div class="ql-btn teal" onclick="openHealthModal(\'weight\')"><div class="ql-icon">⚖️</div><div class="ql-label">Weight</div></div><div class="ql-btn yellow" onclick="openHealthModal(\'medicine\')"><div class="ql-icon">💊</div><div class="ql-label">Medicine</div></div><div class="ql-btn green" onclick="openHealthModal(\'note\')"><div class="ql-icon">🩺</div><div class="ql-label">Note</div></div></div>'+
      (rows.length?'<div class="history-section"><h3>Health history</h3>'+rows.map(function(h){return '<div class="log-item"><div class="log-icon">'+(h.health_type==='temperature'?'🌡️':h.health_type==='weight'?'⚖️':h.health_type==='medicine'?'💊':'🩺')+'</div><div class="log-info"><div class="log-title">'+esc(healthTitle(h))+'</div>'+(h.notes?'<div class="log-detail">'+esc(h.notes)+'</div>':'')+'</div><div class="log-actions"><div class="log-time">'+fmtDateTime(h.logged_at)+'</div><button class="undo-btn" onclick="deleteBabyLog(\'baby_health\',\''+h.id+'\',\'health log\')">Undo</button></div></div>';}).join('')+'</div>':'<div class="empty-log">No health logs yet</div>');
  }catch(e){document.getElementById('health-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+e.message+'</div>';}
}

async function deleteBabyLog(table,id,label){
  if(!confirm('Delete this '+label+'?'))return;
  try{
    await sbFetch('/rest/v1/'+table+'?id=eq.'+id,{method:'DELETE'});
    if(table==='baby_diapers'){
      try{await FamilyPal.incrementDiaperStock('BabyPal undo');}catch(e){}
    }
    toast('Deleted '+label);
    if(activeTab==='today')loadToday();
    if(activeTab==='history')loadHistory();
    if(activeTab==='health')loadHealth();
  }catch(e){toast('Error: '+e.message);}
}

async function loadHistory(){
  try{
    var since=new Date();since.setDate(since.getDate()-7);
    var results=await Promise.all([
      sbFetch('/rest/v1/baby_feeds?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=30&select=*'),
      sbFetch('/rest/v1/baby_diapers?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=30&select=*'),
      sbFetch('/rest/v1/baby_sleep?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=20&select=*'),
      sbFetch('/rest/v1/baby_pumping?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=20&select=*'),
      sbFetch('/rest/v1/baby_health?logged_at=gte.'+since.toISOString()+'&order=logged_at.desc&limit=20&select=*')
    ]);
    var all=[].concat(
      results[0].map(function(f){return{table:'baby_feeds',id:f.id,label:'feed',icon:f.feed_type==='bottle'?'🍼':'🤱',title:f.feed_type==='bottle'?'Bottle - '+f.amount_ml+'ml':'Breast - '+f.duration_mins+'min ('+f.breast_side+')',detail:f.notes,ts:f.logged_at};}),
      results[1].map(function(d){return{table:'baby_diapers',id:d.id,label:'diaper',icon:d.diaper_type==='wet'?'💧':'💩',title:d.diaper_type==='wet'?'Wet diaper':'Soiled diaper',detail:d.notes,ts:d.logged_at};}),
      results[2].map(function(s){var dur=s.sleep_end?Math.round((new Date(s.sleep_end)-new Date(s.sleep_start))/60000):null;return{table:'baby_sleep',id:s.id,label:'sleep session',icon:'😴',title:dur?'Sleep - '+Math.floor(dur/60)+'h '+(dur%60)+'m':'Sleep started',detail:s.notes,ts:s.logged_at};}),
      results[3].map(function(p){return{table:'baby_pumping',id:p.id,label:'pump log',icon:'🥛',title:'Pumped - '+p.amount_ml+'ml',detail:p.notes,ts:p.logged_at};}),
      results[4].map(function(h){return{table:'baby_health',id:h.id,label:'health log',icon:h.health_type==='temperature'?'🌡️':h.health_type==='weight'?'⚖️':h.health_type==='medicine'?'💊':'🩺',title:healthTitle(h),detail:h.notes,ts:h.logged_at};})
    ).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
    document.getElementById('history-content').innerHTML=all.length?
      '<div class="history-section"><h3>Last 7 days</h3>'+all.map(function(e){return'<div class="log-item"><div class="log-icon">'+e.icon+'</div><div class="log-info"><div class="log-title">'+esc(e.title)+'</div>'+(e.detail?'<div class="log-detail">'+esc(e.detail)+'</div>':'')+'</div><div class="log-actions"><div class="log-time">'+fmtDateTime(e.ts)+'</div><button class="undo-btn" onclick="deleteBabyLog(\''+e.table+'\',\''+e.id+'\',\''+e.label+'\')">Undo</button></div></div>';}).join('')+'</div>':
      '<div class="empty-log">No activity in the last 7 days</div>';
  }catch(e){document.getElementById('history-content').innerHTML='<div class="loading" style="color:var(--red)">Error: '+e.message+'</div>';}
}

// ── Modal helpers ─────────────────────────────────────────
var timeFields={'feed-modal':'feed-time','breast-modal':'breast-time','pump-modal':'pump-time'};
function openModal(id){if(timeFields[id]){var el=document.getElementById(timeFields[id]);if(el)el.value=nowLocal();}document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}
function closeModalClick(e){if(e.target===e.currentTarget)closeModal(e.currentTarget.id);}
function selectSide(val,btn){document.getElementById('breast-side').value=val;document.querySelectorAll('[data-side]').forEach(function(b){b.classList.remove('selected');});btn.classList.add('selected');}

var toastTimer;
function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},2500);}

// ── Init ──────────────────────────────────────────────────
window.onload=async function(){
  if(!await FamilyPal.requireSession())return;
  document.getElementById('sleep-warn-input').value=getSleepWarn();
  loadSleepState();
  loadDiaperItemOptions();
  loadToday();
};
