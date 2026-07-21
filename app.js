
function isRecentlyUpdated(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return (Date.now() - d) < 14 * 24 * 60 * 60 * 1000;
}

// ─── ONBOARDING PROGRESS ────────────────────────────────────
function getOnboardProgress(){try{return JSON.parse(localStorage.getItem("wc_onboard")||"[]")}catch{return[]}}
function saveOnboardProgress(arr){localStorage.setItem("wc_onboard",JSON.stringify(arr))}
function toggleOnboardDone(e, id){
  e.stopPropagation();
  const done=getOnboardProgress();
  const idx=done.indexOf(id);
  if(idx>=0)done.splice(idx,1);else done.push(id);
  saveOnboardProgress(done);
  renderAll();
}

// ─── STATE ──────────────────────────────────────────────────
let activeRole="All", activeCat="All";
let wcCheckState = {}; // checklist checked state per card

// ─── CUSTOM CARDS ───────────────────────────────────────────
function getCustomCards(){try{return JSON.parse(localStorage.getItem("wc_custom")||"[]")}catch{return[]}}
function saveCustomCards(arr){localStorage.setItem("wc_custom",JSON.stringify(arr))}
function getAllCards(){return [...BUILTIN,...getCustomCards().map(c=>({...c,isCustom:true}))]}

// ─── DAILY TRACKING ─────────────────────────────────────────
function todayStr(){return new Date().toISOString().slice(0,10)}
function getTodayLog(){try{const d=JSON.parse(localStorage.getItem("wc_today")||"{}");return d.date===todayStr()?(d.log||[]):[]}catch{return[]}}
function trackDailyAccess(id){try{const today=todayStr();const d=JSON.parse(localStorage.getItem("wc_today")||"{}");const log=d.date===today?(d.log||[]):[];const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});log.push({id,time:t});localStorage.setItem("wc_today",JSON.stringify({date:today,log}));}catch{}}

// ─── CLICK TRACKING ─────────────────────────────────────────
function trackClick(id){try{const d=JSON.parse(localStorage.getItem("wc_clicks")||"{}");d[id]=(d[id]||0)+1;localStorage.setItem("wc_clicks",JSON.stringify(d));}catch{}}
function getClicks(){try{return JSON.parse(localStorage.getItem("wc_clicks")||"{}")}catch{return{}}}

function getDynamicPinned(role){
  const clicks=getClicks();const all=getAllCards();
  const roleIds=ROLE_IDS[role];
  const eligible=roleIds?all.filter(c=>roleIds.includes(c.id)||c.roles?.includes(role)):all;
  const sorted=eligible.filter(c=>clicks[c.id]>0).sort((a,b)=>(clicks[b.id]||0)-(clicks[a.id]||0));
  const result=sorted.slice(0,4);
  if(result.length<4){
    const defs=DEFAULT_PINNED[role]||DEFAULT_PINNED["All"];
    const ex=result.map(c=>c.id);
    defs.forEach(id=>{if(!ex.includes(id)&&result.length<4){const c=all.find(x=>x.id===id);if(c)result.push(c);}});
  }
  return result;
}

// ─── ROLE NAV ───────────────────────────────────────────────
function renderRoleTabs(){
  document.getElementById("role-nav").innerHTML=ROLES.map(r=>
    `<button class="role-btn${r.id===activeRole?" active":""}" onclick="setRole('${r.id}')">${r.icon?`<span class="role-btn-icon">${r.icon}</span>`:""}${r.label}</button>`
  ).join("");
}
function setRole(id){
  activeRole=id;activeCat="All";
  document.getElementById("search").value="";
  const isToday=id==="Today";
  const isOnboard=id==="Onboard";
  document.getElementById("qa-wrap").style.display=(isToday||isOnboard)?"none":"";
  document.getElementById("search-wrap").style.display=(isToday||isOnboard)?"none":"";
  // sync bottom nav
  document.querySelectorAll(".bn-item").forEach(el=>el.classList.remove("active"));
  const bn=document.getElementById("bn-"+id);if(bn)bn.classList.add("active");
  renderAll();
}

