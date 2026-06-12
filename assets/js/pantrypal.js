window.onload=()=>{if(!FamilyPal.requireAuth())return;document.getElementById('app-screen').style.display='flex';loadAll();loadOfflineQueue();syncOfflineQueue();};
function esc(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function expiryStatus(ds){if(!ds)return null;const diff=Math.ceil((new Date(ds)-new Date())/(864e5));return diff<0?'expired':diff<=7?'expiring':'ok';}
function expiryLabel(ds){if(!ds)return'';const diff=Math.ceil((new Date(ds)-new Date())/(864e5));if(diff<0)return`Expired ${Math.abs(diff)}d ago`;if(diff===0)return'Expires today!';if(diff<=7)return`Expires in ${diff}d`;return new Date(ds).toLocaleDateString();}
function isLow(item){const s=item.qty_stocked||0,o=item.qty_open||0,m=item.min_stock||0;if(m>0)return s<m;return s===1&&o===0;}
function calcStatus(item){const s=item.qty_stocked||0,o=item.qty_open||0;if(s===0&&o===0)return'empty';if(isLow(item))return'low';if(s>0)return'stocked';return'open';}
function catName(id){const c=categories.find(c=>c.id===id);return c?c.emoji+' '+c.name:'';}

let items=[],categories=[],currentFilter='all',groupByCategory=false;
async function loadAll(){
  try{[items,categories]=await Promise.all([sbFetch('/rest/v1/items?order=name.asc&select=*'),sbFetch('/rest/v1/categories?order=name.asc&select=*')]);populateCategorySelect();renderItems();}
  catch(e){toast('Error loading: '+e.message);}
}
function populateCategorySelect(){const sel=document.getElementById('item-category-id');sel.innerHTML='<option value="">— No category —</option>';categories.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.emoji+' '+c.name;sel.appendChild(o);});}

function toggleCatSort(){
  groupByCategory=!groupByCategory;
  const btn=document.getElementById('cat-sort-btn');
  btn.classList.toggle('active',groupByCategory);
  renderItems();
}

function renderItems(){
  const q=document.getElementById('search-input').value.toLowerCase();
  const filtered=items.filter(i=>{const match=!q||i.name.toLowerCase().includes(q)||(i.brand||'').toLowerCase().includes(q);const st=calcStatus(i),es=expiryStatus(i.expiry_date);if(!match)return false;if(currentFilter==='all')return true;if(currentFilter==='expiring')return es==='expiring'||es==='expired';if(currentFilter==='priority')return i.priority;if(currentFilter==='low')return st==='low';return st===currentFilter;});
  document.getElementById('stat-stocked').textContent=items.filter(i=>calcStatus(i)==='stocked').length;
  document.getElementById('stat-low').textContent=items.filter(i=>calcStatus(i)==='low').length;
  document.getElementById('stat-open').textContent=items.filter(i=>calcStatus(i)==='open').length;
  document.getElementById('stat-empty').textContent=items.filter(i=>calcStatus(i)==='empty').length;
  document.getElementById('stat-total').textContent=items.length;
  const grid=document.getElementById('items-grid');
  if(!filtered.length){grid.innerHTML=`<div class="empty-state"><div class="big">🥫</div><div>No items found</div><div style="font-size:12px;margin-top:6px">Tap + to add your first item</div></div>`;return;}

  const renderCard=item=>{
    const st=calcStatus(item),es=expiryStatus(item.expiry_date),cat=catName(item.category_id);
    const uom=item.unit_of_measure?`<span class="badge badge-cat">${item.unit_of_measure}</span>`:'';
    const ratingBadge=item.rating==='love'?`<span class="badge badge-love">❤️ Love</span>`:item.rating==='hate'?`<span class="badge badge-hate">😬 Don't buy</span>`:'';
    const badges=[item.priority?`<span class="badge badge-priority">⭐</span>`:'',es==='expiring'?`<span class="badge badge-expiring">⚠️ ${expiryLabel(item.expiry_date)}</span>`:'',es==='expired'?`<span class="badge badge-expired">🔴 Expired</span>`:'',cat&&!groupByCategory?`<span class="badge badge-cat">${cat}</span>`:'',uom,ratingBadge].filter(Boolean).join('');
    return`<div class="item-card ${st}" onclick="openDetailModal('${item.id}')">
      <div class="item-emoji">${item.emoji||'🥫'}</div>
      <div class="item-name">${esc(item.name)}</div>
      <div class="item-brand">${esc(item.brand||'')}</div>
      <div class="item-counts"><span class="count-pill count-stocked">📦 ${item.qty_stocked||0}</span><span class="count-pill count-open">🔓 ${item.qty_open||0}</span></div>
      ${badges?`<div class="item-badges">${badges}</div>`:''}
      <div class="quick-actions" onclick="event.stopPropagation()">
        <button class="qa-btn" onclick="quickAction('${item.id}','bought')">+1 📦</button>
        <button class="qa-btn" onclick="quickAction('${item.id}','openone')">🔓 Open</button>
        <button class="qa-btn" onclick="quickAction('${item.id}','finished')">✅ Done</button>
      </div>
    </div>`;
  };

  if(groupByCategory){
    // group by category
    const grouped={};
    filtered.forEach(item=>{
      const key=item.category_id||'__none__';
      if(!grouped[key])grouped[key]=[];
      grouped[key].push(item);
    });
    // sort: categories first, uncategorised last
    const keys=Object.keys(grouped).sort((a,b)=>{
      if(a==='__none__')return 1;if(b==='__none__')return-1;
      const ca=categories.find(c=>c.id===a),cb=categories.find(c=>c.id===b);
      return(ca?.name||'').localeCompare(cb?.name||'');
    });
    grid.innerHTML=keys.map(key=>{
      const cat=categories.find(c=>c.id===key);
      const heading=cat?`${cat.emoji} ${cat.name}`:'📦 Uncategorised';
      return`<div class="cat-group-header">${heading} (${grouped[key].length})</div>${grouped[key].map(renderCard).join('')}`;
    }).join('');
  }else{
    grid.innerHTML=filtered.map(renderCard).join('');
  }
}

