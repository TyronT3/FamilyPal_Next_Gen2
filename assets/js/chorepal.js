const DIAPER_PTS   = { light:1, wet:2, soiled:5, blowout:10 };
const DIAPER_NAMES = { light:'💛 Light', wet:'💧 Wet', soiled:'💩 Soiled', blowout:'💥 Blowout' };

const STARTER = [
  {emoji:'🧹',name:'Sweep floors',freq:'daily',assign:'rotating',pts:1,baby:false},
  {emoji:'🍽️',name:'Wash dishes',freq:'daily',assign:'rotating',pts:1,baby:false},
  {emoji:'🧺',name:'Do laundry',freq:'weekly',assign:'rotating',pts:2,baby:false},
  {emoji:'🛏️',name:'Make bed',freq:'daily',assign:'rotating',pts:1,baby:false},
  {emoji:'🚿',name:'Clean bathroom',freq:'weekly',assign:'rotating',pts:3,baby:false},
  {emoji:'🛒',name:'Grocery shopping',freq:'weekly',assign:'rotating',pts:2,baby:false},
  {emoji:'🗑️',name:'Empty bins',freq:'daily',assign:'rotating',pts:1,baby:false},
  {emoji:'🧴',name:'Mop floors',freq:'weekly',assign:'rotating',pts:2,baby:false},
  {emoji:'🪟',name:'Clean windows',freq:'monthly',assign:'rotating',pts:3,baby:false},
  {emoji:'🌿',name:'Water plants',freq:'weekly',assign:'rotating',pts:1,baby:false},
  {emoji:'👶',name:'Bath Geomé',freq:'daily',assign:'rotating',pts:2,baby:false},
  {emoji:'🍼',name:'Sterilise bottles',freq:'daily',assign:'rotating',pts:1,baby:false},
  {emoji:'🚿',name:'Change diaper',freq:'daily',assign:'rotating',pts:1,baby:true},
];

