
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =====================================================
   WFC APP — script optimisé (mêmes fonctionnalités)
   -----------------------------------------------------
   - Login + Dashboard + Checklist + Historique + Détail
   - Multi-dates pour "Non conforme" (+ bouton 🗑)
   - "i" info : infobulle desktop / fiche plein-écran mobile
   - Nom boutique : MAJUSCULES, centré, avec marge sous le nom
   - Tableau historique responsive (cartes en mobile)
   - Compatibilité: pas de ?. ni ??
   ===================================================== */

// ---------------------------
// 0) CONFIG SUPABASE
// ---------------------------
const SUPABASE_URL = 'https://vhgfjnnwhwglirnkvacz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Zqbm53aHdnbGlybmt2YWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1MjY4ODksImV4cCI6MjA3MDEwMjg4OX0.-JMgOOD6syRvAzBexgUMjxTgNqpH8mhrrDxw0ItmS4w';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------
// 1) ETAT GLOBAL
// ---------------------------
const APP = { LOGIN:'login', DASH:'dash', HIST:'hist', VIEW:'view', PRE:'pre', CHECK:'check' };
let appState = APP.LOGIN;

let storeList = [];
let categories = [];
let selectedStore = '';
let selectedStoreId = null;

const app = document.getElementById('app');

// ---------------------------
// 2) HELPERS GÉNÉRIQUES
// ---------------------------
function isMobile(){ return (window.matchMedia && window.matchMedia('(max-width: 640px)').matches); }

function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

function el(tag, props={}, ...children){
  const n = document.createElement(tag);
  if (props) {
    if (props.className) n.className = props.className;
    if (props.text) n.textContent = props.text;
    if (props.html != null) n.innerHTML = props.html;
    if (props.attrs) Object.keys(props.attrs).forEach(k=> n.setAttribute(k, props.attrs[k]));
    if (props.style) Object.assign(n.style, props.style);
    if (props.on) Object.keys(props.on).forEach(evt => n.addEventListener(evt, props.on[evt]));
  }
  children.flat().forEach(c => { if (c!=null) n.appendChild(c); });
  return n;
}

function fragment(){ return document.createDocumentFragment(); }

// ---------------------------
// 3) DATES & PÉRIODES
// ---------------------------
const FR_DAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function parseFRDate(str){ const [d,m,y]=str.split('/').map(n=>parseInt(n,10)); return new Date(y,m-1,d); }
function ymd(d){ const z=new Date(d); z.setHours(12,0,0,0); return z.toISOString().slice(0,10); }
function toFR(dStr){ const [y,m,d]=dStr.split('-'); return `${d}/${m}/${y}`; }
function daysBetween(start,end){ const out=[]; const cur=new Date(start); cur.setHours(12,0,0,0); const e=new Date(end); e.setHours(12,0,0,0); while(cur<=e){ out.push(ymd(cur)); cur.setDate(cur.getDate()+1);} return out; }
function parsePeriodeFR(txt){
  const m=(txt||'').match(/du\s(\d{2}\/\d{2}\/\d{4})\sau\s(\d{2}\/\d{2}\/\d{4})/);
  if(!m) return null;
  return { start: parseFRDate(m[1]), end: parseFRDate(m[2]) };
}


// ---------------------------
// 3bis) MODULE EMAIL — génération mailto avec sujet + corps
// ---------------------------
function formatFRDateLong(dStr){
  try{
    const d = new Date(dStr);
    const opts = { weekday:'long', day:'2-digit', month:'long', year:'numeric' };
    let s = d.toLocaleDateString('fr-FR', opts);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }catch(e){ return dStr; }
}

function formatEmailSubject(storeName, dateISO){
  return `WFC — Résultats audit ${storeName} — ${toFR(dateISO)}`;
}