function setFilter(f,btn){currentFilter=f;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderItems();}

async function quickAction(id,action){
  const item=items.find(i=>i.id===id);if(!item)return;
  let s=item.qty_stocked||0,o=item.qty_open||0,note='';
  if(action==='bought'){s++;note='Bought 1 more';}
  else if(action==='openone'){if(s<1){toast('No sealed stock!');return;}s--;o++;note='Opened one';}
  else if(action==='finished'){if(o<1){toast('Nothing open!');return;}o--;note='Finished one';}
  const update={qty_stocked:s,qty_open:o,updated_at:new Date().toISOString()};
  try{await sbFetch(`/rest/v1/items?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(update)});await sbFetch('/rest/v1/history',{method:'POST',body:JSON.stringify({item_id:id,action:note})});Object.assign(item,update);renderItems();toast(note);}
  catch(e){toast('Error: '+e.message);}
}

let editingId=null,formQty={stocked:1,open:0,min:0};
function stepQty(t,d){formQty[t]=Math.max(0,(formQty[t]||0)+d);document.getElementById('val-'+t).textContent=formQty[t];}

function selectRating(r,btn){document.getElementById('item-rating').value=r;document.querySelectorAll('[data-r]').forEach(b=>{b.className='rating-opt';});btn.className=`rating-opt selected-${r}`;}

function openAddModal(prefill={}){
  editingId=null;
  document.getElementById('item-modal-title').textContent='Add Item';
  document.getElementById('item-name').value=prefill.name||'';
  document.getElementById('item-brand').value=prefill.brand||'';
  document.getElementById('item-category-id').value='';
  document.getElementById('item-expiry').value='';
  document.getElementById('item-priority').checked=false;
  document.getElementById('item-barcode').value=prefill.barcode||'';
  document.getElementById('item-uom').value='';
  selectRating('unsure',document.querySelector('[data-r="unsure"]'));
  formQty={stocked:1,open:0,min:0};
  ['stocked','open','min'].forEach(t=>document.getElementById('val-'+t).textContent=formQty[t]);
  document.getElementById('item-save-btn').textContent='Add to Pantry';
  document.getElementById('item-delete-btn').style.display='none';
  document.getElementById('item-modal').style.display='flex';
}

function openEditModal(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  editingId=id;
  document.getElementById('item-modal-title').textContent='Edit Item';
  document.getElementById('item-name').value=item.name;
  document.getElementById('item-brand').value=item.brand||'';
  document.getElementById('item-category-id').value=item.category_id||'';
  document.getElementById('item-expiry').value=item.expiry_date||'';
  document.getElementById('item-priority').checked=!!item.priority;
  document.getElementById('item-barcode').value=item.barcode||'';
  document.getElementById('item-uom').value=item.unit_of_measure||'';
  selectRating(item.rating||'unsure',document.querySelector(`[data-r="${item.rating||'unsure'}"]`));
  formQty={stocked:item.qty_stocked||0,open:item.qty_open||0,min:item.min_stock||0};
  ['stocked','open','min'].forEach(t=>document.getElementById('val-'+t).textContent=formQty[t]);
  document.getElementById('item-save-btn').textContent='Save Changes';
  document.getElementById('item-delete-btn').style.display='block';
  closeModal('detail-modal');document.getElementById('item-modal').style.display='flex';
}

async function saveItem(){
  const name=document.getElementById('item-name').value.trim();if(!name){toast('Name is required');return;}
  const brand=document.getElementById('item-brand').value.trim();
  const catId=document.getElementById('item-category-id').value||null;
  const expiry=document.getElementById('item-expiry').value||null;
  const priority=document.getElementById('item-priority').checked;
  const barcode=document.getElementById('item-barcode').value;
  const uom=document.getElementById('item-uom').value||null;
  const rating=document.getElementById('item-rating').value||'unsure';
  const cat=categories.find(c=>c.id===catId);
  const emoji=cat?cat.emoji:guessEmoji(name);
  const payload={name,brand,category_id:catId,expiry_date:expiry,priority,barcode,emoji,unit_of_measure:uom,rating,qty_stocked:formQty.stocked,qty_open:formQty.open,min_stock:formQty.min,updated_at:new Date().toISOString()};
  try{
    if(editingId){await sbFetch(`/rest/v1/items?id=eq.${editingId}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});await sbFetch('/rest/v1/history',{method:'POST',body:JSON.stringify({item_id:editingId,action:'Item edited'})});toast('Updated ✓');}
    else{const res=await sbFetch('/rest/v1/items',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});const ni=Array.isArray(res)?res[0]:res;await sbFetch('/rest/v1/history',{method:'POST',body:JSON.stringify({item_id:ni.id,action:'Item added'})});toast('Added ✓');}
    closeModal('item-modal');await loadAll();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteItem(){
  if(!editingId||!confirm('Delete this item?'))return;
  try{await sbFetch(`/rest/v1/items?id=eq.${editingId}`,{method:'DELETE'});items=items.filter(i=>i.id!==editingId);closeModal('item-modal');renderItems();toast('Deleted');}
  catch(e){toast('Error: '+e.message);}
}