function esc(s){ var d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function dateStr(d){ return d.toISOString().slice(0,10); }
function getWeekStart(){ var d=new Date(); var day=d.getDay(); var diff=day===0?-6:1-day; d.setDate(d.getDate()+diff); d.setHours(0,0,0,0); return d; }
function getWeekEnd(){ var d=getWeekStart(); d.setDate(d.getDate()+6); d.setHours(23,59,59,999); return d; }
function getMonthStart(){ var d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function getMonthEnd(){ var d=new Date(new Date().getFullYear(),new Date().getMonth()+1,0); d.setHours(23,59,59,999); return d; }
function daysLeft(end){ return Math.max(0,Math.ceil((new Date(end)-new Date())/86400000)); }

function getLogPts(l) {
  if (l.notes && DIAPER_PTS[l.notes]) return DIAPER_PTS[l.notes];
  var c = chores.find(function(c){ return c.id===l.chore_id; });
  return c ? c.points : 1;
}

function calcScores(logs) {
  var t=0, a=0;
  logs.forEach(function(l){
    var pts = getLogPts(l);
    if (l.shared){ t+=Math.ceil(pts/2); a+=Math.ceil(pts/2); }
    else if (l.completed_by==='Tyron') t+=pts;
    else if (l.completed_by==='Ansonette') a+=pts;
  });
  return {tyron:t, ansonette:a};
}

function personDidLogOnDate(person, dateKey) {
  return monthLogs.some(function(l){
    var key = dateStr(new Date(l.completed_at));
    if (key !== dateKey) return false;
    return l.shared || l.completed_by === person || l.completed_by_2 === person;
  });
}

function calcPersonStreak(person) {
  var streak = 0;
  for (var i=0; i<31; i++){
    var d = new Date();
    d.setDate(d.getDate()-i);
    if (personDidLogOnDate(person, dateStr(d))) streak++;
    else break;
  }
  return streak;
}

var chores=[], todayLogs=[], weekLogs=[], monthLogs=[], goals=[], activeTab='today', choreFilter='all';
var pendingChoreId=null, pendingPerson=null, editingChoreId=null;
var diaperLogging=false; // guard against double-firing

window.onload = async function(){
  if (!await FamilyPal.requireSession()) return;
  FamilyPal.startTokenRefresh();
  document.getElementById('chore-screen').style.display='flex';
  loadAll();
  renderStarterPack();
};

async function loadAll(){
  try {
    var todayStart = new Date(); todayStart.setHours(0,0,0,0);
    var results = await Promise.all([
      sbFetch('/rest/v1/chores?active=eq.true&order=name.asc&select=*'),
      sbFetch('/rest/v1/chore_logs?completed_at=gte.'+todayStart.toISOString()+'&order=completed_at.desc&select=*'),
      sbFetch('/rest/v1/chore_goals?active=eq.true&order=created_at.desc&select=*'),
      sbFetch('/rest/v1/chore_logs?completed_at=gte.'+getWeekStart().toISOString()+'&select=*'),
      sbFetch('/rest/v1/chore_logs?completed_at=gte.'+getMonthStart().toISOString()+'&select=*')
    ]);
    chores = results[0]; todayLogs = results[1]; goals = results[2];
    weekLogs = results[3]; monthLogs = results[4];
    checkGoalExpiry();
    renderToday();
  } catch(e){ toast('Error: '+e.message); }
}

async function checkGoalExpiry(){
  var today = new Date();
  for (var i=0; i<goals.length; i++){
    var goal = goals[i];
    if (goal.end_date < dateStr(today) && goal.active && !goal.winner){
      var logs = await sbFetch('/rest/v1/chore_logs?completed_at=gte.'+new Date(goal.start_date+'T00:00:00').toISOString()+'&select=*');
      var scores = calcScores(logs);
      var winner = scores.tyron>scores.ansonette ? 'Tyron' : scores.ansonette>scores.tyron ? 'Ansonette' : 'tie';
      await sbFetch('/rest/v1/chore_goals?id=eq.'+goal.id, {method:'PATCH', body:JSON.stringify({winner:winner, active:false})});
      goal.winner=winner; goal.active=false;
      var key='goal_shown_'+goal.id;
      if (!localStorage.getItem(key)){
        localStorage.setItem(key,'1');
        document.getElementById('winner-title').textContent = winner==='tie'?'🤝 It\'s a tie!':winner==='Tyron'?'👨 Tyron wins!':'👩 Ansonette wins!';
        document.getElementById('winner-prize').textContent = '🎁 Prize: '+goal.prize;
        document.getElementById('winner-sub').textContent = (goal.period==='weekly'?'This week':'This month')+' — Tyron '+scores.tyron+'pts vs Ansonette '+scores.ansonette+'pts';
        document.getElementById('winner-overlay').style.display='flex';
      }
    }
  }
  goals = goals.filter(function(g){ return g.active; });
}

function getLogsToday(choreId){
  var ts=new Date(); ts.setHours(0,0,0,0);
  return todayLogs.filter(function(l){ return l.chore_id===choreId && new Date(l.completed_at)>=ts; });
}

function isDueToday(chore){
  if (chore.frequency==='daily') return true;
  if (chore.frequency==='once') return !todayLogs.some(function(l){ return l.chore_id===chore.id; });
  var cutoff = chore.frequency==='weekly' ? getWeekStart() : getMonthStart();
  return !todayLogs.some(function(l){ return l.chore_id===chore.id && new Date(l.completed_at)>=cutoff; });
}

function setChoreFilter(filter,button){
  choreFilter=filter;
  document.querySelectorAll('[data-chore-filter]').forEach(function(btn){btn.classList.toggle('active',btn===button);});
  renderToday();
}

function renderToday(){
  var ts=new Date(); ts.setHours(0,0,0,0);
  var dayLogs = todayLogs.filter(function(l){ return new Date(l.completed_at)>=ts; });
  var wScores = calcScores(weekLogs);
  var mScores = calcScores(monthLogs);
  var tc = dayLogs.filter(function(l){ return l.completed_by==='Tyron'||l.shared; }).length;
  var ac = dayLogs.filter(function(l){ return l.completed_by==='Ansonette'||l.shared; }).length;

  document.getElementById('score-area').innerHTML =
    '<div class="score-banner">' +
    '<div class="score-side tyron">' +
      '<div class="score-name">👨 Tyron '+(wScores.tyron>wScores.ansonette&&wScores.tyron>0?'🏆':'')+'</div>' +
      '<div class="score-pts">'+wScores.tyron+'<span style="font-size:13px;font-weight:400;color:var(--muted)"> wk</span></div>' +
      '<div class="score-sub">'+mScores.tyron+' pts this month · '+tc+' today</div>' +
    '</div>' +
    '<div class="score-side ansonette">' +
      '<div class="score-name">👩 Ansonette '+(wScores.ansonette>wScores.tyron&&wScores.ansonette>0?'🏆':'')+'</div>' +
      '<div class="score-pts">'+wScores.ansonette+'<span style="font-size:13px;font-weight:400;color:var(--muted)"> wk</span></div>' +
      '<div class="score-sub">'+mScores.ansonette+' pts this month · '+ac+' today</div>' +
    '</div>' +
    '</div>';

  var tStreak = calcPersonStreak('Tyron');
  var aStreak = calcPersonStreak('Ansonette');
  document.getElementById('streak-area').innerHTML =
    '<div class="streak-strip">' +
    '<div class="streak-card tyron"><div class="streak-label">Tyron streak</div><div class="streak-value">'+tStreak+' day'+(tStreak!==1?'s':'')+'</div><div class="streak-sub">Any chore logged daily</div></div>' +
    '<div class="streak-card ansonette"><div class="streak-label">Ansonette streak</div><div class="streak-value">'+aStreak+' day'+(aStreak!==1?'s':'')+'</div><div class="streak-sub">Shared chores count too</div></div>' +
    '</div>';

  renderGoalStrip();

  var visibleChores=chores.filter(function(c){
    if(choreFilter==='person1')return c.assigned_to==='Tyron'||c.assigned_to==='rotating';
    if(choreFilter==='person2')return c.assigned_to==='Ansonette'||c.assigned_to==='rotating';
    if(choreFilter==='shared')return c.assigned_to==='rotating';
    return true;
  });
  var daily = visibleChores.filter(function(c){ return c.frequency==='daily'; });
  var oneshot = visibleChores.filter(function(c){ return c.frequency!=='daily' && isDueToday(c); });
  var doneOneshot = oneshot.filter(function(c){ return getLogsToday(c.id).length>0; });
  var pendingOneshot = oneshot.filter(function(c){ return getLogsToday(c.id).length===0; });
  var totalDue = daily.length+oneshot.length;
  var totalDone = daily.filter(function(c){ return getLogsToday(c.id).length>0; }).length + doneOneshot.length;
  var pct = totalDue>0 ? Math.round(totalDone/totalDue*100) : 0;

  document.getElementById('progress-area').innerHTML =
    '<div class="progress-wrap"><div style="display:flex;justify-content:space-between;align-items:center">' +
    '<span style="font-size:13px;color:var(--muted)">'+totalDone+'/'+totalDue+' done today</span>' +
    '<span style="font-size:13px;color:var(--accent);font-weight:700">'+pct+'%</span></div>' +
    '<div class="progress-bar"><div class="progress-fill" style="width:'+pct+'%"></div></div></div>';

  if (!visibleChores.length){
    document.getElementById('chores-today').innerHTML=chores.length?'<div class="empty-state"><div style="font-weight:700;margin-bottom:6px">No chores in this view</div><div style="font-size:13px">Choose another assignment filter.</div></div>':'<div class="empty-state"><div style="font-weight:700;margin-bottom:6px">No chores yet</div><div style="font-size:13px">Use Add chore to create the first one.</div></div>';
    return;
  }

  function cardHtml(c, canRepeat){
    var logs=getLogsToday(c.id), count=logs.length, last=logs[0];
    var freqLabel={daily:'Daily',weekly:'Weekly',monthly:'Monthly',once:'Once only'}[c.frequency]||c.frequency;
    var freqClass={daily:'pill-daily',weekly:'pill-weekly',monthly:'pill-monthly',once:'pill-once'}[c.frequency]||'pill-daily';
    var assignPill = c.assigned_to==='rotating'?'<span class="chore-pill pill-rotating">🔄</span>':
                     c.assigned_to==='Tyron'?'<span class="chore-pill pill-tyron">👨</span>':
                     '<span class="chore-pill pill-ansonette">👩</span>';
    var linkPill = c.babypal_link ? '<span class="chore-pill pill-linked">🔗 BabyPal</span>' : '';
    var ptsLabel = c.babypal_link ? '1–10' : c.points;
    var doneInfo='', doneClass='tyron';
    if(logs.length>0){
      // count per person
      var tCount=logs.filter(function(l){ return !l.shared&&l.completed_by==='Tyron'; }).length;
      var aCount=logs.filter(function(l){ return !l.shared&&l.completed_by==='Ansonette'; }).length;
      var bCount=logs.filter(function(l){ return l.shared; }).length;
      var parts=[];
      if(tCount>0) parts.push('👨 Tyron'+(tCount>1?' ×'+tCount:''));
      if(aCount>0) parts.push('👩 Ansonette'+(aCount>1?' ×'+aCount:''));
      if(bCount>0) parts.push('👨👩 Together'+(bCount>1?' ×'+bCount:''));
      // add diaper type if applicable
      var lastDiaper=logs.filter(function(l){ return l.notes&&DIAPER_NAMES[l.notes]; });
      var typeNote=lastDiaper.length>0?' ('+DIAPER_NAMES[lastDiaper[0].notes]+')':'';
      doneInfo=parts.join(', ')+typeNote;
      doneClass=bCount>0||tCount>0&&aCount>0?'both':tCount>0?'tyron':'ansonette';
    }
    return '<div class="chore-card '+(count>0&&!canRepeat?'done':'')+'">' +
      '<div class="chore-emoji">'+(c.emoji||'🧹')+'</div>' +
      '<div class="chore-info">' +
        '<div class="chore-name">'+esc(c.name)+'</div>' +
        '<div class="chore-meta"><span class="chore-pill '+freqClass+'">'+freqLabel+'</span>'+assignPill+'<span class="chore-pill pill-pts">⭐ '+ptsLabel+'pt</span>'+linkPill+'</div>' +
        (count>0?'<div class="chore-done-info '+doneClass+'">✓ '+doneInfo+'</div>':'') +
      '</div>' +
      '<div class="chore-actions">' +
        '<button class="done-btn" onclick="openWhoModal(\''+c.id+'\')">✓ '+(canRepeat&&count>0?'+1':'Done')+'</button>' +
        (count>0?'<div class="count-badge">×'+count+'</div>':'') +
      '</div>' +
    '</div>';
  }

  var html='';
  if (daily.length) html+='<div class="section-header">🔄 Daily Chores</div>'+daily.map(function(c){ return cardHtml(c,true); }).join('');
  if (pendingOneshot.length) html+='<div class="section-header">🔲 To Do</div>'+pendingOneshot.map(function(c){ return cardHtml(c,false); }).join('');
  if (doneOneshot.length) html+='<div class="section-header">✅ Completed</div>'+doneOneshot.map(function(c){ return cardHtml(c,false); }).join('');
  document.getElementById('chores-today').innerHTML='<div>'+html+'</div>';
}

function renderGoalStrip(){
  var wg = goals.find(function(g){ return g.period==='weekly'; });
  var mg = goals.find(function(g){ return g.period==='monthly'; });
  function card(goal, type){
    if (!goal) return '<div class="goal-empty"><span class="goal-empty-txt">'+(type==='weekly'?'📅 No weekly goal':'🗓️ No monthly goal')+'</span><button class="goal-add-btn" onclick="openGoalModal(\''+type+'\')">+ Set Goal</button></div>';
    var sourceLogs = goal.period==='weekly' ? weekLogs : monthLogs;
    var goalStart = new Date(goal.start_date+'T00:00:00');
    var periodLogs = sourceLogs.filter(function(l){ return new Date(l.completed_at)>=goalStart; });
    var s = calcScores(periodLogs);
    var total = s.tyron+s.ansonette||1;
    var tPct = Math.round(s.tyron/total*100);
    var dl = daysLeft(goal.end_date);
    return '<div class="goal-card '+goal.period+'">' +
      '<div class="goal-header"><div class="goal-title">'+(goal.period==='weekly'?'📅 Weekly Goal':'🗓️ Monthly Goal')+'</div><div class="goal-days">'+(dl===0?'Ends today!':dl===1?'1 day left':dl+' days left')+'</div></div>' +
      '<div class="goal-prize">🎁 '+esc(goal.prize)+'<span>— winner takes the prize!</span></div>' +
      '<div class="goal-bar-wrap"><div class="goal-bar-labels"><span class="t">👨 Tyron: '+s.tyron+'pts</span><span class="a">👩 Ansonette: '+s.ansonette+'pts</span></div>' +
      '<div class="goal-bar"><div class="goal-bar-t" style="width:'+(s.tyron>0||s.ansonette>0?tPct:50)+'%"></div><div class="goal-bar-a" style="width:'+(s.tyron>0||s.ansonette>0?100-tPct:50)+'%"></div></div>' +
      (goal.points_target?'<div class="goal-target">Target: '+goal.points_target+'pts</div>':'') +
      '</div></div>';
  }
  document.getElementById('goal-strip').innerHTML = card(wg,'weekly')+card(mg,'monthly');
}

function openWhoModal(choreId){
  var chore=chores.find(function(c){ return c.id===choreId; });
  pendingChoreId=choreId; pendingPerson=null;
  document.getElementById('who-title').textContent='Who did "'+( chore?chore.name:'' )+'"?';
  document.getElementById('who-modal').style.display='flex';
}

function handleWhoSelected(person){
  pendingPerson=person;
  closeModal('who-modal');
  var chore=chores.find(function(c){ return c.id===pendingChoreId; });
  if (chore && chore.babypal_link==='diaper'){
    document.getElementById('diaper-modal').style.display='flex';
  } else {
    completeDiaperLog(null, null);
  }
}

async function completeDiaperLog(diaperType, babypalType){
  if(diaperLogging) return;
  diaperLogging=true;
  closeModal('diaper-modal');
  var chore=chores.find(function(c){ return c.id===pendingChoreId; });
  var person=pendingPerson;
  var shared=person==='Both';
  var pts = diaperType ? (DIAPER_PTS[diaperType]||1) : (chore?chore.points:1);
  var eachPts = shared ? Math.ceil(pts/2) : pts;
  try {
    var payload={chore_id:pendingChoreId, completed_by:shared?'Tyron':person, completed_at:new Date().toISOString(), shared:shared, completed_by_2:shared?'Ansonette':null, notes:diaperType||null};
    var res=await sbFetch('/rest/v1/chore_logs',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    var log=Array.isArray(res)?res[0]:res;
    todayLogs.unshift(log);
    weekLogs.unshift(log);
    monthLogs.unshift(log);
    var stockMsg='';
    var linkedDiaperId=null;
    var restoreDiaperStock=false;
    if (chore && chore.babypal_link==='diaper' && babypalType){
      var diaperRows=await sbFetch('/rest/v1/baby_diapers',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({diaper_type:babypalType, logged_at:new Date().toISOString()})});
      var linkedDiaper=Array.isArray(diaperRows)?diaperRows[0]:diaperRows;linkedDiaperId=linkedDiaper&&linkedDiaper.id;
      try{
        var stock=await FamilyPal.decrementDiaperStock('ChoresPal');
        restoreDiaperStock=!stock.skipped&&stock.previousQty>0;
        if(!stock.skipped) stockMsg=stock.previousQty<1?' Diaper stock already 0.':' '+stock.name+' now '+stock.qty_stocked+'.';
      }catch(stockErr){ stockMsg=' Diaper stock was not updated.'; }
    }
    var label = diaperType ? DIAPER_NAMES[diaperType] : 'Done';
    var completionMessage=(shared?'Completed together · '+eachPts+' pts each':label+' · '+person+' +'+pts+' pt'+(pts!==1?'s':''))+stockMsg;
    FamilyPalUI.offerUndo(completionMessage,function(){return undoChore(log.id,linkedDiaperId,restoreDiaperStock,true);});
    pendingChoreId=null; pendingPerson=null; diaperLogging=false;
    renderToday();
  } catch(e){ diaperLogging=false; toast('Error: '+e.message); }
}

async function undoChore(logId,babyDiaperId,restoreStock,silent){
  try{
    await sbFetch('/rest/v1/chore_logs?id=eq.'+logId,{method:'DELETE'});
    if(babyDiaperId){await sbFetch('/rest/v1/baby_diapers?id=eq.'+babyDiaperId,{method:'DELETE'});if(restoreStock)try{await FamilyPal.incrementDiaperStock('ChoresPal undo');}catch(e){}}
    todayLogs=todayLogs.filter(function(l){ return l.id!==logId; });
    weekLogs=weekLogs.filter(function(l){ return l.id!==logId; });
    monthLogs=monthLogs.filter(function(l){ return l.id!==logId; });
    renderToday(); if(!silent)toast('Chore completion undone');
  }catch(e){ toast('Error: '+e.message); }
}

async function renderGoalsTab(){
  try{
    var all=await sbFetch('/rest/v1/chore_goals?order=created_at.desc&select=*');
    var active=all.filter(function(g){ return g.active; });
    var past=all.filter(function(g){ return !g.active; });
    function cardHtml(g,isActive){
      var wb=g.winner?(g.winner==='tie'?'<span class="goal-winner-badge winner-tie">🤝 Tie</span>':g.winner==='Tyron'?'<span class="goal-winner-badge winner-tyron">🏆 Tyron!</span>':'<span class="goal-winner-badge winner-ansonette">🏆 Ansonette!</span>'):'';
      return '<div class="goal-list-card"><div class="goal-list-header"><div class="goal-list-prize">🎁 '+esc(g.prize)+'</div><div style="display:flex;gap:6px;align-items:center"><span class="goal-period-badge period-'+g.period+'">'+g.period+'</span>'+(isActive?'<button class="del-goal-btn" onclick="deleteGoal(\''+g.id+'\')">🗑</button>':'')+'</div></div><div class="goal-list-dates">'+new Date(g.start_date).toLocaleDateString()+' → '+new Date(g.end_date).toLocaleDateString()+'</div>'+wb+(g.points_target?'<div style="font-size:11px;color:var(--muted);margin-top:4px">Target: '+g.points_target+'pts</div>':'')+'</div>';
    }
    var html='<h3>Active Goals ('+active.length+')</h3>';
    if (active.length) html+=active.map(function(g){ return cardHtml(g,true); }).join('');
    else html+='<div style="color:var(--muted);font-size:13px;margin-bottom:16px">No active goals yet.</div>';
    html+='<div style="display:flex;gap:8px;margin-bottom:20px"><button class="btn btn-primary" style="font-size:13px" onclick="openGoalModal(\'weekly\')">📅 Weekly Goal</button><button class="btn btn-secondary" style="font-size:13px;margin-top:0" onclick="openGoalModal(\'monthly\')">🗓️ Monthly Goal</button></div>';
    if (past.length) html+='<h3>Past Goals ('+past.length+')</h3>'+past.map(function(g){ return cardHtml(g,false); }).join('');
    document.getElementById('active-goals-section').innerHTML=html;
  }catch(e){ toast('Error: '+e.message); }
}

function openGoalModal(period){
  document.getElementById('goal-period').value=period;
  document.getElementById('goal-prize').value='';
  document.getElementById('goal-target').value='';
  document.getElementById('goal-modal').style.display='flex';
}

async function saveGoal(){
  var period=document.getElementById('goal-period').value;
  var prize=document.getElementById('goal-prize').value.trim();
  var target=parseInt(document.getElementById('goal-target').value)||null;
  if(!prize){toast('Enter a prize');return;}
  var existing=goals.find(function(g){ return g.period===period; });
  if(existing){ if(!(await FamilyPalUI.confirm('The current '+period+' goal will be archived and replaced.',{title:'Replace existing goal?',confirmLabel:'Replace goal'})))return; await sbFetch('/rest/v1/chore_goals?id=eq.'+existing.id,{method:'PATCH',body:JSON.stringify({active:false})}); goals=goals.filter(function(g){ return g.id!==existing.id; }); }
  var start=period==='weekly'?getWeekStart():getMonthStart();
  var end=period==='weekly'?getWeekEnd():getMonthEnd();
  // Sunday is the last day of the week — advance to next week so the goal starts fresh
  if (period==='weekly' && new Date().getDay()===0) { start.setDate(start.getDate()+7); end.setDate(end.getDate()+7); }
  try{
    var res=await sbFetch('/rest/v1/chore_goals',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({period:period,prize:prize,points_target:target,created_by:'shared',start_date:dateStr(start),end_date:dateStr(end),confirmed:true,active:true})});
    var ng=Array.isArray(res)?res[0]:res; goals.push(ng);
    closeModal('goal-modal'); renderToday(); if(activeTab==='goals') renderGoalsTab();
    toast('🏆 '+period+' goal set! Prize: '+prize);
  }catch(e){ toast('Error: '+e.message); }
}

async function deleteGoal(id){
  if(!(await FamilyPalUI.confirm('This goal will be permanently removed.',{title:'Delete goal?',confirmLabel:'Delete'})))return;
  try{ await sbFetch('/rest/v1/chore_goals?id=eq.'+id,{method:'PATCH',body:JSON.stringify({active:false})}); goals=goals.filter(function(g){ return g.id!==id; }); renderGoalsTab(); renderToday(); toast('Goal deleted'); }
  catch(e){ toast('Error: '+e.message); }
}

async function loadHistory(){
  try{
    var since=new Date(); since.setDate(since.getDate()-14);
    var logs=await sbFetch('/rest/v1/chore_logs?completed_at=gte.'+since.toISOString()+'&order=completed_at.desc&limit=100&select=*');
    if(!logs.length){document.getElementById('history-content').innerHTML='<div class="empty-state"><div class="big">📋</div><div>No history yet</div></div>';return;}
    document.getElementById('history-content').innerHTML=logs.map(function(l){
      var c=chores.find(function(c){ return c.id===l.chore_id; });
      var byClass=l.shared?'both':(l.completed_by||'').toLowerCase();
      var byText=l.shared?'👨👩 Together':l.completed_by==='Tyron'?'👨 Tyron':'👩 Ansonette';
      var pts=getLogPts(l);
      var dType=l.notes&&DIAPER_NAMES[l.notes]?' ('+DIAPER_NAMES[l.notes]+')':'';
      return '<div class="hist-item"><div class="hist-icon">'+(c?c.emoji:'🧹')+'</div><div class="hist-info"><div class="hist-name">'+esc(c?c.name:'Unknown')+dType+'</div><div class="hist-by '+byClass+'">'+byText+' · ⭐ '+pts+'pt</div></div><div class="hist-time">'+new Date(l.completed_at).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})+'<br>'+new Date(l.completed_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</div></div>';
    }).join('');
  }catch(e){ toast('Error: '+e.message); }
}