function formatEmailBody({ store, date, periode, verifier, results, categories }){
  const nameById = {}; (categories||[]).forEach(c => nameById[c.id] = c.nom_categorie);
  const lines = [];
  lines.push(`Boutique : ${store}`);
  lines.push(`Date d'audit : ${toFR(date)}`);
  if(periode)   lines.push(`Période couverte : ${periode}`);
  if(verifier)  lines.push(`Vérificateur : ${verifier}`);
  lines.push('');
  lines.push('Résultats :');
  const keys = Object.keys(results||{});
  if(!keys.length){
    lines.push('- (Aucun point coché)');
  } else {
    keys.forEach(id => {
      const v = results[id] || {};
      const label = nameById[id] || id;
      let status = '—';
      if(v.status === 'done')  status = '✅ Conforme';
      if(v.status === 'error') status = '❌ Non conforme';
      lines.push(`- ${label} : ${status}`);
      if(v.status === 'error'){
        const list = Array.isArray(v.errorDates) ? v.errorDates : (v.errorDate ? [v.errorDate] : []);
        if(list.length){
          const human = list.map(ds => formatFRDateLong(ds)).join(', ');
          lines.push(`  Jours concernés : ${human}`);
        }
      }
      if(v.comment){ lines.push(`  Commentaire : ${v.comment}`); }
    });
  }
  lines.push('');
  lines.push('— Envoyé depuis WFC APP');
  return lines.join('\n');
}

function openEmailClient({ to, subject, body }){
  const mailto = `mailto:${encodeURIComponent(to||'')}?subject=${encodeURIComponent(subject||'WFC')}&body=${encodeURIComponent(body||'')}`;
  try{
    window.location.href = mailto;
  }catch(e){
    // fallback: open in new window
    window.open(mailto, '_blank');
  }
}

// ---------------------------
// 4) SUPABASE HELPERS
// ---------------------------
function getStoreId(name){ const f=storeList.find(s=>s.name===name); return f ? f.id : null; }
function getStoreCode(name){ const f=storeList.find(s=>s.name===name); return f ? f.code : ''; }

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

// ---------------------------
// 5) AGRÉGATIONS (calendrier, stats)
// ---------------------------
function computeCoveredDays(verifs){
  const set=new Set();
  (verifs||[]).forEach(v=>{
    const per = parsePeriodeFR(v.periode_couverte||'');
    if(!per) return;
    daysBetween(per.start, per.end).forEach(d=>set.add(d));
  });
  return set;
}

// Supporte errorDates[] (multi), ou fallback sur errorDate
function computeErrorDays(verifs){
  const set = new Set();
  const map = new Map(); // date => [verificationId,...]
  (verifs||[]).forEach(v=>{
    const per = parsePeriodeFR(v.periode_couverte||'');
    const d1 = per ? per.start : null;
    const d2 = per ? per.end   : null;
    const results = v.resultats || {};
    Object.values(results).forEach(val=>{
      if(!val || val.status!=='error') return;
      const list = Array.isArray(val.errorDates) ? val.errorDates : (val.errorDate ? [val.errorDate] : []);
      list.forEach(ds=>{
        if(!ds) return;
        const d = new Date(ds);
        const inRange = (!d1 || !d2) ? true : (d >= d1 && d <= d2);
        if(inRange){
          set.add(ds);
          const arr = map.get(ds) || [];
          if(arr.indexOf(v.id)===-1) arr.push(v.id);
          map.set(ds, arr);
        }
      });
    });
  });
  return { set, map };
}

function recurringErrors(verifs){
  const counts={};
  verifs.forEach(v=>{ const r=v.resultats||{}; Object.keys(r).forEach(cat=>{ if(r[cat] && r[cat].status==='error') counts[cat]=(counts[cat]||0)+1; }); });
  const nameMap={}; (categories||[]).forEach(c=>nameMap[c.id]=c.nom_categorie);
  return Object.keys(counts).map(id=>({label:nameMap[id]||id, count:counts[id]})).sort((a,b)=>b.count-a.count).slice(0,3);
}

// ---------------------------
// 6) MOBILE INFO SHEET
// ---------------------------
function openInfoSheet(titleText, bodyHtml){
  const backdrop = el('div', {className:'sheet-backdrop'});
  const sheet = el('div', {className:'sheet', html:`
    <div class="sheet-header">
      <div class="sheet-title">${titleText || 'Informations'}</div>
      <button class="sheet-close" type="button" aria-label="Fermer">✕</button>
    </div>
    <div class="sheet-body">${bodyHtml || ''}</div>
  `});
  function close(){ document.body.classList.remove('no-scroll'); backdrop.remove(); sheet.remove(); }
  backdrop.addEventListener('click', close);
  sheet.querySelector('.sheet-close').addEventListener('click', close);
  document.body.classList.add('no-scroll');
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  requestAnimationFrame(()=>{ backdrop.classList.add('show'); sheet.classList.add('show'); });
}