function guessEmoji(n=''){const M={milk:'🥛',cheese:'🧀',egg:'🥚',bread:'🍞',pasta:'🍝',macaroni:'🍝',penne:'🍝',rice:'🍚',flour:'🌾',oat:'🥣',sauce:'🍶',sause:'🍶',spice:'🧂',salt:'🧂',sugar:'🍬',cocoa:'☕',chocolate:'🍫',coffee:'☕',tea:'🍵',drink:'🥤',juice:'🍊',oil:'🫙',stock:'🍲',soup:'🍲',snack:'🍪',chips:'🍟',vitamin:'💊',wine:'🍷',meat:'🥩',fish:'🐟',frozen:'🧊',curry:'🧂',pepper:'🧂'};const s=n.toLowerCase();for(const[k,v]of Object.entries(M))if(s.includes(k))return v;return'🥫';}

async function openDetailModal(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  document.getElementById('detail-name').textContent=`${item.emoji||'🥫'} ${item.name}`;
  document.getElementById('detail-content').innerHTML=`<div class="loading-screen"><span class="spinner"></span></div>`;
  document.getElementById('detail-modal').style.display='flex';
  try{
    const hist=await sbFetch(`/rest/v1/history?item_id=eq.${id}&order=created_at.desc&limit=30`);
    const s=item.qty_stocked||0,o=item.qty_open||0,es=expiryStatus(item.expiry_date),cat=catName(item.category_id);
    const ac=a=>{if(a.includes('Bought'))return'var(--green)';if(a.includes('Opened'))return'var(--yellow)';if(a.includes('Finished'))return'var(--accent2)';return'var(--muted)';};
    document.getElementById('detail-content').innerHTML=`
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span class="count-pill count-stocked" style="font-size:13px;padding:4px 12px">📦 ${s} sealed</span>
        <span class="count-pill count-open" style="font-size:13px;padding:4px 12px">🔓 ${o} open</span>
        ${cat?`<span class="badge badge-cat">${cat}</span>`:''}
        ${item.unit_of_measure?`<span class="badge badge-cat">${item.unit_of_measure}</span>`:''}
        ${item.priority?`<span class="badge badge-priority">⭐ Priority</span>`:''}
        ${es==='expiring'?`<span class="badge badge-expiring">⚠️ ${expiryLabel(item.expiry_date)}</span>`:''}
        ${es==='expired'?`<span class="badge badge-expired">🔴 ${expiryLabel(item.expiry_date)}</span>`:''}
      </div>
      <div class="action-grid">
        <button class="action-btn green" onclick="quickAction('${id}','bought');closeModal('detail-modal')">+1 📦<br><small>Bought more</small></button>
        <button class="action-btn yellow" onclick="quickAction('${id}','openone');closeModal('detail-modal')">🔓 Open one<br><small>Sealed → Open</small></button>
        <button class="action-btn red" onclick="quickAction('${id}','finished');closeModal('detail-modal')">✅ Finished one<br><small>Remove from open</small></button>
        <button class="action-btn" onclick="openEditModal('${id}')">✏️ Edit<br><small>Adjust / settings</small></button>
      </div>
      <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:16px 0 8px">History (${hist.length})</div>
      <div class="history-list">${hist.length?hist.map(h=>`<div class="history-item"><div class="history-dot" style="background:${ac(h.action||'')}"></div><div><div>${esc(h.action||'')}${h.price?` <span style="color:var(--green);font-size:11px">R${parseFloat(h.price).toFixed(2)}</span>`:''}</div><div class="history-time">${new Date(h.created_at).toLocaleString()}</div></div></div>`).join(''):'<div style="color:var(--muted);font-size:13px;padding:8px 0">No history yet.</div>'}</div>`;
  }catch(e){document.getElementById('detail-content').innerHTML=`<div style="color:var(--red)">Error: ${e.message}</div>`;}
}