// ─── QUICK ACCESS ────────────────────────────────────────────
function renderQuickAccess(){
  const cards=getDynamicPinned(activeRole);const clicks=getClicks();
  document.getElementById("qa-grid").innerHTML=cards.map(c=>{
    const cat=CATS[c.cat]||{color:"#555",bg:"#eee",icon:""};
    const cnt=clicks[c.id]||0;
    return `<button class="qa-tile" onclick="openCard(${c.id})">
      <div class="qa-cat" style="color:${cat.color}">${cat.icon} ${c.cat}</div>
      <div class="qa-title">${c.title}</div>
      <div class="qa-footer">
        <span class="qa-cta">Open →</span>
        ${cnt>0?`<span class="qa-heat">🔥 ${cnt}</span>`:""}
      </div>
    </button>`;
  }).join("");
}

// ─── FILTERS ─────────────────────────────────────────────────
function getVisibleCards(){
  const all=getAllCards();const roleIds=ROLE_IDS[activeRole];
  return all.filter(c=>{
    if(c.isCustom){return activeRole==="All"||!c.roles||c.roles.length===0||c.roles.includes(activeRole);}
    return !roleIds||roleIds.includes(c.id);
  });
}
function renderFilters(){
  if(activeRole==="Today"){document.getElementById("filters").innerHTML="";return;}
  const visible=getVisibleCards();
  const cats=["All",...new Set(visible.map(c=>c.cat))];
  document.getElementById("filters").innerHTML=cats.map(cat=>{
    const info=CATS[cat];
    return `<span class="chip${cat===activeCat?" active":""}" onclick="setFilter('${cat}')">${info?info.icon+" ":""}${cat}</span>`;
  }).join("");
}
function setFilter(cat){activeCat=cat;renderFilters();render();}

// ─── CARD GRID ───────────────────────────────────────────────
function stripHTML(html){return html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function preview(body){const t=stripHTML(body);return t.length>120?t.slice(0,120)+"…":t}

function renderTodayView(){
  const log=getTodayLog();const all=getAllCards();
  document.getElementById("rcount").textContent="";
  const grid=document.getElementById("card-grid");
  if(!log.length){
    grid.innerHTML=`<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No SOPs opened today yet</div><div class="empty-sub">Every SOP you open today will appear here with the time you viewed it. Resets automatically at midnight.</div></div>`;
    return;
  }
  const reversed=[...log].reverse();
  grid.innerHTML=`<div style="grid-column:1/-1">
    <div class="today-reset-note">🕐 ${log.length} SOP open${log.length!==1?'s':''} today — resets at midnight</div>
    ${reversed.map(entry=>{
      const c=all.find(x=>x.id==entry.id);if(!c)return'';
      const cat=CATS[c.cat]||{color:'#555',bg:'#eee',icon:''};
      return `<button class="today-entry" onclick="openCard(${c.id})">
        <div class="today-time">${entry.time}</div>
        <div class="today-entry-content">
          <div style="font-size:11px;font-weight:700;color:${cat.color};margin-bottom:4px">${cat.icon} ${c.cat}</div>
          <div style="font-size:15px;font-weight:700;color:#1a1a1a;line-height:1.4">${c.title}</div>
        </div>
        <div style="color:#3B6D11;font-weight:700;font-size:20px;flex-shrink:0">→</div>
      </button>`;
    }).join('')}
  </div>`;
}

function renderOnboardView(){
  const all=getAllCards();
  const done=getOnboardProgress();
  const total=ONBOARDING_PATH.length;
  const pct=Math.round((done.length/total)*100);
  document.getElementById("rcount").textContent="";
  document.getElementById("filters").innerHTML="";
  const grid=document.getElementById("card-grid");
  grid.innerHTML=`<div style="grid-column:1/-1">
    <div class="onboard-header">
      <div class="onboard-title">👋 Welcome to Woodchuck</div>
      <div class="onboard-sub">${done.length} of ${total} SOPs completed</div>
      <div class="onboard-bar"><div class="onboard-bar-fill" style="width:${pct}%"></div></div>
      <div class="onboard-pct">${pct}% complete</div>
    </div>
    ${ONBOARDING_PATH.map((id,i)=>{
      const c=all.find(x=>x.id===id);if(!c)return'';
      const cat=CATS[c.cat]||{color:'#555',bg:'#eee',icon:''};
      const isDone=done.includes(id);
      return `<button class="onboard-step${isDone?' done':''}" onclick="openCard(${id})">
        <div class="onboard-num">${isDone?'✓':i+1}</div>
        <div class="onboard-step-content">
          <div class="onboard-step-cat" style="color:${cat.color}">${cat.icon} ${c.cat}</div>
          <div class="onboard-step-title">${c.title}</div>
        </div>
        ${isDone
          ?`<button class="onboard-unmark-btn" onclick="toggleOnboardDone(event,${id})">Undo</button>`
          :`<button class="onboard-mark-btn" onclick="toggleOnboardDone(event,${id})">Done ✓</button>`}
      </button>`;
    }).join('')}
  </div>`;
}

function render(){
  if(activeRole==="Today"){renderTodayView();return;}
  if(activeRole==="Onboard"){renderOnboardView();return;}
  const q=document.getElementById("search").value.toLowerCase().trim();
  const visible=getVisibleCards();
  const filtered=visible.filter(c=>{
    const inCat=activeCat==="All"||c.cat===activeCat;
    const inQ=!q||[c.title,c.cat,...(c.tags||[])].join(" ").toLowerCase().includes(q);
    return inCat&&inQ;
  });
  document.getElementById("rcount").textContent=filtered.length+" result"+(filtered.length!==1?"s":"");
  const grid=document.getElementById("card-grid");
  if(!filtered.length){
    grid.innerHTML=`<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">No results found</div><div class="empty-sub">Try different keywords, or use Spruce AI Help to find the right SOP.</div><button class="empty-ai-btn" onclick="openAI()">Open Spruce AI Help</button></div>`;
    return;
  }
  const clicks=getClicks();
  grid.innerHTML=filtered.map(c=>{
    const cat=CATS[c.cat]||{color:"#555",bg:"#eee",icon:""};
    const cnt=clicks[c.id]||0;
    const title=q?hl(c.title,q):c.title;
    const isNew=isRecentlyUpdated(c.updated);
    return `<button class="card-tile" onclick="openCard(${c.id})">
      <div class="tile-cat" style="color:${cat.color}">${cat.icon} ${c.cat}</div>
      <div class="tile-title">${title}</div>
      <div class="tile-preview">${preview(c.body)}</div>
      <div class="tile-bottom">
        <span class="tile-open">View SOP <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
        <div style="display:flex;gap:6px;align-items:center">
          ${isNew?`<span class="badge-new">New</span>`:""}
          ${c.isCustom?`<span class="tile-badge custom">Custom</span>`:""}
          ${cnt>0?`<span class="tile-heat">🔥 ${cnt}</span>`:""}
        </div>
      </div>
      ${c.updated?`<div class="tile-date">Updated ${c.updated}</div>`:""}
    </button>`;
  }).join("");
}

function hl(text,q){return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,"gi"),"<mark>$1</mark>");}
function renderAll(){renderRoleTabs();renderQuickAccess();renderFilters();render();}