// =====================================================
// VUES
// =====================================================

// ---------------------------
// LOGIN
// ---------------------------
async function renderLogin(){
  appState=APP.LOGIN; app.innerHTML='';
  if(!storeList.length) await fetchStores();

  const container = el('div',{className:'container'});
  const wrap = el('div',{className:'login-wrap'});
  const card = el('div',{className:'login-card'});

  const avatar = el('div',{className:'login-avatar', html:'<img src="favicon.png" alt="logo" class="login-logo">'});
  const row1 = el('div',{className:'form-row', html:'<div class="icon-cell">🏬</div>'});
  const sel  = el('select');
  sel.innerHTML = '<option value="">Choisir une boutique</option>' + storeList.map(s=>`<option value="${s.name}">${s.name}</option>`).join('');
  row1.appendChild(sel);

  const row2 = el('div',{className:'form-row', html:'<div class="icon-cell">🔒</div>'});
  const code = el('input', {attrs:{type:'password', placeholder:'Code boutique'}});
  row2.appendChild(code);

  const err = el('div',{className:'err hidden', text:'Code incorrect'});
  const btn = el('button',{className:'login-button', text:'LOGIN'}); btn.disabled=true;

  card.append(avatar,row1,row2,err,btn);
  wrap.appendChild(card); container.appendChild(wrap); app.appendChild(container);

  function check(){
    const exp = sel.value ? getStoreCode(sel.value) : null;
    const ok = !!sel.value && !!code.value && (code.value===exp);
    const showErr = !!sel.value && !!code.value && (code.value!==exp);
    err.classList.toggle('hidden', !showErr);
    btn.disabled = !ok;
  }
  sel.addEventListener('change',check); code.addEventListener('input',check);

  btn.addEventListener('click', async ()=>{
    selectedStore = sel.value;
    selectedStoreId = getStoreId(selectedStore);
    await renderDashboard();
  });
}