function renderSetup(){
  document.getElementById('chore-count').textContent=chores.length;
  document.getElementById('chore-setup-list').innerHTML=chores.map(function(c){
    return '<div class="chore-list-item"><div class="cli-emoji">'+(c.emoji||'🧹')+'</div><div class="cli-info"><div class="cli-name">'+esc(c.name)+'</div><div class="cli-meta">'+c.frequency+' · '+c.assigned_to+' · ⭐ '+(c.babypal_link?'1–10':c.points)+'pt'+(c.points!==1?'s':'')+(c.babypal_link?' · 🔗 BabyPal':'')+'</div></div><div class="cli-actions"><button class="edit-btn" onclick="startEdit(\''+c.id+'\')">✏️</button><button class="del-btn" onclick="deleteChore(\''+c.id+'\')">🗑</button></div></div>';
  }).join('')||'<div style="color:var(--muted);font-size:13px;padding:10px 0">No chores yet</div>';
}

function startEdit(id){
  var c=chores.find(function(c){ return c.id===id; }); if(!c)return;
  editingChoreId=id;
  document.getElementById('new-emoji').value=c.emoji||'';
  document.getElementById('new-name').value=c.name;
  document.getElementById('new-freq').value=c.frequency;
  document.getElementById('new-assign').value=c.assigned_to;
  document.getElementById('new-pts').value=c.points;
  document.getElementById('new-babylink').checked=!!c.babypal_link;
  document.getElementById('setup-form-title').textContent='✏️ Edit chore';
  document.getElementById('cancel-edit-btn').style.display='block';
  document.querySelector('#tab-setup .btn-primary').textContent='Save Changes';
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelEdit(){
  editingChoreId=null;
  document.getElementById('new-name').value='';
  document.getElementById('new-emoji').value='';
  document.getElementById('new-freq').value='daily';
  document.getElementById('new-assign').value='rotating';
  document.getElementById('new-pts').value='1';
  document.getElementById('new-babylink').checked=false;
  document.getElementById('setup-form-title').textContent='➕ Add a chore';
  document.getElementById('cancel-edit-btn').style.display='none';
  document.querySelector('#tab-setup .btn-primary').textContent='Add Chore';
}

async function saveChore(){
  var name=document.getElementById('new-name').value.trim(); if(!name){toast('Enter a name');return;}
  var emoji=document.getElementById('new-emoji').value.trim()||'🧹';
  var freq=document.getElementById('new-freq').value;
  var assign=document.getElementById('new-assign').value;
  var pts=parseInt(document.getElementById('new-pts').value)||1;
  var baby=document.getElementById('new-babylink').checked?'diaper':null;
  var payload={name:name,emoji:emoji,frequency:freq,assigned_to:assign,points:pts,babypal_link:baby};
  try{
    if(editingChoreId){
      await sbFetch('/rest/v1/chores?id=eq.'+editingChoreId,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
      var idx=chores.findIndex(function(c){ return c.id===editingChoreId; });
      if(idx>=0) chores[idx]=Object.assign({},chores[idx],payload);
      toast(emoji+' '+name+' updated!'); cancelEdit();
    } else {
      var res=await sbFetch('/rest/v1/chores',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
      var nc=Array.isArray(res)?res[0]:res; chores.push(nc); chores.sort(function(a,b){ return a.name.localeCompare(b.name); });
      document.getElementById('new-name').value=''; document.getElementById('new-emoji').value=''; document.getElementById('new-pts').value='1'; document.getElementById('new-babylink').checked=false;
      toast(emoji+' '+name+' added!');
    }
    renderSetup(); renderToday();
  }catch(e){ toast('Error: '+e.message); }
}

async function deleteChore(id){
  if(!(await FamilyPalUI.confirm('This chore will be permanently removed. Existing history will be kept.',{title:'Delete chore?',confirmLabel:'Delete'})))return;
  try{ await sbFetch('/rest/v1/chores?id=eq.'+id,{method:'PATCH',body:JSON.stringify({active:false})}); chores=chores.filter(function(c){ return c.id!==id; }); if(editingChoreId===id) cancelEdit(); renderSetup(); renderToday(); toast('Deleted'); }
  catch(e){ toast('Error: '+e.message); }
}

function renderStarterPack(){
  document.getElementById('starter-pack').innerHTML=STARTER.map(function(c,i){
    return '<button onclick="addStarter('+i+')" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--text);cursor:pointer;">'+c.emoji+' '+c.name+'</button>';
  }).join('');
}

async function addStarter(i){
  var c=STARTER[i];
  if(chores.find(function(ch){ return ch.name===c.name; })){ toast(c.name+' already exists'); return; }
  try{
    var res=await sbFetch('/rest/v1/chores',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({name:c.name,emoji:c.emoji,frequency:c.freq,assigned_to:c.assign,points:c.pts,babypal_link:c.baby?'diaper':null})});
    var nc=Array.isArray(res)?res[0]:res; chores.push(nc); chores.sort(function(a,b){ return a.name.localeCompare(b.name); });
    renderSetup(); toast(c.emoji+' '+c.name+' added!');
  }catch(e){ toast('Error: '+e.message); }
}

async function loadAnalytics(){
  var el=document.getElementById('analytics-content');
  el.innerHTML='<div class="loading"><span class="spinner"></span></div>';
  try{
    var since8w=new Date();since8w.setDate(since8w.getDate()-55);since8w.setHours(0,0,0,0);
    var since30=new Date();since30.setDate(since30.getDate()-29);since30.setHours(0,0,0,0);
    var results=await Promise.all([
      sbFetch('/rest/v1/chore_logs?completed_at=gte.'+since8w.toISOString()+'&select=*'),
      sbFetch('/rest/v1/chore_logs?completed_at=gte.'+since30.toISOString()+'&order=completed_at.desc&select=*')
    ]);
    var logs8w=results[0],logs30=results[1];

    // ── 8-week points trend ──────────────────────────
    var weeks=[];
    for(var w=7;w>=0;w--){
      var ws=new Date();ws.setDate(ws.getDate()-w*7);ws.setHours(0,0,0,0);
      var we=new Date(ws);we.setDate(we.getDate()+6);we.setHours(23,59,59,999);
      var wLogs=logs8w.filter(function(l){var t=new Date(l.completed_at);return t>=ws&&t<=we;});
      var sc=calcScores(wLogs);
      var label=ws.toLocaleDateString([],{month:'short',day:'numeric'});
      weeks.push({label:label,t:sc.tyron,a:sc.ansonette});
    }
    var maxPts=Math.max.apply(null,weeks.map(function(w){return w.t+w.a;}).concat([1]));
    var trendHtml='<div class="an-chart">'+weeks.map(function(w){
      var tH=Math.max(2,w.t/maxPts*68);var aH=Math.max(2,w.a/maxPts*68);
      return'<div class="an-col">'+
        '<div class="an-bar-wrap">'+
          '<div class="an-bar" style="height:'+tH+'px;background:#4370A6" title="Tyron '+w.t+'pts"></div>'+
          '<div class="an-bar" style="height:'+aH+'px;background:#C85F72" title="Ansonette '+w.a+'pts"></div>'+
        '</div>'+
        '<div class="an-lbl">'+w.label+'</div>'+
      '</div>';
    }).join('')+'</div>'+
    '<div class="an-legend"><span><div class="an-dot" style="background:#4370A6"></div>Tyron</span><span><div class="an-dot" style="background:#C85F72"></div>Ansonette</span></div>';

    // ── Points this month split ──────────────────────
    var mStart=getMonthStart();
    var mLogs=logs8w.filter(function(l){return new Date(l.completed_at)>=mStart;});
    var mSc=calcScores(mLogs);
    var mTotal=mSc.tyron+mSc.ansonette||1;
    var tDiaper=0,aDiaper=0,tHouse=0,aHouse=0;
    mLogs.forEach(function(l){
      var pts=getLogPts(l);
      var c=chores.find(function(c){return c.id===l.chore_id;});
      var isBaby=c&&c.babypal_link;
      if(l.shared){var h=Math.ceil(pts/2);if(isBaby){tDiaper+=h;aDiaper+=h;}else{tHouse+=h;aHouse+=h;}}
      else if(l.completed_by==='Tyron'){if(isBaby)tDiaper+=pts;else tHouse+=pts;}
      else if(l.completed_by==='Ansonette'){if(isBaby)aDiaper+=pts;else aHouse+=pts;}
    });
    function splitBar(baby,house,cBaby,cHouse){
      var tot=baby+house;if(tot===0)return'';
      var bPct=Math.round(baby/tot*100);
      return'<div style="display:flex;gap:2px;border-radius:4px;overflow:hidden;height:8px;margin:3px 0 2px">'+
        (bPct>0?'<div style="flex:'+bPct+';background:'+cBaby+'"></div>':'')+
        (bPct<100?'<div style="flex:'+(100-bPct)+';background:'+cHouse+'"></div>':'')+
      '</div><div style="font-size:10px;color:var(--muted);margin-bottom:2px">🍼 '+baby+'pts baby care · 🧹 '+house+'pts household</div>';
    }
    var splitHtml=
      '<div class="an-row"><span class="lbl">👨 Tyron</span><span class="val an-chip an-chip-t">'+mSc.tyron+' pts</span></div>'+
      splitBar(tDiaper,tHouse,'#9c27b0','#4370A6')+
      '<div class="an-row" style="margin-top:8px"><span class="lbl">👩 Ansonette</span><span class="val an-chip an-chip-a">'+mSc.ansonette+' pts</span></div>'+
      splitBar(aDiaper,aHouse,'#9c27b0','#C85F72');

    // ── Most done chores (last 30d) ──────────────────
    var choreCounts={};
    logs30.forEach(function(l){
      var c=chores.find(function(c){return c.id===l.chore_id;});
      var name=c?(c.emoji||'🧹')+' '+c.name:'Unknown';
      if(!choreCounts[name]){choreCounts[name]={t:0,a:0,b:0};}
      if(l.shared){choreCounts[name].b++;}else if(l.completed_by==='Tyron'){choreCounts[name].t++;}else{choreCounts[name].a++;}
    });
    var choreRanked=Object.entries(choreCounts).sort(function(a,b){return(b[1].t+b[1].a+b[1].b)-(a[1].t+a[1].a+a[1].b);}).slice(0,8);
    var choreHtml=choreRanked.length?choreRanked.map(function(e){
      var total=e[1].t+e[1].a+e[1].b;
      var parts=[];
      if(e[1].t)parts.push('<span class="an-chip an-chip-t">👨 '+e[1].t+'</span>');
      if(e[1].a)parts.push('<span class="an-chip an-chip-a">👩 '+e[1].a+'</span>');
      if(e[1].b)parts.push('<span class="an-chip an-chip-b">👨👩 '+e[1].b+'</span>');
      return'<div class="an-row"><span class="lbl">'+esc(e[0])+'</span><span style="display:flex;gap:4px;align-items:center">'+parts.join('')+'<strong style="font-size:12px;color:var(--muted);margin-left:4px">×'+total+'</strong></span></div>';
    }).join(''):'<div class="an-empty">No logs in last 30 days</div>';

    // ── Neglected chores (not done in 7+ days) ───────
    var now=new Date();
    var neglected=chores.filter(function(c){
      if(c.frequency==='once')return false;
      var last=logs8w.filter(function(l){return l.chore_id===c.id;}).sort(function(a,b){return new Date(b.completed_at)-new Date(a.completed_at);})[0];
      if(!last)return true;
      var daysSince=Math.floor((now-new Date(last.completed_at))/86400000);
      return c.frequency==='daily'?daysSince>=2:daysSince>=7;
    });
    var neglectHtml=neglected.length?neglected.map(function(c){
      var last=logs8w.filter(function(l){return l.chore_id===c.id;}).sort(function(a,b){return new Date(b.completed_at)-new Date(a.completed_at);})[0];
      var daysSince=last?Math.floor((now-new Date(last.completed_at))/86400000):null;
      return'<div class="an-row"><span class="lbl">'+(c.emoji||'🧹')+' '+esc(c.name)+'</span><span class="an-neglect">'+(daysSince!==null?daysSince+'d ago':'never')+'</span></div>';
    }).join(''):'<div class="an-empty">✅ All chores up to date!</div>';

    el.innerHTML=
      '<div class="an-card an-section"><h3>📈 Weekly points (8 weeks)</h3>'+trendHtml+'</div>'+
      '<div class="an-card an-section"><h3>🏅 This month</h3>'+splitHtml+'</div>'+
      '<div class="an-card an-section"><h3>🔝 Most done — last 30 days</h3>'+choreHtml+'</div>'+
      '<div class="an-card an-section"><h3>⚠️ Neglected chores</h3>'+neglectHtml+'</div>';
  }catch(e){el.innerHTML='<div style="color:var(--red)">Error: '+e.message+'</div>';}
}

function switchTab(tab,btn){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
  btn.classList.add('active');
  ['today','goals','history','analytics','setup'].forEach(function(t){ document.getElementById('tab-'+t).style.display=t===tab?'block':'none'; });
  if(tab==='today') renderToday();
  if(tab==='goals') renderGoalsTab();
  if(tab==='history') loadHistory();
  if(tab==='analytics') loadAnalytics();
  if(tab==='setup') renderSetup();
}
function switchTabById(tab){ var target=document.querySelector('[data-tab="'+tab+'"]'); if(target) switchTab(tab,target); }

function closeModal(id){ document.getElementById(id).style.display='none'; }
function closeModalClick(e){ if(e.target===e.currentTarget) closeModal(e.currentTarget.id); }

var toastTimer;
function toast(msg){ var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.classList.remove('show'); },2500); }