// ─── DETAIL DRAWER ───────────────────────────────────────────
let currentCardId=null;

function getRelatedCards(card, all, count=3){
  const tags=new Set(card.tags||[]);
  const scored=all.filter(c=>c.id!==card.id).map(c=>{
    let sc=0;
    (c.tags||[]).forEach(t=>{if(tags.has(t))sc+=3;});
    if(c.cat===card.cat)sc+=2;
    return{c,sc};
  }).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc);
  return scored.slice(0,count).map(x=>x.c);
}

function openCard(id){
  const all=getAllCards();const card=all.find(c=>c.id===id);if(!card)return;
  currentCardId=id;trackClick(id);trackDailyAccess(id);
  // Update URL hash for shareable link
  history.replaceState(null,'','#sop-'+id);
  renderQuickAccess();render();
  const cat=CATS[card.cat]||{color:"#555",bg:"#eee",icon:""};
  const el=document.getElementById("drawer-cat");
  el.textContent=cat.icon+" "+card.cat;el.style.background=cat.bg;el.style.color=cat.color;
  // Date display
  const dateEl=document.getElementById("drawer-date");
  if(dateEl)dateEl.textContent=card.updated?"Updated "+card.updated:"";
  document.getElementById("drawer-title").textContent=card.title;
  // Body + related SOPs
  const related=getRelatedCards(card,all);
  const relatedHTML=related.length?`<div class="related-sops">
    <div class="related-label">Related SOPs</div>
    ${related.map(r=>{const rc=CATS[r.cat]||{color:'#555',bg:'#eee',icon:''};return`<button class="related-card" onclick="openCard(${r.id})">
      <div style="flex:1;min-width:0">
        <div class="related-cat" style="color:${rc.color}">${rc.icon} ${r.cat}</div>
        <div class="related-title">${r.title}</div>
      </div>
      <div style="color:#3B6D11;font-weight:800;font-size:18px;flex-shrink:0">›</div>
    </button>`;}).join('')}
  </div>`:'';
  document.getElementById("drawer-body").innerHTML=card.body+relatedHTML;
  // Init interactive checklists
  initInteractiveChecklist(id);
  // Actions
  document.getElementById("drawer-actions").innerHTML=`
    <button class="btn-confused" onclick="openConfused()">😕 I'm confused</button>
    ${card.isCustom?`<button class="drawer-del-btn" onclick="deleteCustomCard(${card.id})">🗑 Delete this SOP</button>`:""}
  `;
  document.getElementById("drawer-overlay").classList.add("open");
  document.getElementById("drawer").classList.add("open");
  document.body.style.overflow="hidden";
  wcInit(card.body, card.title);
}

