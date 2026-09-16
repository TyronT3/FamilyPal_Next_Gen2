/* Paper entry is separate from the original School Day form. */
var paperState, paperBusy=false;
function paperKey(){return 'bp_school_papers_v1:'+localStorage.getItem('fp_email');}
function paperToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function paperDay(){return paperState.days[paperState.date]||(paperState.days[paperState.date]={milk:[],diapers:{},sleep:[],ml:''});}
function paperStore(){try{localStorage.setItem(paperKey(),JSON.stringify(paperState));return true;}catch(e){document.getElementById('paper-status').textContent='Draft could not be stored on this computer. Keep this page open.';return false;}}
function openSchoolGrid(){
  if(paperBusy){document.getElementById('school-grid-modal').style.display='flex';return;}
  try{paperState=JSON.parse(localStorage.getItem(paperKey()));}catch(e){paperState=null;}
  if(!paperState||paperState.version!==1)paperState={version:1,date:paperToday(),days:{},saved:[]};
  document.getElementById('school-grid-modal').style.display='flex';paperRender();document.getElementById('paper-date').focus();
}
function paperTime(slot){return String(Math.floor(slot/2)).padStart(2,'0')+':'+(slot%2?'30':'00');}
function paperDateChange(value){if(!value||paperBusy)return;paperState.date=value;paperStore();paperRender();}
function paperNext(){var d=new Date(paperState.date+'T12:00:00');do{d.setDate(d.getDate()+1);}while(d.getDay()===0||d.getDay()===6);paperDateChange(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));}
function paperToggle(row,slot){
  var d=paperDay();if(paperBusy||d.pending||d.saved)return;
  if(row==='diapers'){var values=[undefined,'wet','soiled'];var next=values[(values.indexOf(d.diapers[slot])+1)%3];if(next)d.diapers[slot]=next;else delete d.diapers[slot];}
  else{var a=d[row],i=a.indexOf(slot);if(i<0)a.push(slot);else a.splice(i,1);}
  paperStore();paperRender();document.getElementById('paper-'+row+'-'+slot).focus();
}
function paperSleeps(slots){var result=[];slots.slice().sort(function(a,b){return a-b;}).forEach(function(s){var last=result[result.length-1];if(last&&last.end===s)last.end=s+1;else result.push({start:s,end:s+1});});return result;}
function paperRender(){
  var d=paperDay(),locked=paperBusy||!!d.pending||!!d.saved;
  document.getElementById('paper-date').value=paperState.date;
  document.getElementById('paper-date').disabled=paperBusy;
  document.getElementById('paper-ml').value=d.ml;
  document.getElementById('paper-ml').disabled=locked;
  var html='<table><caption>School paper · 06:00–19:00 · each cell is 30 minutes</caption><thead><tr><th scope="col">Record</th>';
  for(var s=12;s<38;s++)html+='<th scope="col">'+paperTime(s)+'</th>';
  html+='</tr></thead><tbody>';
  ['milk','diapers','sleep'].forEach(function(row){html+='<tr class="paper-'+row+'"><th scope="row">'+row.toUpperCase()+'</th>';for(var s=12;s<38;s++){var value=row==='diapers'?d.diapers[s]:d[row].indexOf(s)>=0;var label=value?(row==='diapers'?(value==='wet'?'Wet':'Dirty'):row==='milk'?'✓':'━'):'·';html+='<td><button id="paper-'+row+'-'+s+'" type="button" '+(locked?'disabled ':'')+'aria-label="'+row+' '+paperTime(s)+': '+(value?label:'blank')+'" aria-pressed="'+!!value+'" onclick="paperToggle(\''+row+'\','+s+')">'+label+'</button></td>'; }html+='</tr>';});
  document.getElementById('paper-grid').innerHTML=html+'</tbody></table>';
  var sleeps=paperSleeps(d.sleep);
  document.getElementById('paper-review').textContent=d.milk.length+' bottles'+(d.ml?' ('+d.ml+' ml each)':' (amount unknown)')+' · '+Object.keys(d.diapers).length+' nappies · '+(sleeps.length?sleeps.map(function(s){return paperTime(s.start)+'–'+paperTime(s.end);}).join(', '):'No sleep marked');
  document.getElementById('paper-status').textContent=d.saved?'This paper is saved. Choose another date or continue to the next school day.':d.pending?'Save interrupted. Retry to finish this paper safely; its entries are locked.':'Draft kept on this computer. '+paperState.saved.length+' papers saved with this tool.';
  document.getElementById('paper-save').disabled=paperBusy||!!d.saved;
  document.getElementById('paper-save').textContent=d.pending?'Retry save & next day':'Save paper & next school day';
  document.getElementById('paper-next').disabled=paperBusy;
}
function paperRows(d,date){
  function stamp(s){return new Date(date+'T'+paperTime(s)+':00').toISOString();}
  function base(s){return {id:crypto.randomUUID(),logged_at:stamp(s),notes:'School paper • '+date+' • no home stock adjustment'};}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T12:00:00').getTime())||date>paperToday())throw new Error('Choose a valid date, today or earlier.');
  if(d.ml!==''&&(!Number.isInteger(Number(d.ml))||Number(d.ml)<=0||Number(d.ml)>500))throw new Error('Bottle amount must be 1–500 ml, or left blank.');
  return {
    baby_feeds:d.milk.map(function(s){return Object.assign(base(s),{feed_type:'bottle',amount_ml:d.ml===''?null:Number(d.ml)});}),
    baby_diapers:Object.keys(d.diapers).map(function(s){return Object.assign(base(Number(s)),{diaper_type:d.diapers[s]});}),
    baby_sleep:paperSleeps(d.sleep).map(function(s){return Object.assign(base(s.start),{sleep_start:stamp(s.start),sleep_end:stamp(s.end),duration_mins:(s.end-s.start)*30});})
  };
}
async function paperSave(button){
  if(paperBusy||paperDay().saved)return;
  var d=paperDay();
  try{
    var rows=d.pending||paperRows(d,paperState.date);
    if(!Object.values(rows).some(function(a){return a.length;})){toast('Mark at least one entry on this paper.');return;}
    paperBusy=true;paperRender();
    if(!d.pending){
      // Warn about all existing care logs, including entries made through the older form.
      var start=new Date(paperState.date+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
      var existing=await Promise.all(Object.keys(rows).map(function(table){return sbFetch('/rest/v1/'+table+'?logged_at=gte.'+start.toISOString()+'&logged_at=lt.'+end.toISOString()+'&select=id&limit=1');}));
      if(existing.some(function(a){return a.length;})&&!await FamilyPalUI.confirm('There are already care logs on '+paperState.date+'. Check that this paper has not been entered before. Add these entries as well?',{title:'Existing entries for this date',confirmLabel:'Add paper'}))return;
      d.pending=rows;if(!paperStore()){delete d.pending;throw new Error('Allow browser storage before saving, so retries cannot duplicate entries.');}
    }
    await FamilyPalUI.runBusy(button,'Saving paper…',async function(){
      for(var table of Object.keys(d.pending)){
        if(d.pending[table].length)await sbFetch('/rest/v1/'+table+'?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(d.pending[table])});
      }
    });
    d.saved=true;delete d.pending;if(paperState.saved.indexOf(paperState.date)<0)paperState.saved.push(paperState.date);paperStore();
    toast('School paper saved');paperBusy=false;paperNext();
    if(activeTab==='today')loadToday();if(activeTab==='history')loadHistory();
  }catch(e){document.getElementById('paper-status').textContent='Could not save: '+e.message;toast('Could not save: '+e.message);}
  finally{paperBusy=false;var message=document.getElementById('paper-status').textContent;paperRender();if(message.indexOf('Could not save:')===0)document.getElementById('paper-status').textContent=message+' Retry will not duplicate this paper.';}
}
