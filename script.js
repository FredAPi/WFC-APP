
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ---- Supabase
const SUPABASE_URL = 'https://vhgfjnnwhwglirnkvacz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Zqbm53aHdnbGlybmt2YWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1MjY4ODksImV4cCI6MjA3MDEwMjg4OX0.-JMgOOD6syRvAzBexgUMjxTgNqpH8mhrrDxw0ItmS4w';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- App state
const APP = { LOGIN:'login', DASH:'dash', HIST:'hist', VIEW:'view', PRE:'pre', CHECK:'check' };
let appState = APP.LOGIN;

let storeList = [];
let categories = [];
let selectedStore = '';
let selectedStoreId = null;

const app = document.getElementById('app');

// ---- Helpers
const getStoreId   = (name)=> (storeList.find(s=>s.name===name)?.id ?? null);
const getStoreCode = (name)=> (storeList.find(s=>s.name===name)?.code ?? '');

async function fetchStores(){
  const { data } = await supabase.from('boutiques').select('*').order('nom');
  storeList = (data||[]).map(r=>({id:r.id, name:r.nom, code:r.code}));
}
async function fetchCategories(){
  const { data } = await supabase.from('categories').select('*').order('ordre',{ascending:true});
  categories = (data||[]);
}
async function fetchVerifs(storeId){
  const { data } = await supabase
    .from('verifications')
    .select('*')
    .eq('boutique_id', storeId)
    .order('date',{ascending:false});
  return data||[];
}

// date utils
function parseFRDate(str){ const [d,m,y]=str.split('/').map(n=>parseInt(n,10)); return new Date(y,m-1,d); }
function ymd(d){ const z=new Date(d); z.setHours(12); return z.toISOString().slice(0,10); }
function daysBetween(start,end){ const res=[]; const cur=new Date(start); while(cur<=end){ res.push(ymd(cur)); cur.setDate(cur.getDate()+1);} return res; }
function toFR(dStr){ // 'YYYY-MM-DD' -> 'DD/MM/YYYY'
  const [y,m,d] = dStr.split('-');
  return `${d}/${m}/${y}`;
}
function computeCoveredDays(verifs){
  const set=new Set();
  (verifs||[]).forEach(v=>{
    const per=v.periode_couverte||'';
    const m=per.match(/du\s(\d{2}\/\d{2}\/\d{4})\sau\s(\d{2}\/\d{2}\/\d{4})/);
    if(!m) return;
    const d1=parseFRDate(m[1]); const d2=parseFRDate(m[2]);
    daysBetween(d1,d2).forEach(d=>set.add(d));
  });
  return set;
}
function recurringErrors(verifs){
  const counts={};
  verifs.forEach(v=>{ const r=v.resultats||{}; Object.entries(r).forEach(([cat,val])=>{ if(val && val.status==='error') counts[cat]=(counts[cat]||0)+1; }); });
  const nameMap={}; (categories||[]).forEach(c=>nameMap[c.id]=c.nom_categorie);
  return Object.entries(counts)
    .map(([id,c])=>({label:nameMap[id]||id,count:c}))
    .sort((a,b)=>b.count-a.count)
    .slice(0,3);
}