// ---------------------------
// DASHBOARD
// ---------------------------
async function renderDashboard(){
  appState=APP.DASH; app.innerHTML='';
  if(!selectedStoreId) return renderLogin();
  await fetchCategories();

  const verifs = await fetchVerifs(selectedStoreId);
  const covered = computeCoveredDays(verifs);
  const { set:errorDays, map:errorDateMap } = computeErrorDays(verifs);
  const errorsTop = recurringErrors(verifs);

  const container = el('div',{className:'container'});
  const dash = el('div',{className:'dashboard'});

  // Sidebar
  const side = el('aside',{className:'sidebar'});
  side.innerHTML = `<div class="store-name" style="margin-bottom:12px; text-align:center;">${selectedStore.toUpperCase()}</div>`;
  const menu = el('div',{className:'menu'});
  const bStart = el('button',{className:'primary-lg', text:'Commencer un audit'});
  const bHist  = el('button',{className:'ghost-button', text:"Voir l'historique"});
  const bBack  = el('button',{className:'ghost-button', text:'Changer de boutique'});
  menu.append(bStart,bHist,bBack); side.appendChild(menu);

  // Content tiles
  const content = el('section',{className:'content'});
  const tAud = el('div',{className:'tile', html:`<h3>Audits réalisés</h3><div class="big">${verifs.length}</div>`});
  const tErr = el('div',{className:'tile', html:`<h3>Erreurs récurrentes</h3>${ errorsTop.length ? '<ul>'+errorsTop.map(e=>`<li>${e.label} — <b>${e.count}</b></li>`).join('')+'</ul>' : '<div>—</div>'}`});
  const tDocs = el('div',{className:'tile', html:'<h3>Documents ICC</h3><div class="muted">Consulter & imprimer</div>'});
  tDocs.style.cursor='pointer'; tDocs.addEventListener('click', ()=>renderDocs());
  content.append(tAud,tErr,tDocs);

  // Calendar
  const cal = el('div',{className:'card calendar'});
  const calHead = el('div',{className:'cal-head', html:'<div class="nav"><button class="prev">◀</button><button class="next">▶</button></div><div class="title"></div>'});
  const calBody = el('div');
  cal.append(calHead,calBody);
  const legend = el('div',{className:'calendar-legend', html:'<span class="legend-dot legend-covered"></span> Jour contrôlé <span class="legend-dot legend-error"></span> Erreur détectée'});
  cal.appendChild(legend);

  // History teaser
  const histCard = el('div',{className:'card history', html:'<h3>Historique</h3>'});
  if(!verifs.length){ histCard.innerHTML += '<div>Aucun audit.</div>'; }
  else verifs.slice(0,6).forEach(v=> histCard.appendChild(el('div',{className:'row', text:`${v.date ? toFR(v.date) : '—'} — ${v.verificateur} (${v.periode_couverte||''})`})));
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
    const table=el('table'); const thead=el('thead'); const trh=el('tr');
    ['L','M','M','J','V','S','D'].forEach(d=>trh.appendChild(el('th',{text:d}))); thead.appendChild(trh);
    const tbody=el('tbody'); const first=new Date(y,m,1); const start=(first.getDay()+6)%7; const days=new Date(y,m+1,0).getDate();
    let day=1;
    for(let r=0;r<6;r++){
      const tr=el('tr');
      for(let c=0;c<7;c++){
        const td=el('td');
        if((r===0&&c<start)||day>days){ td.innerHTML='&nbsp;'; }
        else{
          const d=String(day).padStart(2,'0'); const ds=`${y}-${String(m+1).padStart(2,'0')}-${d}`;
          const span=el('span',{text:d});
          if(covered.has(ds)) td.classList.add('day-covered');
          if(errorDays.has(ds)){
            td.classList.add('day-error');
            const arr = errorDateMap.get ? errorDateMap.get(ds) : null;
            if(arr && arr.length){
              td.classList.add('clickable'); td.title='Voir le contrôle du '+ds;
              td.addEventListener('click', ()=>{ if(arr.length===1) renderHistoryDetail(arr[0]); else renderHistoryList(); });
            }
          }
          td.appendChild(span); day++;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.append(thead,tbody); calBody.appendChild(table);
  }
  calHead.querySelector('.prev').onclick=()=>{ m--; if(m<0){m=11;y--;} renderMonth(); };
  calHead.querySelector('.next').onclick=()=>{ m++; if(m>11){m=0;y++;} renderMonth(); };
  renderMonth();

  // Actions
  bBack.onclick = ()=>renderLogin();
  bHist.onclick = ()=>renderHistoryList();
  bStart.onclick = ()=>renderPreCheck();
}

// ---------------------------
// PRÉ-CHECK (date/période/vérificateur)
// ---------------------------
async function renderPreCheck(){
  appState=APP.PRE; app.innerHTML='';
  if(!selectedStoreId) return renderLogin();
  await fetchCategories();

  function badge(text){ return el('span',{text, style:{padding:'8px 12px', background:'#f1f5ff', border:'1px solid #e5e7eb', borderRadius:'999px', fontWeight:'600', fontSize:'14px'}}); }
  const dateISO = ymd(new Date());

  function computePeriod(iso){
    const d = new Date(iso); const end = new Date(d); end.setDate(end.getDate()-1);
    const start = new Date(end); start.setDate(start.getDate()-6);
    return { startISO: ymd(start), endISO: ymd(end), startFR: toFR(ymd(start)), endFR: toFR(ymd(end)) };
  }
  let per = computePeriod(dateISO);

  const wrap = el('div',{className:'history-wrap'});
  const header = el('div',{className:'history-header'});
  const title = el('h2',{text:`Informations avant vérification — ${selectedStore}`});
  const back = el('button',{className:'ghost-button', text:'← Retour', on:{click:()=>renderDashboard()}});
  const emailBtn = el('button',{className:'ghost-button', text:'✉️ Envoyer par mail'});
emailBtn.addEventListener('click', ()=>{
  const subject = formatEmailSubject(selectedStore, (data && data.date) ? data.date : new Date());
  const body = formatEmailBody({
    store: selectedStore,
    date: (data && data.date) ? data.date : ymd(new Date()),
    periode: data ? data.periode_couverte : '',
    verifier: data ? data.verificateur : '',
    results: data ? (data.resultats || {}) : {},
    categories
  });
  openEmailClient({ subject, body });
});
header.append(title, back, emailBtn);

  const card = el('div',{className:'card pre-card'});
  const grid = el('div',{className:'meta-grid'});

  // Date audit
  const colDate = el('div',{});
  colDate.innerHTML = '<div class="label">Date d\'audit</div>';
  const dateInput = el('input',{attrs:{type:'date'}, className:'input-pill'}); dateInput.value=dateISO;
  colDate.appendChild(dateInput); grid.appendChild(colDate);

  // Période (badges non éditables)
  const colFrom = el('div',{}); colFrom.innerHTML = '<div class="label label-period">Période du</div>'; const fromBadge = badge(per.startFR); colFrom.appendChild(fromBadge); grid.appendChild(colFrom);
  const colTo   = el('div',{}); colTo.innerHTML   = '<div class="label label-period">au</div>';    const toBadgeEl  = badge(per.endFR);   colTo.appendChild(toBadgeEl);    grid.appendChild(colTo);

  // Vérificateur
  const colWho = el('div',{}); colWho.innerHTML = '<div class="label">Vérificateur</div>';
  const whoInput = el('input',{attrs:{type:'text', placeholder:'Votre prénom'}, className:'input-pill'});
  colWho.appendChild(whoInput); grid.appendChild(colWho);

  const actions = el('div',{}); actions.style.marginTop='12px';
  const startBtn = el('button',{className:'primary-lg', text:'Démarrer la checklist'}); startBtn.disabled=true;
  actions.appendChild(startBtn);

  card.append(grid, actions);
  wrap.append(header, card);
  app.appendChild(wrap);

  // Enable button
  function updateBtn(){ startBtn.disabled = !whoInput.value.trim(); }
  whoInput.addEventListener('input', updateBtn); updateBtn();

  // Update period on change
  dateInput.addEventListener('change', ()=>{ per = computePeriod(dateInput.value); fromBadge.textContent=per.startFR; toBadgeEl.textContent=per.endFR; });

  startBtn.onclick = async ()=>{
    const d = dateInput.value; const who = whoInput.value.trim();
    if(!d || !who){ alert('Merci de renseigner la date et le prénom.'); return; }

    const { data:existing } = await supabase.from('verifications').select('id').eq('boutique_id', selectedStoreId).eq('date', d).maybeSingle();
    if(existing){
      if(confirm('Une vérification existe déjà pour cette date. Voulez-vous consulter le détail ?')) return renderHistoryDetail(existing.id);
      return;
    }
    const periode = `du ${per.startFR} au ${per.endFR}`;
    const meta = { date:d, from: per.startISO, to: per.endISO, who, periode };
    renderChecklist(meta);
  };
}

// ---------------------------
// CHECKLIST
// ---------------------------
function renderChecklist(meta){
  appState=APP.CHECK; app.innerHTML='';

  const wrap = el('div',{className:'history-wrap'});
  const header = el('div',{className:'history-header'});
  const title = el('h2',{text:`Checklist — ${selectedStore} (${toFR(meta.date)})`});
  const back = el('button',{className:'ghost-button', text:'← Annuler', on:{click:()=>renderDashboard()}});
  const emailBtn = el('button',{className:'ghost-button', text:'✉️ Envoyer par mail'});
emailBtn.addEventListener('click', ()=>{
  const subject = formatEmailSubject(selectedStore, (data && data.date) ? data.date : new Date());
  const body = formatEmailBody({
    store: selectedStore,
    date: (data && data.date) ? data.date : ymd(new Date()),
    periode: data ? data.periode_couverte : '',
    verifier: data ? data.verificateur : '',
    results: data ? (data.resultats || {}) : {},
    categories
  });
  openEmailClient({ subject, body });
});
header.append(title, back, emailBtn);

  const form = el('div',{className:'result-list'});
  const activeCats = (categories||[]).filter(c=>c.actif!==false);
  const fields = [];

  function buildDatePickerList(){
    const wrap = el('div',{});
    const list = el('div',{});
    const addBtn = el('button',{className:'ghost-button', text:'+ Ajouter un jour'});
    addBtn.type='button';

    function buildOne(){
      const line = el('div',{style:{display:'flex', gap:'6px', alignItems:'center', marginBottom:'6px'}});
      const select = el('select',{style:{flex:'1'}});
      const per = parsePeriodeFR(meta.periode||'');
      const options = (per && per.start && per.end) ? daysBetween(per.start, per.end) : [meta.date];
      options.forEach(d=>{
        const opt = el('option'); opt.value=d;
        const label = new Date(d).toLocaleDateString('fr-FR',{weekday:'long', day:'2-digit', month:'long', year:'numeric'});
        opt.textContent = label.charAt(0).toUpperCase()+label.slice(1);
        select.appendChild(opt);
      });
      select.value = options.indexOf(meta.date)>=0 ? meta.date : options[0];
      const del = el('button',{className:'ghost-button', text:'🗑'}); del.type='button'; del.style.padding='4px 8px';
      del.addEventListener('click', ()=> line.remove());
      line.append(select, del);
      return line;
    }

    // label
    const lbl = el('div',{text:'Jours de détection (dans la période)'}); Object.assign(lbl.style,{fontSize:'12px', color:'#475569', margin:'8px 0 4px'});
    wrap.append(lbl, list, addBtn);

    // ensure at least one picker
    function ensure(){ if(!list.querySelector('select')) list.appendChild(buildOne()); }
    ensure();
    addBtn.addEventListener('click', ()=> list.appendChild(buildOne()));

    return { root:wrap, getValues: ()=> Array.from(list.querySelectorAll('select')).map(s=>s.value).filter(Boolean) };
  }

  activeCats.forEach(cat=>{
    const row = el('div',{className:'result-row'});
    const title = el('div',{className:'res-title', text:cat.nom_categorie});

    if(cat.description){
      const infoWrap = el('span',{className:'info-wrap'});
      const info = el('span',{className:'info-icon', text:'ℹ️'});
      const tip  = el('div',{className:'tooltip', text:cat.description||''});
      infoWrap.append(info, tip);

      if(isMobile()){
        info.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          const html = `<div class="tip-lines">${(cat.description||'').replace(/\\n/g,'<br>')}</div>`;
          openInfoSheet(cat.nom_categorie||'Informations', html);
        });
      } else {
        const toggle = ()=> tip.classList.toggle('show');
        info.addEventListener('mouseenter', ()=> tip.classList.add('show'));
        info.addEventListener('mouseleave', ()=> tip.classList.remove('show'));
        info.addEventListener('click', toggle);
      }
      title.appendChild(infoWrap);
    }

    const control = el('div',{}); Object.assign(control.style,{display:'flex', gap:'10px', flexWrap:'wrap'});
    const ok = el('button',{className:'ghost-button', text:'✅ Conforme'}); ok.type='button';
    const ko = el('button',{className:'ghost-button', text:'❌ Non conforme'}); ko.type='button';
    const comment = el('input',{attrs:{type:'text', placeholder:'Commentaire (optionnel)'}}); comment.style.flex='1';

    let status = null;
    const datesPicker = buildDatePickerList();
    const dateWrap = datesPicker.root; dateWrap.style.display='none';

    function setSel(s){
      status=s;
      ok.style.background = s==='done' ? '#f0fff4' : '#fff';
      ko.style.background = s==='error' ? '#fff0f0' : '#fff';
      dateWrap.style.display = s==='error' ? 'block' : 'none';
    }
    ok.addEventListener('click', ()=>setSel('done'));
    ko.addEventListener('click', ()=>setSel('error'));

    control.append(ok, ko, comment, dateWrap);
    row.append(title, control);
    form.appendChild(row);

    fields.push({
      id: cat.id,
      get: ()=>{
        const base = { status: status, comment: (comment.value||'').trim() };
        if(status==='error'){
          // unique list, keep order
          const values = datesPicker.getValues();
          const seen = new Set(); const dates = values.filter(v=> (seen.has(v)?false:(seen.add(v),true)));
          return Object.assign(base, { errorDates: dates, errorDate: dates[0] });
        }
        return base;
      }
    });
  });

  const bottom = el('div',{}); Object.assign(bottom.style,{display:'flex', gap:'10px', marginTop:'12px'});
  const saveBtn = el('button',{className:'primary-lg', text:'Enregistrer la vérification'});
  bottom.appendChild(saveBtn);

  wrap.append(header, form, bottom);
  app.appendChild(wrap);

  saveBtn.onclick = async ()=>{
    const results = {}; fields.forEach(f=>{ const v=f.get(); if(v.status) results[f.id]=v; });
    if(Object.keys(results).length===0 && !confirm('Aucun point coché. Enregistrer quand même ?')) return;

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
    const res = await fetch(fnUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok){
      let err={}; try{ err = await res.json(); }catch(e){}
      alert("Échec de l'enregistrement : " + (err.error || res.status));
      console.error(err);
      return;
    }
    const sendNow = confirm(`Vérification enregistrée ✅

Voulez-vous envoyer les résultats par e‑mail maintenant ?`);
if(sendNow){
  const subject = formatEmailSubject(selectedStore, meta.date);
  const body = formatEmailBody({
    store: selectedStore,
    date: meta.date,
    periode: meta.periode,
    verifier: meta.who,
    results,
    categories
  });
  openEmailClient({ subject, body });
}
renderDashboard();
  };
}

