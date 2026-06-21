function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

async function loadSettingsPage(){
  document.getElementById('settings-screen').style.display='flex';
  await Promise.all([loadHouseholdSettings(),loadDiaperOptions()]);
}

async function loadHouseholdSettings(){
  var keys=['household_name','baby_name','person_1_name','person_2_name'];
  var ids=['setting-household-name','setting-baby-name','setting-person-1','setting-person-2'];
  for(var i=0;i<keys.length;i++){
    try{
      var val=await FamilyPal.getSetting(keys[i]);
      document.getElementById(ids[i]).value=val||'';
    }catch(e){}
  }
}

async function saveHouseholdSettings(){
  try{
    await Promise.all([
      FamilyPal.setSetting('household_name',document.getElementById('setting-household-name').value.trim()),
      FamilyPal.setSetting('baby_name',document.getElementById('setting-baby-name').value.trim()),
      FamilyPal.setSetting('person_1_name',document.getElementById('setting-person-1').value.trim()),
      FamilyPal.setSetting('person_2_name',document.getElementById('setting-person-2').value.trim())
    ]);
    toast('Household settings saved');
  }catch(e){toast('Error: '+e.message);}
}

async function loadDiaperOptions(){
  try{
    var current=await FamilyPal.getDiaperItemId();
    var items=await sbFetch('/rest/v1/items?order=name.asc&select=id,name,brand,qty_stocked,min_stock');
    document.getElementById('setting-diaper-item').innerHTML='<option value="">No pantry item selected</option>'+items.map(function(i){
      return '<option value="'+esc(i.id)+'" '+(i.id===current?'selected':'')+'>'+esc(i.name)+(i.brand?' - '+esc(i.brand):'')+' ('+(i.qty_stocked||0)+' left)</option>';
    }).join('');
  }catch(e){toast('Could not load pantry items: '+e.message);}
}

async function saveDiaperSetting(){
  try{
    await FamilyPal.setDiaperItemId(document.getElementById('setting-diaper-item').value);
    toast('Diaper item saved');
  }catch(e){toast('Error: '+e.message);}
}

var toastTimer;
function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},2500);}

window.onload=async function(){
  if(!await FamilyPal.requireSession())return;
  loadSettingsPage();
};