function initInteractiveChecklist(cardId){
  const body=document.getElementById('drawer-body');
  const items=body.querySelectorAll('ul.checklist li, ul.steps li');
  if(!items.length)return;
  const saved=wcCheckState[cardId]||{};
  items.forEach((li,i)=>{
    if(saved[i])li.classList.add('wc-checked');
    li.addEventListener('click',()=>{
      li.classList.toggle('wc-checked');
      if(!wcCheckState[cardId])wcCheckState[cardId]={};
      wcCheckState[cardId][i]=li.classList.contains('wc-checked');
    });
  });
  // Add reset button if no reset already
  const firstList=body.querySelector('ul.checklist, ul.steps');
  if(firstList){
    const resetBtn=document.createElement('button');
    resetBtn.className='checklist-reset';
    resetBtn.textContent='↺ Reset checklist';
    resetBtn.onclick=()=>{
      delete wcCheckState[cardId];
      body.querySelectorAll('li.wc-checked').forEach(li=>li.classList.remove('wc-checked'));
    };
    firstList.parentNode.insertBefore(resetBtn,firstList.nextSibling);
  }
}

function closeDrawer(){
  wcStop();
  history.replaceState(null,'',window.location.pathname+window.location.search);
  document.getElementById("drawer-overlay").classList.remove("open");
  document.getElementById("drawer").classList.remove("open");
  document.body.style.overflow="";currentCardId=null;
}

// ─── SHARE LINK ───────────────────────────────────────────────
function copyShareLink(){
  const url=window.location.href.split('#')[0]+'#sop-'+(currentCardId||'');
  navigator.clipboard.writeText(url).then(()=>{
    const btn=document.getElementById('drawer-share-btn');
    if(!btn)return;
    const orig=btn.innerHTML;
    btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    btn.style.color='#3B6D11';
    setTimeout(()=>{btn.innerHTML=orig;btn.style.color='';},1800);
  }).catch(()=>prompt('Copy this link:',url));
}

// ─── "I'M CONFUSED" ───────────────────────────────────────────
function openConfused(){
  populateFbSopSelect();
  setFbType('feedback');
  if(currentCardId)document.getElementById('fb-sop').value=currentCardId;
  document.getElementById('fb-msg').value="I need some help understanding this SOP — something isn't clear.";
  document.getElementById('fb-modal-overlay').classList.add('open');
}

// ─── DELETE CUSTOM ───────────────────────────────────────────
function deleteCustomCard(id){
  if(!confirm("Delete this custom SOP? This cannot be undone."))return;
  saveCustomCards(getCustomCards().filter(c=>c.id!==id));
  closeDrawer();renderAll();
}

// ─── AI HELP ─────────────────────────────────────────────────
let aiInited=false;
function toggleQuotePanel(){
  const panel = document.getElementById("quote-panel");
  const btn = document.getElementById("btn-quote");
  const isOpen = panel.classList.toggle("open");
  btn.classList.toggle("active", isOpen);
}

function openAI(){
  document.getElementById("ai-overlay").classList.add("open");
  if(!aiInited){initChat();aiInited=true;}
  setTimeout(()=>document.getElementById("ai-input").focus(),200);
}
function closeAI(){document.getElementById("ai-overlay").classList.remove("open");}
function aiOverlayClick(e){if(e.target===document.getElementById("ai-overlay"))closeAI();}