// ---------------------------
// DOCUMENTS
// ---------------------------
const DOCS = (window.DOCS || []);

function renderDocs(){
  appState=APP.VIEW; app.innerHTML='';
  const wrap = el('div',{className:'history-wrap'});
  const header = el('div',{className:'history-header'});
  const title = el('h2',{text:'Documents ICC'});
  const back = el('button',{className:'ghost-button', text:'← Retour', on:{click:()=>renderDashboard()}});
  const emailBtn = el('button',{className:'ghost-button', text:'✉️ Envoyer par mail'});
emailBtn.addEventListener('click', ()=>{
  const subject = formatEmailSubject(selectedStore, (data && data.date) ? data.date : new Date());
  const body = formatEmailBody({
    store: selectedStore,
    date: (data && data.date) ? data.date : ymd(new Date()),
    periode: data ? data.periode_couverte : '',
    verifier: data ? data.verificateur : '',
    results: data ? (data.resultats || {}) : {},
    categories
  });
  openEmailClient({ subject, body });
});
header.append(title, back, emailBtn);

  const list = el('div',{className:'doc-list'});
  if(!DOCS.length){
    list.appendChild(el('div',{className:'muted', text:'Aucun document défini pour le moment.'}));
  }else{
    DOCS.forEach(d=>{
      const row = el('div',{className:'doc-row'});
      const name = el('div',{className:'doc-name', text:(d.title||'Document')});
      const actions = el('div',{className:'doc-actions'});
      const openBtn = el('button',{className:'ghost-button', text:'Ouvrir', on:{click:()=>{ if(d.url) window.open(d.url,'_blank'); }}});
      const printBtn= el('button',{className:'ghost-button', text:'Imprimer', on:{click:()=>{ if(d.url){ const w=window.open(d.url,'_blank'); if(w){ w.addEventListener('load', ()=>{ try{ w.print(); }catch(e){} }); } } }}});
      actions.append(openBtn, printBtn);
      row.append(name, actions);
      list.appendChild(row);
    });
  }

  wrap.append(header, list);
  app.appendChild(wrap);
}

