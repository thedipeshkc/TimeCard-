'use strict';
/* ── TimeCard app.js ── */

const DB_KEY    = 'timecard_v5';
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_S    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HOURS12   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINS      = Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
const TAB_TITLES = {calculator:'Calculator',history:'History',calendar:'Calendar',settings:'Settings'};

// ── State ─────────────────────────────────────────────────────
let S = {
  user: null, users: {}, tab: 'calculator',
  // Calculator: list of shift rows
  rows: [ mkRow() ],
  settings: { rate:'', otWeek:40 },
  // Clock-in
  clockIn: null, clockTimer: null,
  // Calendar
  calY: new Date().getFullYear(), calM: new Date().getMonth()+1,
  calSel: null,
  // History
  histFilter: 'all',
  rangeFrom: '', rangeTo: '',
  // Login
  loginMode: 'login', loginError: '',
};

function mkRow(){
  return { id: genId(), date: todayStr(), inH:'9', inM:'00', inP:'AM', outH:'5', outM:'00', outP:'PM' };
}

// ── DB ────────────────────────────────────────────────────────
function loadDB(){ try{ const d=JSON.parse(localStorage.getItem(DB_KEY)||'{}'); if(d.users) S.users=d.users; }catch(e){} }
function saveDB(){ try{ localStorage.setItem(DB_KEY,JSON.stringify({users:S.users})); }catch(e){} }
function getEntries(){ return S.users[S.user]?.entries||[]; }
function upsertEntry(e){
  if(!S.users[S.user]) S.users[S.user]={entries:[]};
  const arr=S.users[S.user].entries;
  const i=arr.findIndex(x=>x.id===e.id);
  if(i>=0) arr[i]=e; else arr.push(e);
  saveDB();
}
function removeEntry(id){ const u=S.users[S.user]; if(u) u.entries=u.entries.filter(e=>e.id!==id); saveDB(); }
function getSettings(){ return S.users[S.user]?.settings||{rate:'',otWeek:40}; }
function saveSettings(s){ if(!S.users[S.user]) S.users[S.user]={entries:[]}; S.users[S.user].settings=s; saveDB(); }