function initChat(){
  const sugs=(SUGS[activeRole]||SUGS["All"]).slice(0,5);
  document.getElementById("ai-chat").innerHTML=`<div class="bubble bot">👋 Hey! Ask me anything about Woodchuck's processes — I'll answer directly and link you to the full SOP.</div><div class="sug-row">${sugs.map(s=>`<button class="sug-chip" onclick="askSug('${s.replace(/'/g,"\\'")}')">${s}</button>`).join("")}</div>`;
}
function askSug(t){document.getElementById("ai-input").value=t;sendAI();}

function composeAnswer(sop,q){
  const raw=stripHTML(sop.body).replace(/\s+/g," ").trim();
  let excerpt=raw.length>450?raw.slice(0,450).replace(/\s\S+$/,"")+"…":raw;
  return`<strong>${esc(sop.title)}</strong><br><br>${esc(excerpt)}`;
}

function sendAI(){
  const inp=document.getElementById("ai-input");const q=inp.value.trim();if(!q)return;inp.value="";
  const area=document.getElementById("ai-chat");
  area.innerHTML+=`<div class="bubble user">${esc(q)}</div>`;
  const tid="t"+Date.now();
  area.innerHTML+=`<div id="${tid}" class="thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  area.scrollTop=area.scrollHeight;
  setTimeout(()=>{
    document.getElementById(tid)?.remove();
    const results=scoreCards(q);
    let html;
    if(results.length){
      html=`<div class="bubble bot">${composeAnswer(results[0],q)}</div>`;
      html+=`<div class="ai-ref-label">Full SOP${results.length>1?"s":""}:</div><div class="result-cards">${results.map((c,i)=>{const cat=CATS[c.cat]||{color:"#555",bg:"#eee",icon:""};return`<button class="result-card${i>0?" result-card-dim":""}" onclick="openFromAI(${c.id})"><div class="rc-left"><div class="rc-cat" style="color:${cat.color}">${cat.icon} ${c.cat}</div><div class="rc-title">${c.title}</div></div><div class="rc-arrow">→</div></button>`;}).join("")}</div>`;
    } else {
      html=`<div class="bubble bot">I couldn't find a specific SOP for that. Try keywords like "foam," "closed won," "shipping," "variable data," or "rush."</div>`;
    }
    area.innerHTML+=html;area.scrollTop=area.scrollHeight;
  },650);
}
function openFromAI(id){closeAI();openCard(id);}

function getIntro(q){
  const qL=q.toLowerCase();
  if(/closed.?won|finali[sz]|sign.?off/.test(qL))return"Before marking a deal Closed Won, start here:";
  if(/snippet|hubspot.*qual/.test(qL))return"HubSpot snippets for that:";
  if(/ship.*own.?account|customer.*account.*ship|handling.?fee|palletiz/.test(qL))return"Mandatory fees when customers ship on their own account:";
  if(/ship|freight|ltl|pallet|ups|transit/.test(qL))return"Shipping SOPs relevant to that:";
  if(/foam.*insert|insert.*foam|foam.*box/.test(qL))return"Foam insert design requirements:";
  if(/foam.*packag|bubble.?wrap|fragile/.test(qL))return"Packaging instructions:";
  if(/overag|recut.*percent/.test(qL))return"Overage requirements by material:";
  if(/variable.?data|vd.*template|csv.*template/.test(qL))return"Variable data rules:";
  if(/artwork|file.?type|eps|vector|jpg|png/.test(qL))return"Artwork requirements:";
  if(/mockup.*proof|proof.*mockup|level.?1|level.?2/.test(qL))return"Mockup vs. proof:";
  if(/ppc|pre.?press|prototype/.test(qL))return"PPC requirements:";
  if(/rush.?order|rush.?fee/.test(qL))return"Rush order policy:";
  if(/change.?order|change.?fee/.test(qL))return"Change order policy:";
  if(/return|refund|defect/.test(qL))return"Returns and defectives process:";
  if(/kitting|inbound.?item/.test(qL))return"Inbound kitting process:";
  if(/tax|sales.?tax|nexus/.test(qL))return"Sales tax collection:";
  if(/quickbooks|sku/.test(qL))return"QuickBooks SKU reference:";
  if(/hinge|magnet|hardware.?spec/.test(qL))return"Hardware specs:";
  if(/laser.*height|kern|trotec/.test(qL))return"Laser height capabilities:";
  if(/layout|sheet.?size|bed.?size|line.?weight/.test(qL))return"Layout cheat sheet:";
  if(/flip.?jig|veneer.*layout|folder.?struct/.test(qL))return"Layout notes:";
  if(/cnc|carbide|shapeoko/.test(qL))return"CNC setup workflow:";
  if(/box.*dim|dimension.*box|lwd/.test(qL))return"Box dimension conventions:";
  if(/butt.?joint|miter.*formula/.test(qL))return"Box construction formulas:";
  if(/routing|joy|mona|who.?handles/.test(qL))return"Internal contact routing:";
  if(/handoff|pre.?flight|designer.?check/.test(qL))return"Handoff checklist:";
  return"Here's what I found:";
}

