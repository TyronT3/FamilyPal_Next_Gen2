function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
var settingsPantryItems=[];

async function loadSettingsPage(){
  document.getElementById('settings-screen').style.display='flex';
  document.getElementById('account-email').textContent=FamilyPal.getEmail()||'';
  syncThemeButtons();
  await Promise.all([loadHouseholdSettings(),loadConnectedInventory(),loadPrivacySettings()]);
}

async function loadHouseholdSettings(){
  try{
    var values=await FamilyPal.getSettings(['household_name','baby_name','person_1_name','person_2_name','baby_pronouns']);
    if(values.household_name)document.getElementById('setting-household-name').value=values.household_name;
    if(values.baby_name)document.getElementById('setting-baby-name').value=values.baby_name;
    if(values.person_1_name)document.getElementById('setting-person-1').value=values.person_1_name;
    if(values.person_2_name)document.getElementById('setting-person-2').value=values.person_2_name;
    if(values.baby_pronouns)document.getElementById('setting-baby-pronouns').value=values.baby_pronouns;
  }catch(e){}
}

async function saveHouseholdSettings(button){
  var husbandName=document.getElementById('setting-person-1').value.trim();
  var wifeName=document.getElementById('setting-person-2').value.trim();
  if(!husbandName||!wifeName){toast('Enter both the husband and wife names');return;}
  if(husbandName.toLocaleLowerCase()===wifeName.toLocaleLowerCase()){toast('Use a different name for each partner');return;}
  FamilyPalUI.setBusy(button,true,'Saving…');
  try{
    await Promise.all([
      FamilyPal.setSetting('household_name',document.getElementById('setting-household-name').value.trim()),
      FamilyPal.setSetting('baby_name',document.getElementById('setting-baby-name').value.trim()),
      FamilyPal.setSetting('person_1_name',husbandName),
      FamilyPal.setSetting('person_2_name',wifeName),
      FamilyPal.setSetting('baby_pronouns',document.getElementById('setting-baby-pronouns').value)
    ]);
    await FamilyPalUI.loadProfile(true);
    toast('Household settings saved');
  }catch(e){toast('Could not save household settings: '+e.message);}
  finally{FamilyPalUI.setBusy(button,false);}
}

async function loadPrivacySettings(){
  try{
    var value=await FamilyPal.getSetting('hide_period_details');
    document.getElementById('setting-hide-period').checked=value===null||value===''?true:value==='true';
  }catch(e){}
}

async function savePrivacySettings(button){
  FamilyPalUI.setBusy(button,true,'Saving…');
  try{
    await FamilyPal.setSetting('hide_period_details',String(document.getElementById('setting-hide-period').checked));
    await FamilyPalUI.loadProfile(true);
    toast('Privacy preference saved');
  }catch(e){toast('Could not save privacy preference: '+e.message);}
  finally{FamilyPalUI.setBusy(button,false);}
}

function parseComfortSupplyIds(value){
  try{var ids=JSON.parse(value||'[]');return Array.isArray(ids)?ids.map(String):[];}catch(e){return[];}
}

async function loadConnectedInventory(){
  try{
    var results=await Promise.allSettled([
      FamilyPal.getDiaperItemId(),
      FamilyPal.getSetting('period_comfort_item_ids'),
      sbFetch('/rest/v1/items?order=name.asc&select=id,name,brand,qty_stocked,qty_open,min_stock')
    ]);
    if(results[2].status!=='fulfilled')throw results[2].reason;
    var current=results[0].status==='fulfilled'?results[0].value:'';
    var selected=parseComfortSupplyIds(results[1].status==='fulfilled'?results[1].value:null);
    settingsPantryItems=results[2].value||[];
    document.getElementById('setting-diaper-item').innerHTML='<option value="">No pantry item selected</option>'+settingsPantryItems.map(function(i){
      return '<option value="'+esc(i.id)+'" '+(i.id===current?'selected':'')+'>'+esc(i.name)+(i.brand?' — '+esc(i.brand):'')+' ('+(i.qty_stocked||0)+' left)</option>';
    }).join('');
    document.getElementById('comfort-supply-list').innerHTML=settingsPantryItems.length?settingsPantryItems.map(function(i){
      var detail=(i.brand?i.brand+' · ':'')+(i.qty_stocked||0)+' sealed'+((i.qty_open||0)?' · '+i.qty_open+' open':'');
      return '<label class="comfort-option"><input type="checkbox" value="'+esc(i.id)+'" '+(selected.indexOf(String(i.id))>=0?'checked':'')+'><span>'+esc(i.name)+'<small>'+esc(detail)+'</small></span></label>';
    }).join(''):'<div class="settings-note">Add items in PantryPal before choosing comfort supplies.</div>';
  }catch(e){toast('Could not load pantry items: '+e.message);}
}

async function saveDiaperSetting(button){
  FamilyPalUI.setBusy(button,true,'Saving…');
  try{
    await FamilyPal.setDiaperItemId(document.getElementById('setting-diaper-item').value);
    toast('Diaper item saved');
  }catch(e){toast('Could not save diaper item: '+e.message);}
  finally{FamilyPalUI.setBusy(button,false);}
}

async function saveComfortSupplies(button){
  var selected=Array.from(document.querySelectorAll('#comfort-supply-list input[type="checkbox"]:checked')).map(function(input){return input.value;});
  FamilyPalUI.setBusy(button,true,'Saving…');
  try{
    await FamilyPal.setSetting('period_comfort_item_ids',JSON.stringify(selected));
    toast(selected.length?selected.length+' comfort suppl'+(selected.length===1?'y':'ies')+' saved':'Comfort supply reminders turned off');
  }catch(e){toast('Could not save comfort supplies: '+e.message);}
  finally{FamilyPalUI.setBusy(button,false);}
}

function chooseTheme(theme){FamilyPalTheme.setTheme(theme);syncThemeButtons();}
function syncThemeButtons(){
  var theme=document.documentElement.getAttribute('data-theme')||'dark';
  document.getElementById('theme-light').classList.toggle('active',theme==='light');
  document.getElementById('theme-dark').classList.toggle('active',theme==='dark');
}

async function signOutConfirm(){
  if(await FamilyPalUI.confirm('You will need your email and password to sign in again.',{title:'Sign out of FamilyPal?',confirmLabel:'Sign out'}))FamilyPal.signOut();
}

var toastTimer;
function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},3000);}

window.onload=async function(){
  if(!await FamilyPal.requireSession())return;
  FamilyPal.startTokenRefresh();
  loadSettingsPage();
};