// ---------------------------
// HISTORIQUE (liste)
// ---------------------------
async function renderHistoryList(){
  appState=APP.HIST; app.innerHTML='';
  if(!selectedStoreId) return renderLogin();
  if(!categories.length) await fetchCategories();

  const wrap = el('div',{className:'history-wrap'});
  const header = el('div',{className:'history-header'});
  const title = el('h2',{text:`Historique — ${selectedStore}`});
  const back = el('button',{className:'ghost-button', text:'← Retour au dashboard', on:{click:()=>renderDashboard()}});
  const emailBtn = el('button',{className:'ghost-button', text:'✉️ Envoyer par mail'});
emailBtn.addEventListener('click', ()=>{
  const subject = formatEmailSubject(selectedStore, (data && data.date) ? data.date : new Date());
  const body = formatEmailBody({
    store: selectedStore,
    date: (data && data.date) ? data.date : ymd(new Date()),
    periode: data ? data.periode_couverte : '',
    verifier: data ? data.verificateur : '',
    results: data ? (data.resultats || {}) : {},
    categories
  });
  openEmailClient({ subject, body });
});
header.append(title, back, emailBtn);

  const { data, error } = await supabase.from('verifications').select('*').eq('boutique_id', selectedStoreId).order('date',{ascending:false});
  if(error){
    wrap.append(header, el('div',{text:"Erreur de chargement de l'historique."}));
    app.appendChild(wrap); return;
  }
  if(!data || !data.length){
    wrap.append(header, el('div',{className:'empty', text:'Aucun audit pour le moment.'}));
    app.appendChild(wrap); return;
  }

  const table = el('table',{className:'history-table'});
  table.innerHTML = `
    <thead><tr><th>Date</th><th>Période couverte</th><th>Vérificateur</th><th>Commentaires</th></tr></thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody');

  data.forEach(v=>{
    const tr = el('tr',{});
    tr.innerHTML = `
      <td data-label="Date">${v.date ? toFR(v.date) : '—'}</td>
      <td data-label="Période couverte">${v.periode_couverte || '—'}</td>
      <td data-label="Vérificateur">${v.verificateur || '—'}</td>
      <td data-label="Commentaires" class="muted">${(v.commentaire || '').slice(0,80)}</td>`;
    tr.style.cursor='pointer'; tr.addEventListener('click', ()=>renderHistoryDetail(v.id));
    tbody.appendChild(tr);
  });

  wrap.append(header, table);
  app.appendChild(wrap);
}

// ---------------------------
// HISTORIQUE (détail)
// ---------------------------
async function renderHistoryDetail(verificationId){
  appState=APP.VIEW; app.innerHTML='';
  if(!selectedStoreId) return renderLogin();

  const { data, error } = await supabase.from('verifications').select('*').eq('id', verificationId).single();

  const wrap = el('div',{className:'history-wrap'});
  const header = el('div',{className:'history-header'});
  const title = el('h2',{text:`Audit du ${ (data && data.date) ? toFR(data.date) : '—'} — ${selectedStore}`});
  const back = el('button',{className:'ghost-button', text:"← Retour à l'historique", on:{click:()=>renderHistoryList()}});
  const emailBtn = el('button',{className:'ghost-button', text:'✉️ Envoyer par mail'});
emailBtn.addEventListener('click', ()=>{
  const subject = formatEmailSubject(selectedStore, (data && data.date) ? data.date : new Date());
  const body = formatEmailBody({
    store: selectedStore,
    date: (data && data.date) ? data.date : ymd(new Date()),
    periode: data ? data.periode_couverte : '',
    verifier: data ? data.verificateur : '',
    results: data ? (data.resultats || {}) : {},
    categories
  });
  openEmailClient({ subject, body });
});
header.append(title, back, emailBtn);

  if(error || !data){
    wrap.append(header, el('div',{text:'Impossible de charger le détail.'}));
    app.appendChild(wrap); return;
  }

  const meta = el('div',{className:'card'});
  meta.innerHTML = `
    <h3>Infos</h3>
    <div class="meta-grid">
      <div><div class="label">Date</div><div>${data.date ? toFR(data.date) : '—'}</div></div>
      <div><div class="label">Période couverte</div><div>${data.periode_couverte || '—'}</div></div>
      <div><div class="label">Vérificateur</div><div>${data.verificateur || '—'}</div></div>
    </div>`;

  const results = el('div',{className:'card', html:'<h3>Résultats</h3>'});
  const list = el('div',{className:'result-list'});
  const catMap={}; (categories||[]).forEach(c=>catMap[c.id]=c.nom_categorie);
  const r = data.resultats || {};
  const items = Object.keys(r);

  if(!items.length){
    list.innerHTML = '<div class="empty">Aucun résultat enregistré.</div>';
  } else {
    items.forEach(id=>{
      const val = r[id];
      const line = el('div',{className:'result-row'});
      const label = catMap[id] || id;
      let badge = '—';
      if (val && val.status === 'done')  badge = '✅ Conforme';
      else if (val && val.status === 'error') badge = '❌ Non conforme';

      // dates d'erreur (multi)
      let dateInfo = '';
      if(val && val.status==='error'){
        const listDates = Array.isArray(val.errorDates) ? val.errorDates : (val.errorDate ? [val.errorDate] : []);
        if(listDates.length){
          const human = listDates.map(d=>{
            const l = new Date(d).toLocaleDateString('fr-FR',{weekday:'long', day:'2-digit', month:'long', year:'numeric'});
            return l.charAt(0).toUpperCase()+l.slice(1);
          }).join(', ');
          dateInfo = `<div class="comment">Jours concernés: ${human}</div>`;
        }
      }
      const comment = (val && val.comment) ? `<div class="comment">${val.comment}</div>` : '';

      line.innerHTML = `<div class="res-title">${label}</div><div class="res-badge">${badge}</div>${dateInfo}${comment}`;
      list.appendChild(line);
    });
  }

  results.appendChild(list);
  wrap.append(header, meta, results);
  app.appendChild(wrap);
}

// ---------------------------
// BOOT
// ---------------------------
async function init(){ try{ await renderLogin(); }catch(e){ console.error(e);} }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