function openInventoryModal(){document.getElementById('inventory-modal').style.display='flex';renderInventory();}
function renderInventory(){const q=(document.getElementById('inv-search').value||'').toLowerCase();const filtered=items.filter(i=>!q||i.name.toLowerCase().includes(q));const el=document.getElementById('inventory-list');el.innerHTML=filtered.map(item=>`<div class="inv-item"><div class="inv-emoji">${item.emoji||'🥫'}</div><div class="inv-info"><div class="inv-name">${esc(item.name)}</div><div class="inv-cat">${catName(item.category_id)||''}</div></div><div class="inv-controls"><button onclick="invAdj('${item.id}',-1)">−</button><span id="inv-s-${item.id}">${item.qty_stocked||0}</span><button onclick="invAdj('${item.id}',1)">+</button><button class="inv-open-btn ${(item.qty_open||0)>0?'active':''}" onclick="invToggleOpen('${item.id}')">${(item.qty_open||0)>0?'🔓 '+item.qty_open:'🔒'}</button></div></div>`).join('');}
async function invAdj(id,delta){const item=items.find(i=>i.id===id);if(!item)return;const newQty=Math.max(0,(item.qty_stocked||0)+delta);try{await sbFetch(`/rest/v1/items?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({qty_stocked:newQty,updated_at:new Date().toISOString()})});item.qty_stocked=newQty;const el=document.getElementById(`inv-s-${id}`);if(el)el.textContent=newQty;renderItems();}catch(e){toast('Error: '+e.message);}}
async function invToggleOpen(id){const item=items.find(i=>i.id===id);if(!item)return;const newOpen=(item.qty_open||0)>0?0:1;try{await sbFetch(`/rest/v1/items?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({qty_open:newOpen,updated_at:new Date().toISOString()})});item.qty_open=newOpen;renderInventory();renderItems();}catch(e){toast('Error: '+e.message);}}