// ── Utils ─────────────────────────────────────────────────────
function genId(){ return Date.now()+'-'+(Math.random()*99999|0); }
function todayStr(){ return new Date().toISOString().split('T')[0]; }
function hashPass(p){ let h=0; for(let i=0;i<p.length;i++){h=((h<<5)-h)+p.charCodeAt(i);h|=0;} return h.toString(36); }
function $id(id){ return document.getElementById(id); }
function $$(sel,ctx){ return [...(ctx||document).querySelectorAll(sel)]; }
function div(cls,html){ const d=document.createElement('div'); d.className=cls; if(html!=null) d.innerHTML=html; return d; }
function initials(n){ return n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function isoDate(d){ return d.toISOString().split('T')[0]; }

function to24(h,m,ap){
  let hh=parseInt(h)||0, mm=parseInt(m)||0;
  if(ap==='AM'){ if(hh===12) hh=0; } else { if(hh!==12) hh+=12; }
  return hh*60+mm;
}
function rowMins(r){
  if(!r.inH||!r.outH) return 0;
  let s=to24(r.inH,r.inM,r.inP), e=to24(r.outH,r.outM,r.outP);
  if(e<=s) e+=1440;
  return Math.max(0,e-s);
}
function fmt12(totalMins){
  let h=Math.floor(totalMins/60)%24, m=totalMins%60;
  const ap=h<12?'AM':'PM';
  if(h===0)h=12; else if(h>12)h-=12;
  return h+':'+(String(m).padStart(2,'0'))+' '+ap;
}
function fmtDur(m){
  if(!m||m<=0) return '0m';
  const h=Math.floor(m/60), mn=Math.round(m%60);
  if(h===0) return mn+'m';
  if(mn===0) return h+'h';
  return h+'h '+mn+'m';
}
function plainDur(m){
  if(!m||m<=0) return 'no time';
  const h=Math.floor(m/60), mn=Math.round(m%60);
  if(h===0) return mn+' min';
  if(mn===0) return h+' hr'+(h!==1?'s':'');
  return h+' hr'+(h!==1?'s':'')+' '+mn+' min';
}
function fmtMoney(n){ return '$'+parseFloat(n).toFixed(2); }
function fmtElapsed(ms){
  const s=Math.floor(ms/1000),h=Math.floor(s/3600),min=Math.floor((s%3600)/60),sec=s%60;
  return (h?h+':':'')+(String(min).padStart(h?2:1,'0'))+':'+(String(sec).padStart(2,'0'));
}

// ── Time select builder ───────────────────────────────────────
function timeSel(opts, val, cls, data){
  const s=document.createElement('select');
  s.className='ts '+cls;
  if(data) Object.entries(data).forEach(([k,v])=>s.dataset[k]=v);
  opts.forEach(o=>{ const op=document.createElement('option'); op.value=o; op.textContent=o; if(String(o)===String(val)) op.selected=true; s.appendChild(op); });
  return s;
}

// ── Clock-in ──────────────────────────────────────────────────
function startTimer(){ if(S.clockTimer) clearInterval(S.clockTimer); S.clockTimer=setInterval(tickClock,1000); tickClock(); }
function stopTimer(){  if(S.clockTimer){ clearInterval(S.clockTimer); S.clockTimer=null; } }
function tickClock(){
  const te=$id('ci-timer'), le=$id('ci-label'), dot=document.querySelector('.pulse-dot'), btn=$id('btn-ci');
  if(S.clockIn){
    if(te) te.textContent=fmtElapsed(Date.now()-S.clockIn);
    if(le) le.textContent='Clocked in';
    if(dot) dot.classList.add('active');
    if(btn){ btn.textContent='Clock Out'; btn.classList.add('clocked-in'); }
  } else {
    if(te) te.textContent='';
    if(le) le.textContent='Not clocked in';
    if(dot) dot.classList.remove('active');
    if(btn){ btn.textContent='Clock In'; btn.classList.remove('clocked-in'); }
  }
}
function toggleClock(){
  if(!S.clockIn){ S.clockIn=Date.now(); startTimer(); }
  else {
    const out=Date.now(), mins=Math.round((out-S.clockIn)/60000);
    upsertEntry({id:genId(),clockIn:new Date(S.clockIn).toISOString(),clockOut:new Date(out).toISOString(),durationMins:mins,note:'',source:'clockin'});
    S.clockIn=null; stopTimer(); tickClock();
    toast('Shift saved — '+plainDur(mins));
    if(S.tab==='history'||S.tab==='calendar') renderTab();
  }
}

// ── Live clock ────────────────────────────────────────────────
function startClock(){
  function tick(){
    const c=$id('live-clock'); if(!c) return;
    const n=new Date(); let h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();
    const ap=h<12?'AM':'PM'; if(h===0)h=12; else if(h>12)h-=12;
    c.textContent=h+':'+(String(m).padStart(2,'0'))+':'+(String(s).padStart(2,'0'))+' '+ap;
  }
  tick(); setInterval(tick,1000);
}

// ── Toast ─────────────────────────────────────────────────────
let _tt=null;
function toast(msg){
  let t=$id('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:0.82rem;font-weight:500;transition:all 0.25s;pointer-events:none;background:var(--bg-overlay);border:1px solid var(--border-mid);color:var(--text-primary);font-family:var(--font-sans)'; document.body.appendChild(t); }
  t.textContent=msg; t.style.opacity='1'; t.style.transform='translateY(0)';
  if(_tt) clearTimeout(_tt);
  _tt=setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(8px)'; },2800);
}

// ── Export CSV ────────────────────────────────────────────────
function exportCSV(){
  const entries=getEntries(); if(!entries.length){ toast('No entries to export'); return; }
  const sets=getSettings(), rate=parseFloat(sets.rate)||0;
  const rows=[['Date','Day','Clock In','Clock Out','Hours','Minutes','Note',rate?'Pay ($)':''].filter(Boolean)];
  [...entries].sort((a,b)=>new Date(a.clockIn)-new Date(b.clockIn)).forEach(e=>{
    const ci=new Date(e.clockIn), co=new Date(e.clockOut);
    const row=[ci.toLocaleDateString(),DAYS_LONG[ci.getDay()],fmt12(ci.getHours()*60+ci.getMinutes()),fmt12(co.getHours()*60+co.getMinutes()),(e.durationMins/60).toFixed(2),e.durationMins,e.note||''];
    if(rate) row.push((e.durationMins/60*rate).toFixed(2));
    rows.push(row);
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='timecard.csv'; a.click();
  URL.revokeObjectURL(url); toast('Exported!');
}

// ── Auth ──────────────────────────────────────────────────────
function renderLogin(){
  $id('login-screen').classList.remove('hidden');
  $id('app').classList.add('hidden');
  const isLogin=S.loginMode==='login';
  $id('login-title').textContent=isLogin?'Welcome back':'Create account';
  $id('login-sub').textContent=isLogin?'Sign in to track your hours.':'Free account — everything stays on your device.';
  $id('login-submit').textContent=isLogin?'Sign in':'Create account';
  const err=$id('login-error'); err.classList.toggle('hidden',!S.loginError); err.textContent=S.loginError||'';
  $id('login-fields').innerHTML=`
    ${!isLogin?`<div class="field"><label>Your name</label><input id="li-name" type="text" placeholder="Full name" autocomplete="name"/></div>`:''}
    <div class="field"><label>Email</label><input id="li-email" type="email" placeholder="you@email.com" autocomplete="email"/></div>
    <div class="field"><label>Password</label><input id="li-pass" type="password" placeholder="••••••••"/></div>`;
  $id('login-toggle-text').innerHTML=isLogin
    ?`No account? <button id="li-toggle">Register free</button>`
    :`Have an account? <button id="li-toggle">Sign in</button>`;
  $id('login-submit').onclick=doLogin;
  $id('li-pass').onkeydown=e=>{ if(e.key==='Enter') doLogin(); };
  $id('li-toggle').onclick=()=>{ S.loginMode=isLogin?'register':'login'; S.loginError=''; renderLogin(); };
}
function doLogin(){
  const email=$id('li-email').value.trim().toLowerCase(), pass=$id('li-pass').value;
  if(S.loginMode==='register'){
    const name=$id('li-name').value.trim();
    if(!name||!email||!pass){ S.loginError='All fields required.'; renderLogin(); return; }
    if(S.users[email]){ S.loginError='Email already registered.'; renderLogin(); return; }
    S.users[email]={name,passHash:hashPass(pass),entries:[]}; saveDB();
    S.user=email; S.loginError=''; launchApp();
  } else {
    if(!email||!pass){ S.loginError='Enter email and password.'; renderLogin(); return; }
    const u=S.users[email];
    if(!u||u.passHash!==hashPass(pass)){ S.loginError='Invalid email or password.'; renderLogin(); return; }
    S.user=email; S.loginError=''; launchApp();
  }
}
function launchApp(){
  $id('login-screen').classList.add('hidden');
  $id('app').classList.remove('hidden');
  const u=S.users[S.user];
  $id('sidebar-name').textContent=u?.name||S.user;
  $id('sidebar-email').textContent=S.user;
  $id('sidebar-avatar').textContent=initials(u?.name||S.user);
  const sets=getSettings(); S.settings={...sets};
  startClock(); if(S.clockIn) startTimer(); renderTab();
}

// ── Nav ───────────────────────────────────────────────────────
function setTab(tab){
  S.tab=tab;
  $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $id('topbar-title').textContent=TAB_TITLES[tab]||tab;
  renderTab();
  $id('sidebar').classList.remove('open');
  $id('sidebar-overlay').classList.add('hidden');
}
function renderTab(){
  const c=$id('tab-content'); c.innerHTML='';
  const fns={calculator:renderCalculator, history:renderHistory, calendar:renderCalendar, settings:renderSettings};
  if(fns[S.tab]) c.appendChild(fns[S.tab]());
}

// ══════════════════════════════════════════════════════════════
//  CALCULATOR
// ══════════════════════════════════════════════════════════════
function renderCalculator(){
  const wrap=div('calc-wrap');
  const sets=S.settings;
  const rate=parseFloat(sets.rate)||0, otW=parseFloat(sets.otWeek)||40;

  // ── Rate bar ──
  const rateBar=div('card rate-bar');
  rateBar.innerHTML=`
    <div class="rate-row">
      <div class="field">
        <label>Hourly Rate ($)</label>
        <input type="number" id="cs-rate" value="${sets.rate||''}" placeholder="e.g. 15.00" min="0" step="0.01" inputmode="decimal"/>
      </div>
      <div class="field">
        <label>OT after (hrs/week)</label>
        <input type="number" id="cs-ot" value="${sets.otWeek||40}" min="1" inputmode="numeric"/>
      </div>
    </div>`;
  rateBar.querySelector('#cs-rate').addEventListener('input',e=>{ S.settings.rate=e.target.value; saveSettings(S.settings); reCalc(); });
  rateBar.querySelector('#cs-ot').addEventListener('input',e=>{ S.settings.otWeek=parseFloat(e.target.value)||40; saveSettings(S.settings); reCalc(); });
  wrap.appendChild(rateBar);

  // ── Shift rows ──
  const shiftCard=div('card shift-card');
  shiftCard.innerHTML=`<div class="shift-card-title">Your Shifts — tap any date or time to edit</div>`;

  S.rows.forEach((row,idx)=>{
    const mins=rowMins(row);
    const rowDiv=div('shift-row'+(mins>0?' shift-has-total':''));

    // Date + day name
    const d=row.date?new Date(row.date+'T12:00:00'):null;
    const dayName=d?DAYS_LONG[d.getDay()]:'';

    rowDiv.innerHTML=`
      <div class="sr-top">
        <div class="sr-date-col">
          <label class="sr-lbl">Date</label>
          <input type="date" class="sr-date big-date" value="${row.date||''}" data-id="${row.id}"/>
          ${dayName?`<div class="sr-dayname">${dayName}</div>`:''}
        </div>
        <button class="sr-del" data-id="${row.id}" title="Remove">×</button>
      </div>
      <div class="sr-times">
        <div class="sr-time-col">
          <label class="sr-lbl">Clock In</label>
          <div class="sr-picker" id="in-${row.id}"></div>
        </div>
        <div class="sr-sep-arrow">→</div>
        <div class="sr-time-col">
          <label class="sr-lbl">Clock Out</label>
          <div class="sr-picker" id="out-${row.id}"></div>
        </div>
      </div>
      <div class="sr-total-row">
        ${mins>0
          ? `<span class="sr-total-big">${fmtDur(mins)}</span>
             <span class="sr-total-plain">${plainDur(mins)}</span>
             ${rate>0?`<span class="sr-total-pay">${fmtMoney(mins/60*rate)}</span>`:''}`
          : `<span class="sr-total-empty">— set times above —</span>`}
      </div>`;

    // Inject time pickers after innerHTML
    const inDiv=rowDiv.querySelector('#in-'+row.id);
    const outDiv=rowDiv.querySelector('#out-'+row.id);

    const ih=timeSel(HOURS12,row.inH,'ts-h',{id:row.id,f:'inH'});
    const im=timeSel(MINS,row.inM,'ts-m',{id:row.id,f:'inM'});
    const ip=timeSel(['AM','PM'],row.inP,'ts-ap',{id:row.id,f:'inP'});
    const colon1=document.createElement('span'); colon1.className='ts-colon'; colon1.textContent=':';
    inDiv.append(ih,colon1,im,ip);

    const oh=timeSel(HOURS12,row.outH,'ts-h',{id:row.id,f:'outH'});
    const om=timeSel(MINS,row.outM,'ts-m',{id:row.id,f:'outM'});
    const op=timeSel(['AM','PM'],row.outP,'ts-ap',{id:row.id,f:'outP'});
    const colon2=document.createElement('span'); colon2.className='ts-colon'; colon2.textContent=':';
    outDiv.append(oh,colon2,om,op);

    shiftCard.appendChild(rowDiv);
  });

  // Add row button
  const addBtn=document.createElement('button');
  addBtn.className='btn add-shift-btn';
  addBtn.innerHTML=`<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Add another shift`;
  addBtn.addEventListener('click',()=>{ S.rows.push(mkRow()); reCalc(); });
  shiftCard.appendChild(addBtn);
  wrap.appendChild(shiftCard);

  // ── Total summary ──
  const totalMins=S.rows.reduce((s,r)=>s+rowMins(r),0);
  if(totalMins>0){
    const totalH=totalMins/60;
    const regH=Math.min(totalH,otW), otH=Math.max(0,totalH-otW);
    const totalPay=regH*rate+otH*rate*1.5;

    const sumCard=div('card sum-card');
    sumCard.innerHTML=`
      <div class="sum-big-num">${fmtDur(totalMins)}</div>
      <div class="sum-big-plain">${plainDur(totalMins)}</div>
      <div class="sum-grid">
        <div class="sum-item">
          <div class="sum-item-label">Regular</div>
          <div class="sum-item-val">${fmtDur(regH*60)}</div>
          ${rate>0?`<div class="sum-item-sub">${fmtMoney(regH*rate)}</div>`:''}
        </div>
        <div class="sum-item${otH>0?' sum-ot':''}">
          <div class="sum-item-label">Overtime</div>
          <div class="sum-item-val">${otH>0?fmtDur(otH*60):'None'}</div>
          ${rate>0&&otH>0?`<div class="sum-item-sub">${fmtMoney(otH*rate*1.5)} (1.5×)</div>`:''}
        </div>
        ${rate>0?`
        <div class="sum-item sum-pay">
          <div class="sum-item-label">Est. Pay</div>
          <div class="sum-item-val">${fmtMoney(totalPay)}</div>
          <div class="sum-item-sub">@ ${fmtMoney(rate)}/hr</div>
        </div>`:''}
      </div>
      <div class="sum-plain-text">
        You worked <strong>${plainDur(totalMins)}</strong>${otH>0?`, including <strong>${plainDur(otH*60)} overtime</strong>`:''}${rate>0?`. Est. pay: <strong>${fmtMoney(totalPay)}</strong>`:''}.
      </div>
      <div class="sum-actions">
        <button class="btn btn-primary sum-save-btn" id="calc-save">Save to history</button>
        <button class="btn sum-clear-btn" id="calc-clear">Clear all</button>
      </div>`;

    sumCard.querySelector('#calc-save').addEventListener('click',()=>{
      let saved=0;
      S.rows.forEach(row=>{
        const mins=rowMins(row); if(!mins||!row.date) return;
        const sm=to24(row.inH,row.inM,row.inP), em=to24(row.outH,row.outM,row.outP);
        const sh=String(Math.floor(sm/60)).padStart(2,'0')+':'+String(sm%60).padStart(2,'0');
        const eh=String(Math.floor(em/60)).padStart(2,'0')+':'+String(em%60).padStart(2,'0');
        upsertEntry({id:genId(),clockIn:new Date(row.date+'T'+sh).toISOString(),clockOut:new Date(row.date+'T'+eh).toISOString(),durationMins:mins,note:'',source:'manual'});
        saved++;
      });
      toast(saved?saved+' shift'+(saved!==1?'s':'')+' saved!':'Nothing to save');
    });
    sumCard.querySelector('#calc-clear').addEventListener('click',()=>{ S.rows=[mkRow()]; reCalc(); });
    wrap.appendChild(sumCard);
  }

  // ── Bind events ──
  $$('.sr-date',wrap).forEach(inp=>{
    inp.addEventListener('change',e=>{ const r=S.rows.find(x=>x.id===e.target.dataset.id); if(r){ r.date=e.target.value; reCalc(); } });
  });
  $$('.ts',wrap).forEach(sel=>{
    sel.addEventListener('change',e=>{ const r=S.rows.find(x=>x.id===e.target.dataset.id); if(r){ r[e.target.dataset.f]=e.target.value; reCalc(); } });
  });
  $$('.sr-del',wrap).forEach(btn=>{
    btn.addEventListener('click',e=>{
      const id=e.currentTarget.dataset.id;
      S.rows=S.rows.length===1?[mkRow()]:S.rows.filter(r=>r.id!==id);
      reCalc();
    });
  });

  return wrap;
}

function reCalc(){
  const c=$id('tab-content'); const y=c.scrollTop;
  c.innerHTML=''; c.appendChild(renderCalculator()); c.scrollTop=y;
}

// ══════════════════════════════════════════════════════════════
//  HISTORY — with inline edit
// ══════════════════════════════════════════════════════════════
function renderHistory(){
  const wrap=document.createElement('div');
  const now=new Date(), sets=getSettings(), rate=parseFloat(sets.rate)||0, otW=sets.otWeek||40;

  // Pay period calculator
  const rangeCard=div('card');
  rangeCard.innerHTML=`
    <div class="card-header"><span class="card-title">Pay period calculator</span></div>
    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">
      Pick a date range to see total hours and estimated pay — e.g. your last pay period.
    </p>
    <div class="form-row cols-2" style="margin-bottom:1rem">
      <div class="field"><label>From</label><input type="date" id="rf" value="${S.rangeFrom||''}"/></div>
      <div class="field"><label>To</label><input type="date" id="rt" value="${S.rangeTo||''}"/></div>
    </div>`;

  if(S.rangeFrom&&S.rangeTo){
    const from=new Date(S.rangeFrom+'T00:00:00'), to=new Date(S.rangeTo+'T23:59:59');
    let rMins=0; const daySet=new Set();
    getEntries().filter(e=>{const d=new Date(e.clockIn);return d>=from&&d<=to;}).forEach(e=>{rMins+=e.durationMins||0; daySet.add(isoDate(new Date(e.clockIn)));});
    const rH=rMins/60, rReg=Math.min(rH,otW), rOT=Math.max(0,rH-otW), rPay=rReg*rate+rOT*rate*1.5;
    if(rMins>0){
      const rg=div('stat-grid'); rg.style.marginBottom='1rem';
      rg.innerHTML=`
        <div class="stat-card accent"><div class="stat-label">Total hours</div><div class="stat-value">${fmtDur(rMins)}</div><div class="stat-sub">${plainDur(rMins)}</div></div>
        <div class="stat-card"><div class="stat-label">Days worked</div><div class="stat-value">${daySet.size}</div><div class="stat-sub">unique days</div></div>
        <div class="stat-card ${rOT>0?'amber':''}"><div class="stat-label">Overtime</div><div class="stat-value">${rOT>0?fmtDur(rOT*60):'None'}</div><div class="stat-sub">${rOT>0?'over '+otW+'h threshold':''}</div></div>
        ${rate>0?`<div class="stat-card green"><div class="stat-label">You are owed</div><div class="stat-value">${fmtMoney(rPay)}</div><div class="stat-sub">${rOT>0?'incl. OT':'@ '+fmtMoney(rate)+'/hr'}</div></div>`:''}`;
      rangeCard.appendChild(rg);
      const co=div('summary-callout');
      co.innerHTML=`From <strong>${new Date(S.rangeFrom+'T12:00:00').toLocaleDateString([],{month:'long',day:'numeric'})}</strong> to <strong>${new Date(S.rangeTo+'T12:00:00').toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'})}</strong> — you worked <strong>${plainDur(rMins)}</strong> over <strong>${daySet.size} days</strong>${rOT>0?`, including <strong>${plainDur(rOT*60)} overtime</strong>`:''}${rate>0?`. Estimated pay: <strong>${fmtMoney(rPay)}</strong>`:''}.`;
      rangeCard.appendChild(co);
    } else {
      const no=div('summary-callout','No hours logged in this range.');
      no.style.borderLeftColor='var(--amber)'; rangeCard.appendChild(no);
    }
  }
  rangeCard.querySelector('#rf').addEventListener('change',e=>{ S.rangeFrom=e.target.value; renderTab(); });
  rangeCard.querySelector('#rt').addEventListener('change',e=>{ S.rangeTo=e.target.value; renderTab(); });
  wrap.appendChild(rangeCard);

  // Entry list
  const filters=['all','today','week','month'];
  const raw=getEntries().filter(e=>{
    const d=new Date(e.clockIn);
    if(S.histFilter==='today') return d.toDateString()===now.toDateString();
    if(S.histFilter==='week')  return (now-d)<7*86400000;
    if(S.histFilter==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    return true;
  }).sort((a,b)=>new Date(b.clockIn)-new Date(a.clockIn));

  const totalMins=raw.reduce((s,e)=>s+(e.durationMins||0),0);
  const listCard=div('card');
  listCard.innerHTML=`
    <div class="card-header" style="flex-wrap:wrap;gap:10px">
      <span class="card-title">All entries</span>
      <div class="period-tabs">${filters.map(f=>`<button class="period-tab${S.histFilter===f?' active':''}" data-hf="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}</div>
    </div>
    ${totalMins>0?`<div style="margin-bottom:1rem;font-size:0.82rem;color:var(--text-secondary)">${raw.length} record${raw.length!==1?'s':''} · Total: <strong style="color:var(--accent)">${fmtDur(totalMins)}</strong> — ${plainDur(totalMins)}${rate>0?` · <span style="color:var(--green)">${fmtMoney(totalMins/60*rate)}</span>`:''}</div>`:''}`;

  if(raw.length===0){
    listCard.innerHTML+=`<div class="empty-state"><p>No records for this period.</p></div>`;
  } else {
    raw.forEach(e=>{
      const ci=new Date(e.clockIn), co=new Date(e.clockOut);
      const eDiv=div('hist-entry');
      eDiv.dataset.id=e.id;
      eDiv.innerHTML=`
        <div class="he-main">
          <div class="he-date">${ci.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</div>
          <div class="he-times">${fmt12(ci.getHours()*60+ci.getMinutes())} → ${fmt12(co.getHours()*60+co.getMinutes())}</div>
          <div class="he-dur"><strong>${fmtDur(e.durationMins)}</strong> <span class="he-plain">${plainDur(e.durationMins)}</span>${rate>0?` <span class="he-pay">${fmtMoney(e.durationMins/60*rate)}</span>`:''}</div>
          ${e.note?`<div class="he-note">${e.note}</div>`:''}
        </div>
        <div class="he-actions">
          <button class="btn btn-sm btn-outline he-edit-btn" data-id="${e.id}">Edit</button>
          <button class="btn btn-sm btn-danger he-del-btn" data-id="${e.id}">Delete</button>
        </div>
        <div class="he-edit-form hidden" id="ef-${e.id}"></div>`;
      listCard.appendChild(eDiv);
    });
  }

  $$('[data-hf]',listCard).forEach(b=>b.addEventListener('click',()=>{ S.histFilter=b.dataset.hf; renderTab(); }));
  $$('.he-del-btn',listCard).forEach(b=>b.addEventListener('click',e=>{
    if(confirm('Delete this entry?')){ removeEntry(e.currentTarget.dataset.id); renderTab(); toast('Deleted'); }
  }));
  $$('.he-edit-btn',listCard).forEach(b=>b.addEventListener('click',e=>{
    const id=e.currentTarget.dataset.id;
    const formDiv=$id('ef-'+id);
    if(!formDiv) return;
    if(!formDiv.classList.contains('hidden')){ formDiv.classList.add('hidden'); formDiv.innerHTML=''; return; }
    const entry=getEntries().find(x=>x.id===id); if(!entry) return;
    formDiv.classList.remove('hidden');
    formDiv.appendChild(buildEditForm(entry, ()=>renderTab()));
  }));

  wrap.appendChild(listCard);
  return wrap;
}

function buildEditForm(entry, onSave){
  const ci=new Date(entry.clockIn), co=new Date(entry.clockOut);
  const dateStr=isoDate(ci);
  let ih=ci.getHours(), im=ci.getMinutes(), ip=ih<12?'AM':'PM';
  if(ih===0)ih=12; else if(ih>12)ih-=12;
  let oh=co.getHours(), om=co.getMinutes(), op=oh<12?'AM':'PM';
  if(oh===0)oh=12; else if(oh>12)oh-=12;

  const form=div('edit-form');
  form.innerHTML=`
    <div class="ef-row">
      <div class="field"><label>Date</label><input type="date" class="ef-date" value="${dateStr}"/></div>
      <div class="field"><label>Note</label><input type="text" class="ef-note" value="${entry.note||''}" placeholder="Optional note"/></div>
    </div>
    <div class="ef-row">
      <div>
        <label class="ef-lbl">Clock In</label>
        <div class="sr-picker" id="ef-in"></div>
      </div>
      <div class="sr-sep-arrow" style="padding-top:22px">→</div>
      <div>
        <label class="ef-lbl">Clock Out</label>
        <div class="sr-picker" id="ef-out"></div>
      </div>
    </div>
    <div class="ef-preview" id="ef-prev-${entry.id}"></div>
    <div class="ef-btns">
      <button class="btn btn-primary btn-sm ef-save">Update</button>
      <button class="btn btn-outline btn-sm ef-cancel">Cancel</button>
    </div>`;

  // Build pickers
  const inDiv=form.querySelector('#ef-in');
  const eih=timeSel(HOURS12,String(ih),'ts-h',{}); const eim=timeSel(MINS,String(im).padStart(2,'0'),'ts-m',{}); const eip=timeSel(['AM','PM'],ip,'ts-ap',{});
  const c1=document.createElement('span'); c1.className='ts-colon'; c1.textContent=':';
  inDiv.append(eih,c1,eim,eip);

  const outDiv=form.querySelector('#ef-out');
  const eoh=timeSel(HOURS12,String(oh),'ts-h',{}); const eom=timeSel(MINS,String(om).padStart(2,'0'),'ts-m',{}); const eop=timeSel(['AM','PM'],op,'ts-ap',{});
  const c2=document.createElement('span'); c2.className='ts-colon'; c2.textContent=':';
  outDiv.append(eoh,c2,eom,eop);

  function updatePreview(){
    const sm=to24(eih.value,eim.value,eip.value), em=to24(eoh.value,eom.value,eop.value);
    let diff=em-sm; if(diff<=0) diff+=1440;
    const prev=form.querySelector('#ef-prev-'+entry.id);
    if(prev) prev.innerHTML=diff>0?`<strong style="color:var(--green)">${fmtDur(diff)}</strong> — ${plainDur(diff)}`:`<span style="color:var(--red)">Invalid times</span>`;
  }
  [eih,eim,eip,eoh,eom,eop].forEach(s=>s.addEventListener('change',updatePreview));
  updatePreview();

  form.querySelector('.ef-cancel').addEventListener('click',()=>{ form.closest('.he-edit-form').classList.add('hidden'); form.innerHTML=''; });
  form.querySelector('.ef-save').addEventListener('click',()=>{
    const dateVal=form.querySelector('.ef-date').value||dateStr;
    const sm=to24(eih.value,eim.value,eip.value), em=to24(eoh.value,eom.value,eop.value);
    let diff=em-sm; if(diff<=0) diff+=1440;
    if(diff<=0){ toast('End must be after start'); return; }
    const sh=String(Math.floor(sm/60)).padStart(2,'0')+':'+String(sm%60).padStart(2,'0');
    const eh=String(Math.floor(em/60)).padStart(2,'0')+':'+String(em%60).padStart(2,'0');
    upsertEntry({...entry, date:dateVal, clockIn:new Date(dateVal+'T'+sh).toISOString(), clockOut:new Date(dateVal+'T'+eh).toISOString(), durationMins:diff, note:form.querySelector('.ef-note').value.trim()});
    toast('Entry updated'); onSave();
  });
  return form;
}

// ══════════════════════════════════════════════════════════════
//  CALENDAR
// ══════════════════════════════════════════════════════════════
function renderCalendar(){
  const wrap=document.createElement('div');
  const {calY:y,calM:m,calSel:sel}=S;
  const byDay={};
  getEntries().forEach(e=>{
    const d=new Date(e.clockIn);
    if(d.getFullYear()===y&&d.getMonth()+1===m){ const day=d.getDate(); byDay[day]=(byDay[day]||0)+(e.durationMins||0); }
  });
  const totalMins=Object.values(byDay).reduce((a,b)=>a+b,0);
  const firstDay=new Date(y,m-1,1).getDay(), daysIn=new Date(y,m,0).getDate(), today=new Date();
  const calCard=div('card');
  calCard.innerHTML=`
    <div class="cal-nav">
      <button class="btn btn-outline btn-sm" id="cal-prev">‹</button>
      <div style="text-align:center">
        <div style="font-family:var(--font-mono);font-size:1.05rem;font-weight:500">${MONTHS[m-1]} ${y}</div>
        ${totalMins>0?`<div style="font-size:0.72rem;color:var(--accent);margin-top:2px">${plainDur(totalMins)} logged this month</div>`:''}
      </div>
      <button class="btn btn-outline btn-sm" id="cal-next">›</button>
    </div>
    <div class="cal-grid">
      ${DAYS_S.map(d=>`<div class="cal-day-name">${d}</div>`).join('')}
      ${Array(firstDay).fill('<div class="cal-day empty"></div>').join('')}
      ${Array.from({length:daysIn},(_,i)=>{
        const day=i+1, isToday=y===today.getFullYear()&&m===today.getMonth()+1&&day===today.getDate();
        const mins=byDay[day]||0, worked=mins>0;
        const dateStr=y+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        const isSel=sel===dateStr;
        return `<div class="cal-day ${worked?'worked':'no-work'}${isToday?' today':''}${isSel?' cal-selected':''}" data-date="${dateStr}">
          <span class="cal-num">${day}</span>
          ${worked?`<span class="cal-hrs">${fmtDur(mins)}</span>`:''}
        </div>`;
      }).join('')}
    </div>
    <div class="cal-legend">
      <span><span class="leg-dot worked-dot"></span>Worked</span>
      <span><span class="leg-dot empty-dot"></span>No record</span>
      <span style="color:var(--text-muted);font-size:0.72rem">Tap a day to view & edit</span>
    </div>`;
  calCard.querySelector('#cal-prev').addEventListener('click',()=>{ if(S.calM===1){S.calM=12;S.calY--;}else S.calM--; S.calSel=null; renderTab(); });
  calCard.querySelector('#cal-next').addEventListener('click',()=>{ if(S.calM===12){S.calM=1;S.calY++;}else S.calM++; S.calSel=null; renderTab(); });
  $$('.cal-day[data-date]',calCard).forEach(cell=>cell.addEventListener('click',()=>{ S.calSel=S.calSel===cell.dataset.date?null:cell.dataset.date; renderTab(); }));
  wrap.appendChild(calCard);
  if(sel){ wrap.appendChild(renderDayPanel(sel)); }
  return wrap;
}

function renderDayPanel(dateStr){
  const panel=div('card day-panel');
  const dayEntries=getEntries().filter(e=>isoDate(new Date(e.clockIn))===dateStr);
  const totalMins=dayEntries.reduce((s,e)=>s+(e.durationMins||0),0);
  const rate=parseFloat(getSettings().rate)||0;
  panel.innerHTML=`
    <div class="card-header">
      <span class="card-title">${new Date(dateStr+'T12:00:00').toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</span>
      <button class="btn btn-primary btn-sm" id="dp-add">+ Add entry</button>
    </div>
    <div class="day-summary-bar">
      <div class="day-sum-big">${totalMins>0?fmtDur(totalMins):'No hours'}</div>
      <div class="day-sum-plain">${plainDur(totalMins)}</div>
      ${rate>0&&totalMins>0?`<div class="day-sum-pay">${fmtMoney(totalMins/60*rate)}</div>`:''}
    </div>
    <div id="dp-list">
      ${dayEntries.length===0?'<div class="empty-state" style="padding:1rem"><p>No entries. Click "+ Add entry" to log hours.</p></div>':''}
      ${dayEntries.map(e=>{
        const ci=new Date(e.clockIn),co=new Date(e.clockOut);
        return `<div class="dp-entry" data-id="${e.id}">
          <div class="dp-times">${fmt12(ci.getHours()*60+ci.getMinutes())} → ${fmt12(co.getHours()*60+co.getMinutes())}</div>
          <div class="dp-dur">${fmtDur(e.durationMins)} <span style="color:var(--text-muted);font-size:0.72rem">${plainDur(e.durationMins)}</span></div>
          ${e.note?`<div class="dp-note">${e.note}</div>`:''}
          <div class="dp-btns">
            <button class="btn btn-sm btn-outline dp-edit" data-id="${e.id}">Edit</button>
            <button class="btn btn-sm btn-danger dp-del" data-id="${e.id}">Delete</button>
          </div>
          <div class="dp-ef hidden" id="dpef-${e.id}"></div>
        </div>`;
      }).join('')}
    </div>
    <div id="dp-add-form"></div>`;
  panel.querySelector('#dp-add').addEventListener('click',()=>{
    const f=$id('dp-add-form'); if(f.innerHTML){ f.innerHTML=''; return; }
    f.appendChild(buildAddForm(dateStr,()=>renderTab()));
  });
  $$('.dp-del',panel).forEach(b=>b.addEventListener('click',e=>{ if(confirm('Delete?')){ removeEntry(e.currentTarget.dataset.id); renderTab(); toast('Deleted'); } }));
  $$('.dp-edit',panel).forEach(b=>b.addEventListener('click',e=>{
    const id=e.currentTarget.dataset.id, ef=$id('dpef-'+id);
    if(!ef) return;
    if(!ef.classList.contains('hidden')){ ef.classList.add('hidden'); ef.innerHTML=''; return; }
    const entry=getEntries().find(x=>x.id===id); if(!entry) return;
    ef.classList.remove('hidden');
    ef.appendChild(buildEditForm(entry,()=>renderTab()));
  }));
  return panel;
}

function buildAddForm(dateStr, onSave){
  const tmpEntry={id:'_new',clockIn:new Date(dateStr+'T09:00').toISOString(),clockOut:new Date(dateStr+'T17:00').toISOString(),durationMins:480,note:''};
  const form=buildEditForm(tmpEntry, ()=>{});
  // Override save to create new
  const saveBtn=form.querySelector('.ef-save');
  saveBtn.textContent='Add entry';
  const newHandler=()=>{
    const dateVal=form.querySelector('.ef-date').value||dateStr;
    const inDiv=form.querySelector('#ef-in'), outDiv=form.querySelector('#ef-out');
    const [eih,eim,eip]=[...$$(`.ts-h`,inDiv),...$$(`.ts-m`,inDiv),...$$(`.ts-ap`,inDiv)];
    // just re-use buildEditForm's save logic by triggering it
    saveBtn.dispatchEvent(new Event('_nosave'));
  };
  // Simpler: just replace save handler
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  form.querySelector('.ef-save').addEventListener('click',()=>{
    const dateVal=form.querySelector('.ef-date').value||dateStr;
    const [eih]=$$('.ts-h',form), [eim]=$$('.ts-m',form), [eip]=$$('.ts-ap',form);
    const allH=$$('.ts-h',form), allM=$$('.ts-m',form), allAP=$$('.ts-ap',form);
    const sm=to24(allH[0].value,allM[0].value,allAP[0].value);
    const em=to24(allH[1].value,allM[1].value,allAP[1].value);
    let diff=em-sm; if(diff<=0) diff+=1440;
    if(diff<=0){ toast('End must be after start'); return; }
    const sh=String(Math.floor(sm/60)).padStart(2,'0')+':'+String(sm%60).padStart(2,'0');
    const eh=String(Math.floor(em/60)).padStart(2,'0')+':'+String(em%60).padStart(2,'0');
    upsertEntry({id:genId(),clockIn:new Date(dateVal+'T'+sh).toISOString(),clockOut:new Date(dateVal+'T'+eh).toISOString(),durationMins:diff,note:form.querySelector('.ef-note').value.trim(),source:'manual'});
    toast('Entry added'); onSave();
  });
  return form;
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════
function renderSettings(){
  const wrap=document.createElement('div');
  const s=getSettings();
  const c1=div('card'); c1.style.maxWidth='520px';
  c1.innerHTML=`
    <div class="card-header"><span class="card-title">Pay settings</span></div>
    <div class="form-row cols-2" style="margin-bottom:14px">
      <div class="field"><label>Hourly rate ($)</label><input type="number" id="st-rate" value="${s.rate||''}" placeholder="e.g. 15.50" min="0" step="0.01"/></div>
      <div class="field"><label>Weekly OT after (hrs)</label><input type="number" id="st-ot" value="${s.otWeek||40}" min="1"/></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-primary" id="save-settings">Save</button>
      <span id="settings-saved" style="display:none;font-size:0.8rem;color:var(--green)">Saved!</span>
    </div>`;
  c1.querySelector('#save-settings').addEventListener('click',()=>{
    const ns={rate:c1.querySelector('#st-rate').value, otWeek:parseFloat(c1.querySelector('#st-ot').value)||40};
    saveSettings(ns); S.settings={...ns};
    const m=c1.querySelector('#settings-saved'); m.style.display='inline'; setTimeout(()=>m.style.display='none',2000); toast('Settings saved');
  });
  const c2=div('card'); c2.style.cssText='max-width:520px;margin-top:1rem';
  c2.innerHTML=`
    <div class="card-header"><span class="card-title">Account</span></div>
    <div style="margin-bottom:1rem"><div style="font-size:0.875rem;font-weight:500">${S.users[S.user]?.name||''}</div><div style="font-size:0.78rem;color:var(--text-muted)">${S.user}</div></div>
    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">All data is stored in your browser. Use Export in the top bar to download a CSV backup.</p>
    <button class="btn btn-danger btn-sm" id="clear-data">Clear all my data</button>`;
  c2.querySelector('#clear-data').addEventListener('click',()=>{
    if(confirm('Delete ALL data? Cannot be undone.')){ const u=S.users[S.user]; if(u){ u.entries=[]; saveDB(); toast('Cleared'); renderTab(); } }
  });
  wrap.appendChild(c1); wrap.appendChild(c2); return wrap;
}

// ── Bootstrap ─────────────────────────────────────────────────
function init(){
  loadDB();
  renderLogin(); $id('login-screen').classList.remove('hidden');
  $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  $id('btn-logout').addEventListener('click',()=>{ S.user=null; S.clockIn=null; stopTimer(); $id('app').classList.add('hidden'); $id('login-screen').classList.remove('hidden'); S.loginMode='login'; S.loginError=''; renderLogin(); });
  $id('btn-export').addEventListener('click',exportCSV);
  $id('btn-ci').addEventListener('click',toggleClock);
  $id('sidebar-toggle').addEventListener('click',()=>{ const sb=$id('sidebar'),ov=$id('sidebar-overlay'); sb.classList.toggle('open'); ov.classList.toggle('hidden',!sb.classList.contains('open')); });
  $id('sidebar-overlay').addEventListener('click',()=>{ $id('sidebar').classList.remove('open'); $id('sidebar-overlay').classList.add('hidden'); });
}
document.addEventListener('DOMContentLoaded',init);

// ── PWA ───────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js')
      .then(r=>console.log('[SW]',r.scope)).catch(e=>console.warn('[SW]',e));
  });
}
let _dip=null;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); _dip=e; if(!localStorage.getItem('tc_nodismiss')){ const b=$id('install-banner'); if(b) b.classList.remove('hidden'); } });
document.addEventListener('click',e=>{
  if(e.target?.id==='install-btn'){ if(_dip){ _dip.prompt(); _dip.userChoice.then(r=>{ if(r.outcome==='accepted'){ toast('TimeCard installed!'); const b=$id('install-banner'); if(b) b.classList.add('hidden'); } _dip=null; }); } }
  if(e.target?.closest?.('#install-dismiss')){ const b=$id('install-banner'); if(b) b.classList.add('hidden'); localStorage.setItem('tc_nodismiss','1'); }
});
window.addEventListener('appinstalled',()=>{ const b=$id('install-banner'); if(b) b.classList.add('hidden'); toast('Installed!'); });