const STOP=new Set("the and for are but not you all can was one our out get has how its may now own put say she too use way who why will with this that what when then than them they been from have more some such also into just like over take your their there which would about could after other where these those make used need does any per do to a an is in of or at be by if it no on so up as we me my he am us go ok".split(" "));

function scoreCards(q){
  const words=q.toLowerCase().replace(/[^\w\s]/g," ").split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
  if(!words.length)return[];
  const all=getAllCards();
  const BOOSTS=[[/closed.?won|finali[sz]/,[15,16]],[/snippet.*qual|qual.*snippet/,[11]],[/production.*snippet|design.*snippet/,[12]],[/form.?link|w9|inbound.?form/,[13]],[/hubspot.*auto|auto.*notif/,[14]],[/ship.*own|customer.*account.*ship|handling.?fee|palletiz/,[20]],[/ltl|pallet.*ship/,[19]],[/ups.*ground|transit.*time|shipping.?quote/,[18]],[/foam.*packag|bubble.?wrap/,[21]],[/foam.*(insert|box)|insert.*foam/,[7]],[/overage|recut.*percent/,[2]],[/variable.?data|vd.*template/,[6]],[/artwork|file.?type|eps|vector/,[5]],[/mockup.*proof|proof.*mockup/,[4]],[/ppc|pre.?press/,[8]],[/rush.?order|rush.?fee/,[17]],[/change.?order/,[16]],[/return|refund|defect/,[26]],[/kitting|inbound.?item/,[25]],[/sales.?tax|nexus/,[23]],[/quickbooks|sku/,[24]],[/hinge|magnet/,[30]],[/laser.*height|kern|trotec/,[22]],[/layout.*cheat|sheet.?size|bed.?size/,[27]],[/flip.?jig|folder.?struct/,[28]],[/cnc|carbide|shapeoko/,[29]],[/box.*dim|dimension.*box/,[9]],[/butt.?joint|miter.*formula/,[10]],[/routing.*contact|who.?handles/,[31]],[/handoff|pre.?flight/,[1]],[/pre.?design.*check/,[3]]];
  const qL=q.toLowerCase();const scores={};
  all.forEach(c=>{
    let sc=0;const tL=c.title.toLowerCase();const taL=(c.tags||[]).join(" ").toLowerCase();const bL=stripHTML(c.body).toLowerCase();
    words.forEach(w=>{if(tL.includes(w))sc+=5;if(taL.includes(w))sc+=3;if(c.cat.toLowerCase().includes(w))sc+=2;if(bL.includes(w))sc+=1;});
    BOOSTS.forEach(([re,ids])=>{if(re.test(qL)&&ids.includes(c.id))sc+=12;});
    scores[c.id]=sc;
  });
  return all.filter(c=>scores[c.id]>=3).sort((a,b)=>scores[b.id]-scores[a.id]).slice(0,3);
}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeDrawer();closeAI();closeFeedback();closeInbox();closeFlow();}});

function openFlow(){document.getElementById("flow-overlay").classList.add("open");document.getElementById("btn-flow").classList.add("active");}
function closeFlow(){document.getElementById("flow-overlay").classList.remove("open");document.getElementById("btn-flow").classList.remove("active");}
function getIdByTitle(keyword){const kw=keyword.toLowerCase();const match=getAllCards().find(c=>c.title.toLowerCase().includes(kw));return match?match.id:null;}
function switchMat(btn,id){btn.closest('.tab-btns').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const prefix=id.substring(0,id.lastIndexOf('-'));document.querySelectorAll('.mat-section[id^="'+prefix+'-"]').forEach(s=>s.classList.toggle('active',s.id===id));}

// ─── FEEDBACK SYSTEM ──────────────────────────────────────────
let fbType="change";
let inboxTab="pending";

function getFeedback(){try{return JSON.parse(localStorage.getItem("wc_feedback")||"[]")}catch{return[]}}
function saveFeedback(arr){localStorage.setItem("wc_feedback",JSON.stringify(arr))}