// ---- Login
async function renderLogin(){
  appState=APP.LOGIN; app.innerHTML='';
  if(!storeList.length) await fetchStores();

  const container=document.createElement('div'); container.className='container';
  const wrap=document.createElement('div'); wrap.className='login-wrap';
  const card=document.createElement('div'); card.className='login-card';

  const avatar=document.createElement('div'); avatar.className='login-avatar';
  avatar.innerHTML='<img src="favicon.png" alt="logo" class="login-logo">'; 
  card.appendChild(avatar);

  const row1=document.createElement('div'); row1.className='form-row'; row1.innerHTML='<div class="icon-cell">🏬</div>';
  const sel=document.createElement('select'); 
  sel.innerHTML='<option value="">Choisir une boutique</option>'+storeList.map(s=>`<option value="${s.name}">${s.name}</option>`).join('');
  row1.appendChild(sel); card.appendChild(row1);

  const row2=document.createElement('div'); row2.className='form-row'; row2.innerHTML='<div class="icon-cell">🔒</div>';
  const code=document.createElement('input'); code.type='password'; code.placeholder='Code boutique'; 
  row2.appendChild(code); card.appendChild(row2);

  const err=document.createElement('div'); err.className='err hidden'; err.textContent='Code incorrect'; card.appendChild(err);

  const btn=document.createElement('button'); btn.className='login-button'; btn.textContent='LOGIN'; btn.disabled=true; 
  card.appendChild(btn);

  wrap.appendChild(card); container.appendChild(wrap); app.appendChild(container);

  const check=()=>{ 
    const exp=sel.value?getStoreCode(sel.value):null; 
    const ok=!!sel.value && !!code.value && (code.value===exp); 
    const showErr=!!sel.value && !!code.value && (code.value!==exp); 
    err.classList.toggle('hidden',!showErr); 
    btn.disabled=!ok; 
  };
  sel.addEventListener('change',check); code.addEventListener('input',check);

  btn.addEventListener('click', async ()=>{
    selectedStore=sel.value; 
    selectedStoreId=getStoreId(selectedStore); 
    await renderDashboard();
  });
}