function openPriorityModal(){document.getElementById('priority-modal').style.display='flex';renderPriorityList();}
function renderPriorityList(){const q=(document.getElementById('pri-search').value||'').toLowerCase();const filtered=items.filter(i=>!q||i.name.toLowerCase().includes(q));document.getElementById('priority-list').innerHTML=filtered.map(item=>`<div class="pri-item"><div style="font-size:20px">${item.emoji||'🥫'}</div><div style="flex:1"><div style="font-size:14px">${esc(item.name)}</div><div style="font-size:11px;color:var(--muted)">${catName(item.category_id)||''}</div></div><label class="toggle"><input type="checkbox" ${item.priority?'checked':''} onchange="togglePriority('${item.id}',this.checked)"><span class="toggle-slider"></span></label></div>`).join('');}
async function togglePriority(id,val){const item=items.find(i=>i.id===id);if(!item)return;try{await sbFetch(`/rest/v1/items?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({priority:val})});item.priority=val;renderItems();toast(val?`⭐ ${item.name} priority`:`${item.name} removed`);}catch(e){toast('Error: '+e.message);}}

function openCatModal(){document.getElementById('cat-modal').style.display='flex';renderCatList();}
function renderCatList(){const el=document.getElementById('cat-list');if(!categories.length){el.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">No categories yet</div>';return;}el.innerHTML=categories.map(c=>`<div class="cat-item"><span style="font-size:20px">${c.emoji}</span><span>${esc(c.name)}</span><button class="cat-del" onclick="deleteCategory('${c.id}')">🗑</button></div>`).join('');}
async function addCategory(){const name=document.getElementById('new-cat-name').value.trim(),emoji=document.getElementById('new-cat-emoji').value.trim()||'📦';if(!name){toast('Enter a name');return;}try{const res=await sbFetch('/rest/v1/categories',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({name,emoji})});const nc=Array.isArray(res)?res[0]:res;categories.push(nc);categories.sort((a,b)=>a.name.localeCompare(b.name));document.getElementById('new-cat-name').value='';document.getElementById('new-cat-emoji').value='';populateCategorySelect();renderCatList();toast('Category added ✓');}catch(e){toast('Error: '+e.message);}}
async function deleteCategory(id){if(!confirm('Delete this category?'))return;try{await sbFetch(`/rest/v1/categories?id=eq.${id}`,{method:'DELETE'});categories=categories.filter(c=>c.id!==id);items.forEach(i=>{if(i.category_id===id)i.category_id=null;});populateCategorySelect();renderCatList();renderItems();toast('Deleted');}catch(e){toast('Error: '+e.message);}}

// Shopping mode
let shopTicked={},pendingScan=null,pendingUnknownBarcode=null,offlineQueue=[],unknownScans=[],shopScannerRunning=false;
function loadOfflineQueue(){try{offlineQueue=JSON.parse(localStorage.getItem('pp_queue')||'[]');}catch(e){offlineQueue=[];}try{unknownScans=JSON.parse(localStorage.getItem('pp_unknown')||'[]');}catch(e){unknownScans=[];}try{shopTicked=JSON.parse(localStorage.getItem('pp_ticked')||'{}');}catch(e){shopTicked={};}}
function saveOfflineQueue(){localStorage.setItem('pp_queue',JSON.stringify(offlineQueue));}
function saveUnknownScans(){localStorage.setItem('pp_unknown',JSON.stringify(unknownScans));}
async function syncOfflineQueue(){if(!offlineQueue.length)return;const toSync=[...offlineQueue];for(const op of toSync){try{const item=items.find(i=>i.id===op.item_id);if(item){await sbFetch(`/rest/v1/items?id=eq.${op.item_id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({qty_stocked:op.new_qty,updated_at:new Date().toISOString()})});await sbFetch('/rest/v1/history',{method:'POST',body:JSON.stringify({item_id:op.item_id,action:'Bought 1 more (shop)',price:op.price||null})});item.qty_stocked=op.new_qty;}offlineQueue=offlineQueue.filter(q=>q!==op);}catch(e){}}saveOfflineQueue();updateSyncBanner();}
function updateSyncBanner(){const b=document.getElementById('sync-banner');if(offlineQueue.length>0){b.style.display='block';document.getElementById('sync-count').textContent=offlineQueue.length;}else{b.style.display='none';}}
function buildShopItems(){const list=[];items.forEach(item=>{const st=calcStatus(item);const isEmpty=st==='empty',isLowItem=st==='low';if(!isEmpty&&!isLowItem&&!item.priority)return;const tag=isEmpty?'buy-now':isLowItem?'buy-soon':'priority-tag';const label=isEmpty?'BUY NOW':isLowItem?'BUY SOON':'PRIORITY';list.push({item,tag,label,isPriority:!!item.priority});});return list;}
function openShoppingMode(){document.getElementById('shop-modal').style.display='flex';updateSyncBanner();renderUnknownList();renderShopList();}
function renderShopList(){const all=buildShopItems();const priority=all.filter(x=>x.isPriority),other=all.filter(x=>!x.isPriority);const renderItem=({item,tag,label})=>{const ticked=!!shopTicked[item.id];return`<div class="shop-list-item ${ticked?'ticked':''}" onclick="tickShopItem('${item.id}')"><div class="shop-tick">${ticked?'✓':''}</div><div class="shop-item-emoji">${item.emoji||'🥫'}</div><div class="shop-item-info"><div class="shop-item-name">${esc(item.name)}</div><div class="shop-item-brand">${esc(item.brand||'')}${catName(item.category_id)?' · '+catName(item.category_id):''}</div></div><span class="shop-tag ${tag}">${label}</span></div>`;};let html='';if(priority.length)html+=`<div class="shop-section-title">⭐ Priority (${priority.length})</div>${priority.map(renderItem).join('')}`;if(other.length)html+=`<div class="shop-section-title">📋 Also Needed (${other.length})</div>${other.map(renderItem).join('')}`;if(!priority.length&&!other.length)html=`<div style="text-align:center;padding:40px;color:var(--muted)">🎉 Nothing to buy!</div>`;document.getElementById('shop-list-content').innerHTML=html;}
function tickShopItem(id){shopTicked[id]=!shopTicked[id];localStorage.setItem('pp_ticked',JSON.stringify(shopTicked));renderShopList();}
function shareWhatsApp(){const all=buildShopItems();if(!all.length){toast('Nothing to buy!');return;}let msg='🛒 *PantryPal Shopping List*\n\n';const p=all.filter(x=>x.isPriority),o=all.filter(x=>!x.isPriority);if(p.length){msg+='⭐ *Priority*\n';p.forEach(({item})=>{msg+=`${shopTicked[item.id]?'✅':'☐'} ${item.emoji||''} ${item.name}\n`;});}if(o.length){msg+='\n📋 *Also Needed*\n';o.forEach(({item})=>{msg+=`${shopTicked[item.id]?'✅':'☐'} ${item.emoji||''} ${item.name}\n`;});}window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');}
function startShopScan(){document.getElementById('shop-scanner-wrap').style.display='block';if(shopScannerRunning)return;Quagga.init({inputStream:{type:'LiveStream',target:document.getElementById('shop-interactive'),constraints:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}},decoder:{readers:['ean_reader','ean_8_reader','upc_reader','upc_e_reader','code_128_reader']},locate:true},err=>{if(err){document.getElementById('shop-scan-status').textContent='Camera error: '+err;return;}Quagga.start();shopScannerRunning=true;document.getElementById('shop-scan-status').textContent='Point camera at a barcode…';const sc=document.getElementById('shop-scanner-container');if(!sc.querySelector('.scan-overlay'))sc.innerHTML+=`<div class="scan-overlay"><div class="scan-box"></div></div>`;});let lastCode='',lastTime=0;Quagga.onDetected(r=>{const code=r.codeResult.code,now=Date.now();if(code===lastCode&&now-lastTime<2000)return;lastCode=code;lastTime=now;stopShopScanner();handleShopScan(code);});}
function stopShopScanner(){if(!shopScannerRunning)return;Quagga.stop();shopScannerRunning=false;document.getElementById('shop-interactive').innerHTML='';document.getElementById('shop-scanner-wrap').style.display='none';}
function handleShopScan(code){const item=items.find(i=>i.barcode===code);if(item){pendingScan={item,code};document.getElementById('confirm-title').textContent='Add to pantry?';document.getElementById('confirm-sub').textContent=`${item.emoji||'🥫'} ${item.name} — add 1 to your stock?`;document.getElementById('confirm-price').value='';document.getElementById('confirm-popup').style.display='flex';}else{pendingUnknownBarcode=code;document.getElementById('unknown-name-input').value='';document.getElementById('unknown-popup').style.display='flex';}}
async function confirmScan(){if(!pendingScan)return;const{item}=pendingScan;const price=parseFloat(document.getElementById('confirm-price').value)||null;document.getElementById('confirm-popup').style.display='none';const newQty=(item.qty_stocked||0)+1;shopTicked[item.id]=true;localStorage.setItem('pp_ticked',JSON.stringify(shopTicked));if(navigator.onLine){try{await sbFetch(`/rest/v1/items?id=eq.${item.id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({qty_stocked:newQty,updated_at:new Date().toISOString()})});await sbFetch('/rest/v1/history',{method:'POST',body:JSON.stringify({item_id:item.id,action:'Bought 1 more (shop)',price})});item.qty_stocked=newQty;toast(`✅ ${item.name} +1`);}catch(e){queueScan(item,newQty,price);}}else{queueScan(item,newQty,price);}renderItems();renderShopList();updateSyncBanner();pendingScan=null;}
function queueScan(item,newQty,price){offlineQueue.push({item_id:item.id,new_qty:newQty,price,queued_at:new Date().toISOString()});saveOfflineQueue();item.qty_stocked=newQty;toast(`📦 ${item.name} +1 (queued)`);}
function cancelScan(){document.getElementById('confirm-popup').style.display='none';pendingScan=null;}
function saveUnknown(){const name=document.getElementById('unknown-name-input').value.trim();unknownScans.push({barcode:pendingUnknownBarcode,name:name||'Unknown',scanned_at:new Date().toISOString()});saveUnknownScans();document.getElementById('unknown-popup').style.display='none';pendingUnknownBarcode=null;renderUnknownList();toast(name?`Saved: ${name}`:'Barcode saved');}
function skipUnknown(){document.getElementById('unknown-popup').style.display='none';pendingUnknownBarcode=null;toast('Skipped');}
function renderUnknownList(){const wrap=document.getElementById('unknown-wrap'),el=document.getElementById('unknown-list');if(!unknownScans.length){wrap.style.display='none';return;}wrap.style.display='block';el.innerHTML=unknownScans.map((u,i)=>`<div class="unknown-item"><div class="unknown-item-info"><div class="unknown-item-name">${esc(u.name||'Unknown')}</div><div class="unknown-item-sub">Barcode: ${u.barcode} · ${new Date(u.scanned_at).toLocaleString()}</div></div><button class="unknown-add-btn" onclick="addUnknownToInventory(${i})">+ Add</button></div>`).join('');}
function addUnknownToInventory(idx){const u=unknownScans[idx];unknownScans.splice(idx,1);saveUnknownScans();closeModal('shop-modal');openAddModal({name:u.name!=='Unknown'?u.name:'',barcode:u.barcode});renderUnknownList();}
function printShoppingList(){const all=buildShopItems();const p=all.filter(x=>x.isPriority),o=all.filter(x=>!x.isPriority);const rows=list=>list.map(({item,label})=>`<div class="print-item"><span>${item.emoji||''} ${item.name}${item.brand?' ('+item.brand+')':''}</span><strong>${label}</strong></div>`).join('');document.getElementById('print-area').innerHTML=`<h1 style="font-size:20px;margin-bottom:16px">🛒 PantryPal Shopping List — ${new Date().toLocaleDateString()}</h1>${p.length?`<div class="print-section"><h3>⭐ Priority</h3>${rows(p)}</div>`:''}${o.length?`<div class="print-section"><h3>📋 Also Needed</h3>${rows(o)}</div>`:''}`;window.print();}

// ── Table View ────────────────────────────────────────────
function openTableView(){
  document.getElementById('table-modal').style.display='flex';
  renderTableView();
}

function renderTableView(){
  const el=document.getElementById('table-content');
  if(!items.length){el.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">No items yet</div>';return;}
  const sorted=[...items].sort((a,b)=>a.name.localeCompare(b.name));
  el.innerHTML=`<table>
    <thead><tr>
      <th></th><th>Name</th><th>Brand</th><th>Category</th>
      <th>UoM</th><th>📦</th><th>🔓</th><th>Min</th>
      <th>Rating</th><th>Priority</th><th>Expiry</th><th></th>
    </tr></thead>
    <tbody>${sorted.map(item=>{
      const st=calcStatus(item);
      const dotClass={stocked:'dot-stocked',low:'dot-low',open:'dot-open',empty:'dot-empty'}[st]||'dot-empty';
      const catOptions=`<option value="">—</option>`+categories.map(c=>`<option value="${c.id}" ${item.category_id===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('');
      const uomOptions=`<option value="">—</option>${['Bottle','Jar','Box','Bag','Can','Packet','Tin','Carton','Tube','Each'].map(u=>`<option value="${u}" ${item.unit_of_measure===u?'selected':''}>${u}</option>`).join('')}`;
      const ratingOptions=`<option value="unsure" ${item.rating==='unsure'?'selected':''}>😐 Unsure</option><option value="love" ${item.rating==='love'?'selected':''}>❤️ Love</option><option value="hate" ${item.rating==='hate'?'selected':''}>😬 Don't buy</option>`;
      return`<tr id="trow-${item.id}">
        <td><span class="status-dot ${dotClass}"></span></td>
        <td><input class="td-input" id="t-name-${item.id}" value="${esc(item.name)}" style="min-width:120px"></td>
        <td><input class="td-input" id="t-brand-${item.id}" value="${esc(item.brand||'')}" style="min-width:80px"></td>
        <td><select class="td-select" id="t-cat-${item.id}">${catOptions}</select></td>
        <td><select class="td-select" id="t-uom-${item.id}">${uomOptions}</select></td>
        <td><input class="td-input td-num" type="number" id="t-stocked-${item.id}" value="${item.qty_stocked||0}" min="0"></td>
        <td><input class="td-input td-num" type="number" id="t-open-${item.id}" value="${item.qty_open||0}" min="0"></td>
        <td><input class="td-input td-num" type="number" id="t-min-${item.id}" value="${item.min_stock||0}" min="0"></td>
        <td><select class="td-select" id="t-rating-${item.id}">${ratingOptions}</select></td>
        <td style="text-align:center"><input type="checkbox" id="t-pri-${item.id}" ${item.priority?'checked':''}></td>
        <td><input class="td-input" type="date" id="t-exp-${item.id}" value="${item.expiry_date||''}" style="min-width:120px"></td>
        <td><button class="td-save" onclick="saveTableRow('${item.id}')">Save</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function saveTableRow(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  const payload={
    name:document.getElementById(`t-name-${id}`).value.trim()||item.name,
    brand:document.getElementById(`t-brand-${id}`).value.trim(),
    category_id:document.getElementById(`t-cat-${id}`).value||null,
    unit_of_measure:document.getElementById(`t-uom-${id}`).value||null,
    qty_stocked:parseInt(document.getElementById(`t-stocked-${id}`).value)||0,
    qty_open:parseInt(document.getElementById(`t-open-${id}`).value)||0,
    min_stock:parseInt(document.getElementById(`t-min-${id}`).value)||0,
    rating:document.getElementById(`t-rating-${id}`).value,
    priority:document.getElementById(`t-pri-${id}`).checked,
    expiry_date:document.getElementById(`t-exp-${id}`).value||null,
    updated_at:new Date().toISOString()
  };
  try{
    await sbFetch(`/rest/v1/items?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});
    Object.assign(item,payload);
    renderItems();
    // flash the row green briefly
    const row=document.getElementById(`trow-${id}`);
    if(row){row.style.background='rgba(46,204,113,.15)';setTimeout(()=>row.style.background='',1000);}
    toast(`✓ ${payload.name} saved`);
  }catch(e){toast('Error: '+e.message);}
}
function openScanModal(){document.getElementById('scan-modal').style.display='flex';setTimeout(startScanner,300);}
function startScanner(){if(scannerRunning)return;Quagga.init({inputStream:{type:'LiveStream',target:document.getElementById('interactive'),constraints:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}},decoder:{readers:['ean_reader','ean_8_reader','upc_reader','upc_e_reader','code_128_reader']},locate:true},err=>{if(err){document.getElementById('scan-status').textContent='Camera error: '+err;return;}Quagga.start();scannerRunning=true;const sc=document.getElementById('scanner-container');if(!sc.querySelector('.scan-overlay'))sc.innerHTML+=`<div class="scan-overlay"><div class="scan-box"></div></div>`;});let lastCode='',lastTime=0;Quagga.onDetected(r=>{const code=r.codeResult.code,now=Date.now();if(code===lastCode&&now-lastTime<2000)return;lastCode=code;lastTime=now;stopScanner();closeModal('scan-modal');lookupBarcode(code);});}
function stopScanner(){if(!scannerRunning)return;Quagga.stop();scannerRunning=false;document.getElementById('interactive').innerHTML='';}
async function lookupBarcode(code){
  toast('🔍 Looking up barcode…');
  // First check if barcode already exists in our own pantry
  const existing=items.find(i=>i.barcode===code);
  if(existing){
    toast(`Found in pantry: ${existing.name}`);
    openAddModal({name:existing.name,brand:existing.brand||'',barcode:code});
    return;
  }
  // Try Open Food Facts
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,generic_name,brands,categories_tags`,{signal:controller.signal});
    clearTimeout(timeout);
    if(r.ok){
      const d=await r.json();
      if(d.status===1&&d.product){
        const p=d.product;
        const name=(p.product_name||p.generic_name||'').trim();
        const brand=(p.brands||'').split(',')[0].trim();
        if(name){
          openAddModal({name,brand,barcode:code});
          toast(`✅ Found: ${name}`);
          return;
        }
      }
    }
  }catch(e){
    // network error or timeout — fall through
  }
  // Not found anywhere — open form with barcode pre-filled so it gets saved
  openAddModal({barcode:code});
  toast('Barcode not found — enter details to save it');
}

function closeModal(id){document.getElementById(id).style.display='none';if(id==='scan-modal')stopScanner();if(id==='shop-modal')stopShopScanner();}
function closeItemModal(e){if(e.target===e.currentTarget)closeModal(e.currentTarget.id);}
let toastTimer;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2500);}
window.addEventListener('online',()=>{syncOfflineQueue();toast('Back online — syncing…');});