function updateInboxBadge(){
  const pending=getFeedback().filter(f=>f.status==="pending").length;
  const badge=document.getElementById("inbox-badge");
  if(badge){badge.textContent=pending;badge.classList.toggle("visible",pending>0);}
}

function populateFbSopSelect(){
  const sel=document.getElementById("fb-sop");
  const all=getAllCards();
  sel.innerHTML=`<option value="">— General / not SOP-specific —</option>`
    +all.map(c=>`<option value="${c.id}">${c.title}</option>`).join("");
  // pre-select if a drawer is open
  if(currentCardId)sel.value=currentCardId;
}

function setFbType(type){
  fbType=type;
  document.getElementById("fb-type-change").classList.toggle("active",type==="change");
  document.getElementById("fb-type-feedback").classList.toggle("active",type==="feedback");
  document.getElementById("fb-msg-label").textContent=type==="change"?"What would you like to change?":"What's your feedback?";
  document.getElementById("fb-msg").placeholder=type==="change"?"Describe what's incorrect, unclear, or missing…":"Any thoughts, questions, or suggestions…";
}

function handleFeedbackClick(e){
  if(e&&e.shiftKey){openInbox();}else{openFeedback();}
}
function openFeedback(){
  populateFbSopSelect();
  setFbType(fbType);
  document.getElementById("fb-name").value="";
  document.getElementById("fb-msg").value="";
  document.getElementById("fb-modal-overlay").classList.add("open");
}
function closeFeedback(){document.getElementById("fb-modal-overlay").classList.remove("open");}
function fbOverlayClick(e){if(e.target===document.getElementById("fb-modal-overlay"))closeFeedback();}

// ── Replace with your Web3Forms access key ──────────────────
// Get your free key at https://web3forms.com — enter zoie@woodchuckusa.com and paste the key below
const W3F_KEY = "a056d60d-1912-4e16-847d-f54088e7bd96";

async function submitFeedback(){
  const name=document.getElementById("fb-name").value.trim();
  const msg=document.getElementById("fb-msg").value.trim();
  const sopId=document.getElementById("fb-sop").value;
  if(!msg){alert("Please describe your feedback before submitting.");return;}
  const sopTitle=sopId?getAllCards().find(c=>c.id==sopId)?.title||"":"";
  const typeLabel=fbType==="change"?"Change Request":"General Feedback";
  const sopLine=sopTitle?`SOP: ${sopTitle}`:"(not SOP-specific)";

  // Save locally
  const arr=getFeedback();
  const entry={id:Date.now(),type:fbType,name:name||"Anonymous",msg,sopId:sopId||null,sopTitle,status:"pending",date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})};
  arr.unshift(entry);
  saveFeedback(arr);
  closeFeedback();
  updateInboxBadge();

  // Flash confirmation
  const btn=document.getElementById("btn-feedback");
  const orig=btn.innerHTML;
  const showConfirm=()=>{btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Submitted!</span>`;btn.style.background="#EAF3DE";btn.style.borderColor="#3B6D11";btn.style.color="#27500A";setTimeout(()=>{btn.innerHTML=orig;btn.style.background="";btn.style.borderColor="";btn.style.color="";},2200);};
  showConfirm();

  // Send email via Web3Forms
  if(W3F_KEY&&W3F_KEY!=="PASTE_YOUR_WEB3FORMS_KEY_HERE"){
    try{
      await fetch("https://api.web3forms.com/submit",{
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({
          access_key:W3F_KEY,
          subject:`[SOP Hub] ${typeLabel} from ${name||"Anonymous"}`,
          from_name:"Woodchuck SOP Hub",
          message:`Type: ${typeLabel}\nFrom: ${name||"Anonymous"}\n${sopLine}\n\n${msg}`,
          replyto:"noreply@woodchuckusa.com"
        })
      });
    }catch(e){/* silent — submission already saved locally */}
  }
}

// ─── ADMIN INBOX ──────────────────────────────────────────────
function openInbox(){
  setInboxTab("pending");
  document.getElementById("inbox-modal-overlay").classList.add("open");
}
function closeInbox(){document.getElementById("inbox-modal-overlay").classList.remove("open");}
function inboxOverlayClick(e){if(e.target===document.getElementById("inbox-modal-overlay"))closeInbox();}

function setInboxTab(tab){
  inboxTab=tab;
  ["pending","approved","dismissed"].forEach(t=>{
    document.getElementById("itab-"+t).classList.toggle("active",t===tab);
  });
  renderInbox();
}

function renderInbox(){
  const all=getFeedback().filter(f=>f.status===inboxTab);
  const body=document.getElementById("inbox-body");
  if(!all.length){
    body.innerHTML=`<div class="inbox-empty"><div class="inbox-empty-icon">${inboxTab==="pending"?"📭":inboxTab==="approved"?"✅":"🗂️"}</div><div style="font-size:15px;font-weight:700;color:#888;margin-bottom:6px">${inboxTab==="pending"?"No pending submissions":"Nothing here yet"}</div><div style="font-size:13px;color:#AAA">Submissions will appear here once they're ${inboxTab==="pending"?"received":"moved to this tab"}.</div></div>`;
    return;
  }
  body.innerHTML=all.map(f=>{
    const typeLabel=f.type==="change"?"Change Request":"Feedback";
    const typeClass=f.type==="change"?"change":"feedback";
    const sopLine=f.sopTitle?`<span class="inbox-sop">📄 ${f.sopTitle}</span>`:`<span class="inbox-sop" style="color:#C0BDB5">General</span>`;
    let actions="";
    if(f.status==="pending"){
      actions=`<div class="inbox-actions"><button class="inbox-approve" onclick="inboxAction(${f.id},'approved')">✓ Mark Approved</button><button class="inbox-dismiss" onclick="inboxAction(${f.id},'dismissed')">Dismiss</button></div>`;
    }else{
      const pill=f.status==="approved"?`<span class="inbox-status-pill approved">✓ Approved</span>`:`<span class="inbox-status-pill dismissed">Dismissed</span>`;
      actions=`<div class="inbox-actions">${pill}<button class="inbox-dismiss" onclick="inboxAction(${f.id},'pending')" style="margin-left:auto">↩ Move to Pending</button></div>`;
    }
    return `<div class="inbox-item ${f.status}">
      <div class="inbox-meta"><span class="inbox-type ${typeClass}">${typeLabel}</span>${sopLine}<span class="inbox-date">${f.date}</span></div>
      <div class="inbox-name">${esc(f.name)}</div>
      <div class="inbox-msg">${esc(f.msg)}</div>
      ${actions}
    </div>`;
  }).join("");
}