// ---- Dashboard
async function renderDashboard(){
  appState=APP.DASH; app.innerHTML='';
  if(!selectedStoreId) return renderLogin();
  await fetchCategories();

  const verifs = await fetchVerifs(selectedStoreId);
  const covered = computeCoveredDays(verifs);
  const errorsTop = recurringErrors(verifs);

  const container=document.createElement('div'); container.className='container';
  const dash=document.createElement('div'); dash.className='dashboard';

  // Sidebar
  const side=document.createElement('aside'); side.className='sidebar';
  side.innerHTML=`<div class="store-name">${selectedStore}</div><div class="store-code">ID: ${selectedStoreId}</div>`;
  const menu=document.createElement('div'); menu.className='menu';
  const bStart=document.createElement('button'); bStart.className='primary-lg'; bStart.textContent='Commencer un audit';
  const bHist=document.createElement('button');  bHist.className='ghost-button';  bHist.textContent="Voir l'historique";
  const bBack=document.createElement('button');  bBack.className='ghost-button';  bBack.textContent='Changer de boutique';
  menu.append(bStart,bHist,bBack); side.appendChild(menu);

  // Content
  const content=document.createElement('section'); content.className='content';
  const tAud=document.createElement('div'); tAud.className='tile'; tAud.innerHTML='<h3>Audits réalisés</h3><div class="big">'+verifs.length+'</div>';
  const tErr=document.createElement('div'); tErr.className='tile'; tErr.innerHTML='<h3>Erreurs récurrentes</h3>'+ (errorsTop.length? '<ul>'+errorsTop.map(e=>`<li>${e.label} — <b>${e.count}</b></li>`).join('')+'</ul>':'<div>—</div>');
  const tDocs=document.createElement('div'); 
  tDocs.className='tile';
  tDocs.innerHTML='<h3>Documents ICC</h3><div class="muted">Consulter & imprimer</div>';
  tDocs.style.cursor='pointer';
  tDocs.onclick=()=>renderDocs();
  content.append(tAud,tErr,tDocs);

  // Calendar
  const cal=document.createElement('div'); cal.className='card calendar';
  const calHead=document.createElement('div'); calHead.className='cal-head'; calHead.innerHTML='<div class="nav"><button class="prev">◀</button><button class="next">▶</button></div><div class="title"></div>';
  const calBody=document.createElement('div'); 
  cal.append(calHead,calBody);
  // Légende
  const legend=document.createElement('div'); legend.className='calendar-legend'; legend.innerHTML='<span class="legend-dot"></span> Jour contrôlé'; 
  cal.appendChild(legend);

  // History (teaser)
  const histCard=document.createElement('div'); histCard.className='card history'; histCard.innerHTML='<h3>Historique</h3>';
  if(!verifs.length) histCard.innerHTML+='<div>Aucun audit.</div>'; 
  else verifs.slice(0,6).forEach(v=>{ 
    const row=document.createElement('div'); row.className='row'; 
    row.textContent=`${v.date} — ${v.verificateur} (${v.periode_couverte||''})`; 
    histCard.appendChild(row); 
  });

  content.append(cal,histCard); 
  dash.append(side,content); 
  container.appendChild(dash); 
  app.appendChild(container);

  // Calendar render
  let y=new Date().getFullYear(), m=new Date().getMonth();
  const title=calHead.querySelector('.title');
  function renderMonth(){
    title.textContent=new Date(y,m,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    calBody.innerHTML='';
    const table=document.createElement('table');
    const thead=document.createElement('thead'); 
    const trh=document.createElement('tr'); 
    ['L','M','M','J','V','S','D'].forEach(d=>{ const th=document.createElement('th'); th.textContent=d; trh.appendChild(th); }); 
    thead.appendChild(trh);
    const tbody=document.createElement('tbody');
    const first=new Date(y,m,1); 
    const start=(first.getDay()+6)%7; 
    const days=new Date(y,m+1,0).getDate();
    let day=1;
    for(let r=0;r<6;r++){ 
      const tr=document.createElement('tr');
      for(let c=0;c<7;c++){ 
        const td=document.createElement('td');
        if((r===0&&c<start)||day>days) td.innerHTML='&nbsp;';
        else { 
          const d=String(day).padStart(2,'0'); 
          const ds=`${y}-${String(m+1).padStart(2,'0')}-${d}`; 
          const span=document.createElement('span'); 
          span.textContent=d; 
          if(covered.has(ds)) td.classList.add('day-covered'); 
          td.appendChild(span); 
          day++; 
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.append(thead,tbody); 
    calBody.appendChild(table);
  }
  calHead.querySelector('.prev').onclick=()=>{ m--; if(m<0){m=11;y--;} renderMonth(); };
  calHead.querySelector('.next').onclick=()=>{ m++; if(m>11){m=0;y++;} renderMonth(); };
  renderMonth();

  // Actions
  bBack.onclick = ()=>renderLogin();
  bHist.onclick = ()=>renderHistoryList();
  bStart.onclick = ()=>renderPreCheck();
}

// ---- Pre-check form (date + période + vérificateur) + anti-doublon

async function renderPreCheck(){
  appState=APP.PRE; app.innerHTML='';
  if(!selectedStoreId) return renderLogin();
  await fetchCategories();

  // helpers
  const toBadge = (text)=>{
    const span=document.createElement('span');
    span.textContent=text;
    span.style.padding='8px 12px';
    span.style.background='#f1f5ff';
    span.style.border='1px solid #e5e7eb';
    span.style.borderRadius='999px';
    span.style.fontWeight='600';
    span.style.fontSize='14px';
    return span;
  };

  const today = new Date();
  const dateISO = ymd(today);

  // compute period from an audit date (exclusive: previous 7 days)
  const computePeriod = (iso)=>{
    const d = new Date(iso);
    const end = new Date(d); end.setDate(end.getDate()-1);
    const start = new Date(end); start.setDate(start.getDate()-6);
    return { startISO: ymd(start), endISO: ymd(end), startFR: toFR(ymd(start)), endFR: toFR(ymd(end)) };
  };

  let per = computePeriod(dateISO);

  const wrap = document.createElement('div');
  wrap.className = 'history-wrap';

  const header = document.createElement('div');
  header.className = 'history-header';
  const title = document.createElement('h2');
  title.textContent = `Informations avant vérification — ${selectedStore}`;
  const back = document.createElement('button');
  back.className = 'ghost-button';
  back.textContent = '← Retour';
  back.onclick = ()=>renderDashboard();
  header.append(title, back);
  wrap.appendChild(header);

  const card = document.createElement('div');
  card.className = 'card';
  const cardInner = document.createElement('div');
  cardInner.className = 'meta-grid';

  // Audit date (modifiable)
  const colDate = document.createElement('div');
  colDate.innerHTML = '<div class="label">Date d\'audit</div>';
  const dateInput = document.createElement('input');
  dateInput.type='date'; dateInput.value = dateISO;
  colDate.appendChild(dateInput);
  cardInner.appendChild(colDate);

  // Period (non editable) displayed as badges
  const colFrom = document.createElement('div');
  colFrom.innerHTML = '<div class="label">Période du</div>';
  const fromBadge = toBadge(per.startFR);
  colFrom.appendChild(fromBadge);
  cardInner.appendChild(colFrom);

  const colTo = document.createElement('div');
  colTo.innerHTML = '<div class="label">au</div>';
  const toBadgeEl = toBadge(per.endFR);
  colTo.appendChild(toBadgeEl);
  cardInner.appendChild(colTo);

  // Vérificateur
  const colWho = document.createElement('div');
  colWho.innerHTML = '<div class="label">Vérificateur</div>';
  const whoInput = document.createElement('input');
  whoInput.type='text'; whoInput.placeholder='Votre prénom';
  colWho.appendChild(whoInput);
  cardInner.appendChild(colWho);

  card.appendChild(cardInner);

  const actions = document.createElement('div');
  actions.style.marginTop='12px';
  const startBtn = document.createElement('button');
  startBtn.className='primary-lg';
  startBtn.textContent='Démarrer la checklist';
  startBtn.disabled = true;
  actions.appendChild(startBtn);
  card.appendChild(actions);

  wrap.appendChild(card);
  app.appendChild(wrap);

  // Enable when who typed
  const updateBtn = ()=>{ startBtn.disabled = !whoInput.value.trim(); };
  whoInput.addEventListener('input', updateBtn);
  updateBtn();

  // Recompute period on date change
  dateInput.addEventListener('change', ()=>{
    per = computePeriod(dateInput.value);
    fromBadge.textContent = per.startFR;
    toBadgeEl.textContent = per.endFR;
  });

  startBtn.onclick = async ()=>{
    const d = dateInput.value;
    const who = whoInput.value.trim();
    if(!d || !who){ alert('Merci de renseigner la date et le prénom.'); return; }

    // anti-doublon
    const { data:existing } = await supabase
      .from('verifications')
      .select('id')
      .eq('boutique_id', selectedStoreId)
      .eq('date', d)
      .maybeSingle();

    if(existing){
      if(confirm('Une vérification existe déjà pour cette date. Voulez-vous consulter le détail ?')){
        return renderHistoryDetail(existing.id);
      }
      return;
    }

    const periode = `du ${per.startFR} au ${per.endFR}`;
    const meta = { date:d, from: per.startISO, to: per.endISO, who, periode };
    renderChecklist(meta);
  };
}
// ---- Checklist dynamique depuis categories
function renderChecklist(meta){
  appState=APP.CHECK; app.innerHTML='';

  const wrap = document.createElement('div');
  wrap.className = 'history-wrap';

  const header = document.createElement('div');
  header.className = 'history-header';
  const title = document.createElement('h2');
  title.textContent = `Checklist — ${selectedStore} (${toFR(meta.date)})`;
  const back = document.createElement('button');
  back.className = 'ghost-button';
  back.textContent = '← Annuler';
  back.onclick = ()=>renderDashboard();
  header.append(title, back);
  wrap.appendChild(header);

  const form = document.createElement('div');
  form.className='result-list';

  const activeCats = (categories||[]).filter(c=>c.actif !== false);
  const fields = [];

  activeCats.forEach(cat=>{
    const row = document.createElement('div'); row.className='result-row';
    const t = document.createElement('div'); t.className='res-title'; t.textContent = cat.nom_categorie;
    if(cat.description){
      const infoWrap = document.createElement('span');
      infoWrap.className='info-wrap';
      const info = document.createElement('span'); info.className='info-icon'; info.textContent='ℹ️';
      const tip = document.createElement('div'); tip.className='tooltip'; tip.textContent = cat.description || '';
infoWrap.appendChild(info); infoWrap.appendChild(tip);
      const toggle = ()=> tip.classList.toggle('show');
      info.addEventListener('mouseenter', ()=> tip.classList.add('show'));
      info.addEventListener('mouseleave', ()=> tip.classList.remove('show'));
      info.addEventListener('click', toggle);
      t.appendChild(infoWrap);
    }
    const control = document.createElement('div'); control.style.display='flex'; control.style.gap='10px'; control.style.flexWrap='wrap';

    const ok = document.createElement('button'); ok.type='button'; ok.textContent='✅ Conforme'; ok.className='ghost-button';
    const ko = document.createElement('button'); ko.type='button'; ko.textContent='❌ Non conforme'; ko.className='ghost-button';
    const comment = document.createElement('input'); comment.type='text'; comment.placeholder='Commentaire (optionnel)'; comment.style.flex='1';

    let status = null;
    const setSel = (s)=>{ status=s; ok.style.background = s==='done' ? '#eafff7' : '#fff'; ko.style.background = s==='error' ? '#fff0f0' : '#fff'; };
    ok.onclick = ()=>setSel('done'); ko.onclick = ()=>setSel('error');

    control.append(ok, ko, comment);
    row.append(t, control);
    form.appendChild(row);

    fields.push({ id: cat.id, get: ()=>({ status, comment: comment.value?.trim() }) });
  });

  const bottom = document.createElement('div');
  bottom.style.display='flex'; bottom.style.gap='10px'; bottom.style.marginTop='12px';
  const saveBtn = document.createElement('button'); saveBtn.className='primary-lg'; saveBtn.textContent='Enregistrer la vérification';
  bottom.appendChild(saveBtn);

  wrap.appendChild(form);
  wrap.appendChild(bottom);
  app.appendChild(wrap);

  saveBtn.onclick = async ()=>{
    // build results
    const results = {};
    fields.forEach(f=>{ const v=f.get(); if(v.status) results[f.id] = v; });

    if(Object.keys(results).length===0){
      if(!confirm('Aucun point coché. Enregistrer quand même ?')) return;
    }

    const payload = {
      boutique_id: selectedStoreId,
      nom_boutique: selectedStore,
      verificateur: meta.who,
      date: meta.date,
      periode_couverte: meta.periode,
      resultats: results,
      commentaire: ''
    };

    const fnUrl = 'https://vhgfjnnwhwglirnkvacz.supabase.co/functions/v1/create_verif';
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      alert("Échec de l'enregistrement : " + (err.error || res.status));
      console.error(err);
      return;
    }

    alert('Vérification enregistrée ✅');
    renderDashboard();
  };
}


// ---- Documents ICC
const DOCS = (window.DOCS || []); // à remplir plus tard [{title, url}]

function renderDocs(){
  appState = APP.VIEW; 
  app.innerHTML='';
  const wrap = document.createElement('div'); 
  wrap.className = 'history-wrap';

  const header = document.createElement('div');
  header.className = 'history-header';
  const title = document.createElement('h2'); title.textContent = 'Documents ICC';
  const back = document.createElement('button'); back.className='ghost-button'; back.textContent='← Retour';
  back.onclick = ()=>renderDashboard();
  header.append(title, back);
  wrap.appendChild(header);

  const list = document.createElement('div');
  list.className = 'doc-list';

  if(!DOCS.length){
    const empty = document.createElement('div');
    empty.className='muted';
    empty.textContent = 'Aucun document défini pour le moment.';
    list.appendChild(empty);
  } else {
    DOCS.forEach(d => {
      const row = document.createElement('div');
      row.className='doc-row';
      const name = document.createElement('div'); name.className='doc-name'; name.textContent = d.title || 'Document';
      const actions = document.createElement('div'); actions.className='doc-actions';

      const openBtn = document.createElement('button'); openBtn.className='ghost-button'; openBtn.textContent='Ouvrir';
      openBtn.onclick = ()=>{ if(d.url) window.open(d.url, '_blank'); };

      const printBtn = document.createElement('button'); printBtn.className='ghost-button'; printBtn.textContent='Imprimer';
      printBtn.onclick = ()=>{ if(d.url){ const w=window.open(d.url, '_blank'); if(w){ w.addEventListener('load', ()=>{ try{ w.print(); }catch(e){} }); } } };

      actions.append(openBtn, printBtn);
      row.append(name, actions);
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  app.appendChild(wrap);
}
// ---- History list
async function renderHistoryList(){
  appState = APP.HIST;
  app.innerHTML = '';
  if (!selectedStoreId) return renderLogin();
  if (!categories.length) await fetchCategories();

  const wrap = document.createElement('div');
  wrap.className = 'history-wrap';

  const header = document.createElement('div');
  header.className = 'history-header';
  const title = document.createElement('h2');
  title.textContent = `Historique — ${selectedStore}`;
  const back = document.createElement('button');
  back.className = 'ghost-button';
  back.textContent = '← Retour au dashboard';
  back.onclick = () => renderDashboard();
  header.append(title, back);
  wrap.appendChild(header);

  const { data, error } = await supabase
    .from('verifications')
    .select('*')
    .eq('boutique_id', selectedStoreId)
    .order('date', { ascending: false });

  if (error) {
    const err = document.createElement('div');
    err.textContent = "Erreur de chargement de l'historique.";
    wrap.appendChild(err);
    app.appendChild(wrap);
    return;
  }

  if (!data || !data.length){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Aucun audit pour le moment.';
    wrap.appendChild(empty);
    app.appendChild(wrap);
    return;
  }

  const table = document.createElement('table');
  table.className = 'history-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Période couverte</th>
        <th>Vérificateur</th>
        <th>Commentaires</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody');

  data.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${v.date || '—'}</td>
      <td>${v.periode_couverte || '—'}</td>
      <td>${v.verificateur || '—'}</td>
      <td class="muted">${(v.commentaire || '').slice(0,80)}</td>`;
    tr.style.cursor = 'pointer';
    tr.onclick = () => renderHistoryDetail(v.id);
    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  app.appendChild(wrap);
}

// ---- History detail
async function renderHistoryDetail(verificationId){
  appState = APP.VIEW;
  app.innerHTML = '';
  if (!selectedStoreId) return renderLogin();

  const { data, error } = await supabase
    .from('verifications')
    .select('*')
    .eq('id', verificationId)
    .single();

  const wrap = document.createElement('div');
  wrap.className = 'history-wrap';

  const header = document.createElement('div');
  header.className = 'history-header';
  const title = document.createElement('h2');
  title.textContent = `Audit du ${data?.date || '—'} — ${selectedStore}`;
  const back = document.createElement('button');
  back.className = 'ghost-button';
  back.textContent = "← Retour à l'historique";
  back.onclick = () => renderHistoryList();
  header.append(title, back);
  wrap.appendChild(header);

  if (error || !data){
    const err = document.createElement('div');
    err.textContent = 'Impossible de charger le détail.';
    wrap.appendChild(err);
    app.appendChild(wrap);
    return;
  }

  const meta = document.createElement('div');
  meta.className = 'card';
  meta.innerHTML = `
    <h3>Infos</h3>
    <div class="meta-grid">
      <div><div class="label">Date</div><div>${data.date || '—'}</div></div>
      <div><div class="label">Période couverte</div><div>${data.periode_couverte || '—'}</div></div>
      <div><div class="label">Vérificateur</div><div>${data.verificateur || '—'}</div></div>
    </div>`;
  wrap.appendChild(meta);

  const results = document.createElement('div');
  results.className = 'card';
  results.innerHTML = '<h3>Résultats</h3>';
  const list = document.createElement('div');
  list.className = 'result-list';

  const catMap = {}; (categories||[]).forEach(c=>catMap[c.id]=c.nom_categorie);
  const r = data.resultats || {};
  const items = Object.keys(r).length ? Object.entries(r) : [];
  if (!items.length){
    list.innerHTML = '<div class="empty">Aucun résultat enregistré.</div>';
  } else {
    items.forEach(([catId, val]) => {
      const line = document.createElement('div');
      line.className = 'result-row';
      const label = catMap[catId] || catId;
      let badge = '—';
      if (val && val.status === 'done')  badge = '✅ Conforme';
      else if (val && val.status === 'error') badge = '❌ Non conforme';
      const comment = (val && val.comment) ? `<div class="comment">${val.comment}</div>` : '';
      line.innerHTML = `<div class="res-title">${label}</div><div class="res-badge">${badge}</div>${comment}`;
      list.appendChild(line);
    });
  }
  results.appendChild(list);
  wrap.appendChild(results);
  app.appendChild(wrap);
}

// ---- Boot
async function init(){ 
  try{ await renderLogin(); }catch(e){ console.error(e);} 
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); 
else init();