function inboxAction(id,status){
  const arr=getFeedback();const i=arr.findIndex(f=>f.id===id);
  if(i<0)return;arr[i].status=status;saveFeedback(arr);
  updateInboxBadge();renderInbox();
}

// Long-press on feedback button opens inbox (mobile-friendly)
(function(){
  document.addEventListener("DOMContentLoaded",()=>{
    const fbBtn=document.getElementById("btn-feedback");
    if(!fbBtn)return;
    let pressTimer=null;
    fbBtn.addEventListener("mousedown",()=>{pressTimer=setTimeout(()=>{pressTimer=null;openInbox();},700);});
    fbBtn.addEventListener("mouseup",()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    fbBtn.addEventListener("mouseleave",()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    fbBtn.addEventListener("touchstart",()=>{pressTimer=setTimeout(()=>{pressTimer=null;openInbox();},700);},{passive:true});
    fbBtn.addEventListener("touchend",()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}},{passive:true});
  });
})();

// narrator removed
function wcInit(){}
function wcStop(){}

// swipe-right to close drawer on mobile
(function(){
  const dr=document.getElementById("drawer");
  let sx=null;
  dr.addEventListener("touchstart",e=>{sx=e.touches[0].clientX;},{passive:true});
  dr.addEventListener("touchmove",e=>{
    if(sx===null)return;
    const dx=e.touches[0].clientX-sx;
    if(dx>0)dr.style.transform=`translateX(${Math.min(dx,300)}px)`;
  },{passive:true});
  dr.addEventListener("touchend",e=>{
    const dx=e.changedTouches[0].clientX-(sx||0);
    dr.style.transform="";sx=null;
    if(dx>80)closeDrawer();
  },{passive:true});
})();

renderAll();
updateInboxBadge();

// ─── HASH-BASED DEEP LINK ─────────────────────────────────────
(function(){
  const hash=window.location.hash;
  if(hash&&hash.startsWith('#sop-')){
    const id=parseInt(hash.replace('#sop-',''),10);
    if(!isNaN(id))setTimeout(()=>openCard(id),150);
  }
})();
