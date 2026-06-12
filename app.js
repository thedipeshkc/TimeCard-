'use strict';
/* TimeCard app.js */

const DB    = 'tc_v6';
const MONS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONS_S= ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_L= ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const HRS12 = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINS  = Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
const TABS  = {calculator:'Calculator',history:'History',calendar:'Calendar',settings:'Settings'};

let S = {
  user:null, users:{}, tab:'calculator',
  shifts:[ mkShift() ],
  settings:{ rate:'', otWeek:40 },
  clockIn:null, clockTimer:null,
  calY:new Date().getFullYear(), calM:new Date().getMonth()+1, calSel:null,
  histFilter:'all',
  rangeFrom:'', rangeTo:'',
  loginMode:'login', loginError:'',
};

function mkShift(){ return {id:uid(), date:today(), inH:'9',inM:'00',inP:'AM', outH:'5',outM:'00',outP:'PM'}; }

// ── DB ──────────────────────────────────────────────────────
function loadDB(){ try{ const d=JSON.parse(localStorage.getItem(DB)||'{}'); if(d.users) S.users=d.users; }catch(e){} }
function saveDB(){ try{ localStorage.setItem(DB,JSON.stringify({users:S.users})); }catch(e){} }
function entries(){ return S.users[S.user]?.entries||[]; }
function upsert(e){
  if(!S.users[S.user]) S.users[S.user]={entries:[]};
  const a=S.users[S.user].entries, i=a.findIndex(x=>x.id===e.id);
  if(i>=0) a[i]=e; else a.push(e); saveDB();
}
function remove(id){ const u=S.users[S.user]; if(u) u.entries=u.entries.filter(e=>e.id!==id); saveDB(); }
function cfg(){ return S.users[S.user]?.settings||{rate:'',otWeek:40}; }
function saveCfg(s){ if(!S.users[S.user]) S.users[S.user]={entries:[]}; S.users[S.user].settings=s; saveDB(); }

// ── Utils ───────────────────────────────────────────────────
function uid(){ return Date.now()+'-'+(Math.random()*99999|0); }
function today(){ return new Date().toISOString().split('T')[0]; }
function isoD(d){ return d.toISOString().split('T')[0]; }
function hp(p){ let h=0; for(let i=0;i<p.length;i++){h=((h<<5)-h)+p.charCodeAt(i);h|=0;} return h.toString(36); }
function $( id){ return document.getElementById(id); }
function $$(s,c){ return [...(c||document).querySelectorAll(s)]; }
function el(tag,cls,html){ const d=document.createElement(tag); if(cls) d.className=cls; if(html!=null) d.innerHTML=html; return d; }
function div(cls,html){ return el('div',cls,html); }
function ini(n){ return n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

function to24(h,m,ap){
  let hh=parseInt(h)||0, mm=parseInt(m)||0;
  if(ap==='AM'){if(hh===12)hh=0;}else{if(hh!==12)hh+=12;}
  return hh*60+mm;
}
function shiftMins(s){
  if(!s.inH||!s.outH) return 0;
  let a=to24(s.inH,s.inM,s.inP), b=to24(s.outH,s.outM,s.outP);
  if(b<=a) b+=1440; return Math.max(0,b-a);
}
function fmt12(t){ let h=Math.floor(t/60)%24,m=t%60,ap=h<12?'AM':'PM'; if(h===0)h=12; else if(h>12)h-=12; return h+':'+(String(m).padStart(2,'0'))+' '+ap; }
function fmtD(m){ if(!m||m<=0)return'—'; const h=Math.floor(m/60),mn=Math.round(m%60); if(h===0)return mn+'m'; if(mn===0)return h+'h'; return h+'h '+mn+'m'; }
function plainD(m){
  if(!m||m<=0)return'no time';
  const h=Math.floor(m/60),mn=Math.round(m%60);
  if(h===0)return mn+' min'; if(mn===0)return h+' hr'+(h!==1?'s':'');
  return h+' hr'+(h!==1?'s':'')+' '+mn+' min';
}
function money(n){ return '$'+parseFloat(n).toFixed(2); }
function elapsed(ms){ const s=Math.floor(ms/1000),h=Math.floor(s/3600),min=Math.floor((s%3600)/60),sec=s%60; return (h?h+':':'')+(String(min).padStart(h?2:1,'0'))+':'+(String(sec).padStart(2,'0')); }

// ── Select builder ──────────────────────────────────────────
function sel(opts,val,cls,data){
  const s=document.createElement('select'); s.className='ts '+cls;
  if(data) Object.entries(data).forEach(([k,v])=>s.dataset[k]=v);
  opts.forEach(o=>{ const op=document.createElement('option'); op.value=o; op.textContent=o; if(String(o)===String(val)) op.selected=true; s.appendChild(op); });
  return s;
}
function timePicker(h,m,p,data){
  const wrap=div('tp');
  const sh=sel(HRS12,h,'th',{...data,f:data.prefix+'H'});
  const sm=sel(MINS,m,'tm',{...data,f:data.prefix+'M'});
  const sp=sel(['AM','PM'],p,'tap',{...data,f:data.prefix+'P'});
  const sep=el('span','ts-sep',':');
  wrap.append(sh,sep,sm,sp);
  return wrap;
}

// ── Clock-in ────────────────────────────────────────────────
function startClock(){ if(S.clockTimer) clearInterval(S.clockTimer); S.clockTimer=setInterval(tickCI,1000); tickCI(); }
function stopClock(){  if(S.clockTimer){ clearInterval(S.clockTimer); S.clockTimer=null; } }
function tickCI(){
  const dot=$('ci-dot'), lbl=$('ci-label'), tmr=$('ci-timer'), btn=$('btn-ci');
  if(S.clockIn){
    if(dot) dot.className='ci-dot on';
    if(lbl) lbl.textContent='Clocked in';
    if(tmr) tmr.textContent=elapsed(Date.now()-S.clockIn);
    if(btn){ btn.textContent='Clock Out'; btn.className='ci-btn out'; }
  } else {
    if(dot) dot.className='ci-dot';
    if(lbl) lbl.textContent='Not clocked in';
    if(tmr) tmr.textContent='';
    if(btn){ btn.textContent='Clock In'; btn.className='ci-btn'; }
  }
}
function toggleCI(){
  if(!S.clockIn){ S.clockIn=Date.now(); startClock(); }
  else {
    const out=Date.now(), mins=Math.round((out-S.clockIn)/60000);
    upsert({id:uid(),clockIn:new Date(S.clockIn).toISOString(),clockOut:new Date(out).toISOString(),durationMins:mins,note:'',source:'clockin'});
    S.clockIn=null; stopClock(); tickCI();
    toast('Shift saved — '+plainD(mins));
    if(S.tab==='history'||S.tab==='calendar') render();
  }
}

// ── Live clock ──────────────────────────────────────────────
function liveClock(){
  function tick(){ const c=$('live-clock'); if(!c)return; const n=new Date(); let h=n.getHours(),m=n.getMinutes(),s=n.getSeconds(),ap=h<12?'AM':'PM'; if(h===0)h=12; else if(h>12)h-=12; c.textContent=h+':'+(String(m).padStart(2,'0'))+':'+(String(s).padStart(2,'0'))+' '+ap; }
  tick(); setInterval(tick,1000);
}

// ── Toast ───────────────────────────────────────────────────
let _tt=null;
function toast(msg){
  let t=$('_toast');
  if(!t){ t=document.createElement('div'); t.id='_toast'; t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(0);z-index:9999;padding:10px 20px;border-radius:20px;font-size:.85rem;font-weight:600;background:#1e2029;border:1px solid #2a2d3a;color:#f0f1f5;white-space:nowrap;transition:all .25s;pointer-events:none;font-family:var(--sans)'; document.body.appendChild(t); }
  t.textContent=msg; t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)';
  if(_tt) clearTimeout(_tt);
  _tt=setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(10px)'; },2500);
}

// ── Export ──────────────────────────────────────────────────
function exportCSV(){
  const ee=entries(); if(!ee.length){ toast('No entries'); return; }
  const r=parseFloat(cfg().rate)||0;
  const rows=[['Date','Day','Clock In','Clock Out','Hours','Note',r?'Pay':''].filter(Boolean)];
  [...ee].sort((a,b)=>new Date(a.clockIn)-new Date(b.clockIn)).forEach(e=>{
    const ci=new Date(e.clockIn),co=new Date(e.clockOut);
    const row=[ci.toLocaleDateString(),DAYS_L[ci.getDay()],fmt12(ci.getHours()*60+ci.getMinutes()),fmt12(co.getHours()*60+co.getMinutes()),(e.durationMins/60).toFixed(2),e.note||''];
    if(r) row.push((e.durationMins/60*r).toFixed(2));
    rows.push(row);
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='timecard.csv'; a.click(); toast('Exported!');
}

// ── Auth ────────────────────────────────────────────────────
function showLogin(){
  $('login-screen').classList.remove('hidden'); $('app').classList.add('hidden');
  const isL=S.loginMode==='login';
  $('login-title').textContent=isL?'Welcome back':'Create account';
  $('login-sub').textContent=isL?'Track your hours, know your pay.':'Free — all data stays on your device.';
  $('login-submit').textContent=isL?'Sign in':'Create account';
  const err=$('login-error'); err.classList.toggle('hidden',!S.loginError); err.textContent=S.loginError||'';
  $('login-fields').innerHTML=`
    ${!isL?`<div class="lf"><label>Your name</label><input id="li-n" type="text" placeholder="Full name" autocomplete="name"/></div>`:''}
    <div class="lf"><label>Email</label><input id="li-e" type="email" placeholder="you@email.com" autocomplete="email"/></div>
    <div class="lf"><label>Password</label><input id="li-p" type="password" placeholder="••••••••"/></div>`;
  $('login-toggle-text').innerHTML=isL?`No account? <button id="li-tog">Register free</button>`:`Have an account? <button id="li-tog">Sign in</button>`;
  $('login-submit').onclick=doLogin;
  $('li-p').onkeydown=e=>{ if(e.key==='Enter') doLogin(); };
  $('li-tog').onclick=()=>{ S.loginMode=isL?'register':'login'; S.loginError=''; showLogin(); };
}
function doLogin(){
  const email=$('li-e').value.trim().toLowerCase(), pass=$('li-p').value;
  if(S.loginMode==='register'){
    const name=$('li-n').value.trim();
    if(!name||!email||!pass){ S.loginError='All fields required.'; showLogin(); return; }
    if(S.users[email]){ S.loginError='Email already registered.'; showLogin(); return; }
    S.users[email]={name,passHash:hp(pass),entries:[]}; saveDB();
    S.user=email; S.loginError=''; launch();
  } else {
    if(!email||!pass){ S.loginError='Enter email and password.'; showLogin(); return; }
    const u=S.users[email];
    if(!u||u.passHash!==hp(pass)){ S.loginError='Invalid email or password.'; showLogin(); return; }
    S.user=email; S.loginError=''; launch();
  }
}
function launch(){
  $('login-screen').classList.add('hidden'); $('app').classList.remove('hidden');
  const u=S.users[S.user];
  // Build desktop sidebar
  buildDesktopSidebar(u);
  const c=cfg(); S.settings={...c};
  liveClock(); if(S.clockIn) startClock(); render();
}

function buildDesktopSidebar(u){
  // Remove old if exists
  const old=document.querySelector('.sidebar-desktop'); if(old) old.remove();
  const app=$('app');
  const sd=div('sidebar-desktop');
  sd.innerHTML=`
    <div class="sd-brand">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#4f8ef7" stroke-width="2"/><path d="M16 8v8l5 3" stroke="#4f8ef7" stroke-width="2" stroke-linecap="round"/></svg>
      TimeCard
    </div>
    <nav class="sd-nav" id="sd-nav">
      ${Object.entries(TABS).map(([k,v])=>`<button class="sd-item${S.tab===k?' active':''}" data-tab="${k}">${v}</button>`).join('')}
    </nav>
    <div class="sd-footer">
      <div class="sd-avatar">${ini(u?.name||S.user)}</div>
      <div class="sd-info">
        <div class="sd-name">${u?.name||S.user}</div>
        <div class="sd-email">${S.user}</div>
      </div>
    </div>`;
  $$('[data-tab]',sd).forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  // Wrap existing content in main-area if not already
  let ma=document.querySelector('.main-area');
  if(!ma){
    ma=div('main-area');
    // Move topbar, ci-banner, page into main-area
    const tb=$('app').querySelector('.topbar');
    const ci=$('app').querySelector('.ci-banner');
    const pg=$('page');
    if(tb) ma.appendChild(tb);
    if(ci) ma.appendChild(ci);
    if(pg) ma.appendChild(pg);
    app.insertBefore(sd,app.firstChild);
    app.appendChild(ma);
  } else {
    app.insertBefore(sd,ma);
  }
}

// ── Nav ─────────────────────────────────────────────────────
function setTab(tab){
  S.tab=tab;
  $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  render();
}
function render(){
  const p=$('page'); p.innerHTML='';
  const fns={calculator:calcPage, history:histPage, calendar:calPage, settings:settingsPage};
  if(fns[S.tab]) p.appendChild(fns[S.tab]());
}

// ══════════════════════════════════════════════════════════════
//  CALCULATOR PAGE
// ══════════════════════════════════════════════════════════════
function calcPage(){
  const wrap=div('calc-page');
  const sets=S.settings;
  const rate=parseFloat(sets.rate)||0, otW=parseFloat(sets.otWeek)||40;

  // Rate bar
  const rateCard=div('calc-rate');
  rateCard.innerHTML=`<div class="row2">
    <div><label class="lbl">Hourly Rate ($)</label><input class="inp" type="number" id="cs-rate" value="${sets.rate||''}" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>
    <div><label class="lbl">OT after (hrs/wk)</label><input class="inp" type="number" id="cs-ot" value="${sets.otWeek||40}" min="1" inputmode="numeric"/></div>
  </div>`;
  rateCard.querySelector('#cs-rate').addEventListener('input',e=>{ S.settings.rate=e.target.value; saveCfg(S.settings); reCalc(); });
  rateCard.querySelector('#cs-ot').addEventListener('input',e=>{ S.settings.otWeek=parseFloat(e.target.value)||40; saveCfg(S.settings); reCalc(); });
  wrap.appendChild(rateCard);

  // Shift cards
  S.shifts.forEach((shift,idx)=>{
    wrap.appendChild(buildShiftCard(shift,idx,rate,otW));
  });

  // Add shift button
  const addBtn=el('button','add-shift-btn');
  addBtn.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg> Add another shift`;
  addBtn.addEventListener('click',()=>{ S.shifts.push(mkShift()); reCalc(); });
  wrap.appendChild(addBtn);

  // Summary
  const totalMins=S.shifts.reduce((s,r)=>s+shiftMins(r),0);
  if(totalMins>0){
    const tH=totalMins/60, regH=Math.min(tH,otW), otH=Math.max(0,tH-otW), pay=regH*rate+otH*rate*1.5;
    const sumCard=div('sum-card');
    sumCard.innerHTML=`
      <div class="sum-num">${fmtD(totalMins)}</div>
      <div class="sum-plain">${plainD(totalMins)}</div>
      <div class="sum-grid">
        <div class="sum-item"><div class="si-lbl">Regular</div><div class="si-val">${fmtD(regH*60)}</div><div class="si-sub">${rate>0?money(regH*rate):''}</div></div>
        <div class="sum-item si-ot"><div class="si-lbl">Overtime</div><div class="si-val">${otH>0?fmtD(otH*60):'None'}</div><div class="si-sub">${rate>0&&otH>0?money(otH*rate*1.5)+' (1.5×)':''}</div></div>
        ${rate>0?`<div class="sum-item si-pay"><div class="si-lbl">Est. Pay</div><div class="si-val">${money(pay)}</div><div class="si-sub">@ ${money(rate)}/hr</div></div>`:''}
      </div>
      <div class="sum-text">
        You worked <strong>${plainD(totalMins)}</strong>${otH>0?`, including <strong>${plainD(otH*60)} overtime</strong>`:''}${rate>0?`. Estimated pay: <strong>${money(pay)}</strong>`:''}.
      </div>
      <div class="sum-actions">
        <button class="btn btn-primary sum-save" id="do-save">Save to history</button>
        <button class="btn btn-ghost sum-clear" id="do-clear">Clear</button>
      </div>`;
    sumCard.querySelector('#do-save').addEventListener('click',()=>{
      let n=0;
      S.shifts.forEach(r=>{ const m=shiftMins(r); if(!m||!r.date)return; const sm=to24(r.inH,r.inM,r.inP),em=to24(r.outH,r.outM,r.outP); const sh=pad2(sm),eh=pad2(em); upsert({id:uid(),clockIn:new Date(r.date+'T'+sh).toISOString(),clockOut:new Date(r.date+'T'+eh).toISOString(),durationMins:m,note:'',source:'manual'}); n++; });
      toast(n?n+' shift'+(n!==1?'s':'')+' saved!':'Nothing to save');
    });
    sumCard.querySelector('#do-clear').addEventListener('click',()=>{ S.shifts=[mkShift()]; reCalc(); });
    wrap.appendChild(sumCard);
  }

  return wrap;
}

function buildShiftCard(shift,idx,rate,otW){
  const mins=shiftMins(shift);
  const card=div('shift-card'+(mins>0?' filled':''));

  // Header: date + delete
  const hdr=div('sc-header');
  const dateWrap=div('sc-date-wrap');
  const dateLbl=el('label','lbl','Date');
  const dateInp=el('input','inp');
  dateInp.type='date'; dateInp.value=shift.date||''; dateInp.dataset.id=shift.id;
  const dayDiv=div('sc-day');
  if(shift.date){ const d=new Date(shift.date+'T12:00:00'); dayDiv.textContent=DAYS_L[d.getDay()]; }
  dateInp.addEventListener('change',e=>{ const r=S.shifts.find(x=>x.id===e.target.dataset.id); if(r){ r.date=e.target.value; reCalc(); } });
  dateWrap.append(dateLbl,dateInp,dayDiv);
  const delBtn=el('button','sc-del','×');
  delBtn.addEventListener('click',()=>{ S.shifts=S.shifts.length===1?[mkShift()]:S.shifts.filter(r=>r.id!==shift.id); reCalc(); });
  hdr.append(dateWrap,delBtn);
  card.appendChild(hdr);

  // Times: IN / OUT
  const timesRow=div('sc-times');
  const inCol=div('');
  const inLbl=el('span','sc-time-lbl','Clock In');
  const inPick=timePicker(shift.inH,shift.inM,shift.inP,{id:shift.id,prefix:'in'});
  inCol.append(inLbl,inPick);
  const outCol=div('');
  const outLbl=el('span','sc-time-lbl','Clock Out');
  const outPick=timePicker(shift.outH,shift.outM,shift.outP,{id:shift.id,prefix:'out'});
  outCol.append(outLbl,outPick);
  timesRow.append(inCol,outCol);
  card.appendChild(timesRow);

  // Bind time selects
  $$('.ts',card).forEach(s=>s.addEventListener('change',e=>{ const r=S.shifts.find(x=>x.id===e.target.dataset.id); if(r){ r[e.target.dataset.f]=e.target.value; reCalc(); } }));

  // Result
  const res=div('sc-result');
  if(mins>0){
    const dh=mins/60, isOT=dh>(parseFloat(S.settings.otDay)||8);
    res.innerHTML=`<span class="sc-result-num${isOT?' ot':''}">${fmtD(mins)}</span><span class="sc-result-plain">${plainD(mins)}</span>${rate>0?`<span class="sc-result-pay">${money(mins/60*rate)}</span>`:''}`;
  } else {
    res.innerHTML=`<span class="sc-result-empty">Set times to calculate</span>`;
  }
  card.appendChild(res);
  return card;
}

function reCalc(){
  const p=$('page'); const y=p.scrollTop;
  p.innerHTML=''; p.appendChild(calcPage()); p.scrollTop=y;
}

function pad2(mins){ return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0'); }

// ══════════════════════════════════════════════════════════════
//  HISTORY PAGE
// ══════════════════════════════════════════════════════════════
function histPage(){
  const wrap=document.createElement('div');
  const now=new Date(), sets=cfg(), rate=parseFloat(sets.rate)||0, otW=sets.otWeek||40;

  // Pay period range
  const rCard=div('card');
  rCard.innerHTML=`<div class="card-title">Pay Period Calculator</div>
    <div class="row2" style="margin-bottom:12px">
      <div><label class="lbl">From</label><input class="inp" type="date" id="rf" value="${S.rangeFrom||''}"/></div>
      <div><label class="lbl">To</label><input class="inp" type="date" id="rt" value="${S.rangeTo||''}"/></div>
    </div>`;
  if(S.rangeFrom&&S.rangeTo){
    const from=new Date(S.rangeFrom+'T00:00:00'), to=new Date(S.rangeTo+'T23:59:59');
    let rM=0; const ds=new Set();
    entries().filter(e=>{const d=new Date(e.clockIn);return d>=from&&d<=to;}).forEach(e=>{rM+=e.durationMins||0;ds.add(isoD(new Date(e.clockIn)));});
    const rH=rM/60, rReg=Math.min(rH,otW), rOT=Math.max(0,rH-otW), rPay=rReg*rate+rOT*rate*1.5;
    if(rM>0){
      const sg=div('stat-row');
      sg.innerHTML=`
        <div class="stat-box c-accent"><div class="stat-box-lbl">Total</div><div class="stat-box-val">${fmtD(rM)}</div><div class="stat-box-sub">${plainD(rM)}</div></div>
        <div class="stat-box"><div class="stat-box-lbl">Days</div><div class="stat-box-val">${ds.size}</div><div class="stat-box-sub">worked</div></div>
        <div class="stat-box${rOT>0?' c-amber':''}"><div class="stat-box-lbl">Overtime</div><div class="stat-box-val">${rOT>0?fmtD(rOT*60):'None'}</div></div>
        ${rate>0?`<div class="stat-box c-green"><div class="stat-box-lbl">Owed</div><div class="stat-box-val">${money(rPay)}</div></div>`:''}`;
      rCard.appendChild(sg);
      const co=div('callout');
      co.innerHTML=`<strong>${new Date(S.rangeFrom+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'})}</strong> – <strong>${new Date(S.rangeTo+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}</strong>: <strong>${plainD(rM)}</strong> over <strong>${ds.size} days</strong>${rOT>0?`, incl. <strong>${plainD(rOT*60)} OT</strong>`:''}${rate>0?`. Pay: <strong>${money(rPay)}</strong>`:''}.`;
      rCard.appendChild(co);
    } else {
      rCard.innerHTML+=`<div class="callout" style="border-left-color:var(--amber)">No hours in this range.</div>`;
    }
  }
  rCard.querySelector('#rf').addEventListener('change',e=>{ S.rangeFrom=e.target.value; renderTab2(); });
  rCard.querySelector('#rt').addEventListener('change',e=>{ S.rangeTo=e.target.value; renderTab2(); });
  wrap.appendChild(rCard);

  // Filter + list
  const lCard=div('card');
  const filters=['all','today','week','month'];
  const ptabs=div('ptabs');
  filters.forEach(f=>{ const b=el('button','ptab'+(S.histFilter===f?' active':''),f.charAt(0).toUpperCase()+f.slice(1)); b.addEventListener('click',()=>{ S.histFilter=f; renderTab2(); }); ptabs.appendChild(b); });
  lCard.appendChild(ptabs);

  const raw=entries().filter(e=>{
    const d=new Date(e.clockIn);
    if(S.histFilter==='today') return d.toDateString()===now.toDateString();
    if(S.histFilter==='week')  return (now-d)<7*86400000;
    if(S.histFilter==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    return true;
  }).sort((a,b)=>new Date(b.clockIn)-new Date(a.clockIn));

  const tot=raw.reduce((s,e)=>s+(e.durationMins||0),0);
  if(tot>0){
    const info=div(''); info.style.cssText='font-size:.8rem;color:var(--text2);margin:10px 0';
    info.innerHTML=`${raw.length} record${raw.length!==1?'s':''} &nbsp;·&nbsp; <strong style="color:var(--accent)">${fmtD(tot)}</strong> — ${plainD(tot)}${rate>0?` &nbsp;·&nbsp; <span style="color:var(--green)">${money(tot/60*rate)}</span>`:''}`;
    lCard.appendChild(info);
  }

  if(raw.length===0){
    lCard.innerHTML+=`<div class="empty">No records for this period.</div>`;
  } else {
    const list=div('');
    raw.forEach(e=>{
      const ci=new Date(e.clockIn), co=new Date(e.clockOut);
      const he=div('he');
      he.innerHTML=`
        <div class="he-date">${ci.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</div>
        <div class="he-times">${fmt12(ci.getHours()*60+ci.getMinutes())} → ${fmt12(co.getHours()*60+co.getMinutes())}</div>
        <div class="he-dur">${fmtD(e.durationMins)} <span class="he-dur-plain">${plainD(e.durationMins)}</span>${rate>0?` <span class="he-pay">${money(e.durationMins/60*rate)}</span>`:''}</div>
        ${e.note?`<div class="he-note">${e.note}</div>`:''}
        <div class="he-btns">
          <button class="btn btn-sm btn-ghost he-edit" data-id="${e.id}">Edit</button>
          <button class="btn btn-sm btn-danger he-del" data-id="${e.id}">Delete</button>
        </div>
        <div class="he-ef" id="ef-${e.id}"></div>`;
      list.appendChild(he);
    });
    lCard.appendChild(list);
  }
  wrap.appendChild(lCard);

  // Bind
  $$('.he-del',wrap).forEach(b=>b.addEventListener('click',e=>{ if(confirm('Delete?')){ remove(e.currentTarget.dataset.id); renderTab2(); toast('Deleted'); } }));
  $$('.he-edit',wrap).forEach(b=>b.addEventListener('click',e=>{
    const id=e.currentTarget.dataset.id, ef=$('ef-'+id);
    if(!ef) return;
    if(ef.classList.contains('open')){ ef.classList.remove('open'); ef.innerHTML=''; return; }
    const entry=entries().find(x=>x.id===id); if(!entry) return;
    ef.classList.add('open');
    ef.appendChild(buildEF(entry,false,()=>renderTab2()));
  }));

  return wrap;
}

function renderTab2(){ const p=$('page'); p.innerHTML=''; const fns={calculator:calcPage,history:histPage,calendar:calPage,settings:settingsPage}; if(fns[S.tab]) p.appendChild(fns[S.tab]()); }

// ── Edit / Add form ─────────────────────────────────────────
function buildEF(entry, isNew, onDone){
  const ci=new Date(entry.clockIn), co=new Date(entry.clockOut);
  const dateStr=isoD(ci);
  let ih=ci.getHours(),im=ci.getMinutes(),ip=ih<12?'AM':'PM'; if(ih===0)ih=12; else if(ih>12)ih-=12;
  let oh=co.getHours(),om=co.getMinutes(),op=oh<12?'AM':'PM'; if(oh===0)oh=12; else if(oh>12)oh-=12;

  const form=div('ef');
  form.innerHTML=`<div class="ef-title">${isNew?'Add Entry':'Edit Entry'}</div>
    <div class="row2" style="margin-bottom:10px">
      <div><label class="lbl">Date</label><input class="inp ef-date" type="date" value="${dateStr}"/></div>
      <div><label class="lbl">Note</label><input class="inp ef-note" type="text" value="${entry.note||''}" placeholder="Optional"/></div>
    </div>
    <div class="ef-times">
      <div><label class="lbl">Clock In</label><div class="tp" id="efi"></div></div>
      <div><label class="lbl">Clock Out</label><div class="tp" id="efo"></div></div>
    </div>
    <div class="ef-preview" id="efp"></div>
    <div class="ef-btns">
      <button class="btn btn-primary btn-sm ef-save">${isNew?'Add':'Update'}</button>
      <button class="btn btn-ghost btn-sm ef-cancel">Cancel</button>
    </div>`;

  const inDiv=form.querySelector('#efi'), outDiv=form.querySelector('#efo');
  const eih=sel(HRS12,String(ih),'th',{}), eim=sel(MINS,String(im).padStart(2,'0'),'tm',{}), eip=sel(['AM','PM'],ip,'tap',{});
  const sep1=el('span','ts-sep',':'); inDiv.append(eih,sep1,eim,eip);
  const eoh=sel(HRS12,String(oh),'th',{}), eom=sel(MINS,String(om).padStart(2,'0'),'tm',{}), eop=sel(['AM','PM'],op,'tap',{});
  const sep2=el('span','ts-sep',':'); outDiv.append(eoh,sep2,eom,eop);

  function preview(){
    const sm=to24(eih.value,eim.value,eip.value), em=to24(eoh.value,eom.value,eop.value);
    let diff=em-sm; if(diff<=0) diff+=1440;
    const pv=form.querySelector('#efp');
    pv.innerHTML=diff>0?`<span class="ef-preview-num">${fmtD(diff)}</span><span class="ef-preview-plain"> — ${plainD(diff)}</span>`:`<span style="color:var(--red)">End must be after start</span>`;
  }
  [eih,eim,eip,eoh,eom,eop].forEach(s=>s.addEventListener('change',preview)); preview();

  form.querySelector('.ef-cancel').addEventListener('click',()=>{ form.closest('.he-ef,.dp-ef')?.classList.remove('open'); form.innerHTML=''; });
  form.querySelector('.ef-save').addEventListener('click',()=>{
    const dv=form.querySelector('.ef-date').value||dateStr;
    const sm=to24(eih.value,eim.value,eip.value), em=to24(eoh.value,eom.value,eop.value);
    let diff=em-sm; if(diff<=0) diff+=1440; if(diff<=0){ toast('Invalid times'); return; }
    const sh=pad2(sm), eh=pad2(em);
    upsert({...(isNew?{id:uid()}:entry), clockIn:new Date(dv+'T'+sh).toISOString(), clockOut:new Date(dv+'T'+eh).toISOString(), durationMins:diff, note:form.querySelector('.ef-note').value.trim(), source:'manual'});
    toast(isNew?'Entry added':'Entry updated'); onDone();
  });
  return form;
}

// ══════════════════════════════════════════════════════════════
//  CALENDAR PAGE
// ══════════════════════════════════════════════════════════════
function calPage(){
  const wrap=document.createElement('div');
  const {calY:y,calM:m,calSel:sel_}=S;
  const byDay={};
  entries().forEach(e=>{ const d=new Date(e.clockIn); if(d.getFullYear()===y&&d.getMonth()+1===m){ const day=d.getDate(); byDay[day]=(byDay[day]||0)+(e.durationMins||0); } });
  const tot=Object.values(byDay).reduce((a,b)=>a+b,0);
  const first=new Date(y,m-1,1).getDay(), days=new Date(y,m,0).getDate(), now=new Date();

  const cCard=div('card');
  const top=div('cal-top');
  const prev=el('button','btn btn-sm btn-ghost','‹'); prev.addEventListener('click',()=>{ if(S.calM===1){S.calM=12;S.calY--;}else S.calM--; S.calSel=null; renderTab2(); });
  const next=el('button','btn btn-sm btn-ghost','›'); next.addEventListener('click',()=>{ if(S.calM===12){S.calM=1;S.calY++;}else S.calM++; S.calSel=null; renderTab2(); });
  const mid=div('');
  mid.innerHTML=`<div class="cal-month">${MONS[m-1]} ${y}</div>${tot>0?`<div class="cal-sub">${plainD(tot)} logged</div>`:''}`;
  top.append(prev,mid,next); cCard.appendChild(top);

  const grid=div('cal-grid');
  DAYS.forEach(d=>{ const dn=div('cal-dn',d); grid.appendChild(dn); });
  for(let i=0;i<first;i++) grid.appendChild(div('cal-d empty'));
  for(let d=1;d<=days;d++){
    const isToday=y===now.getFullYear()&&m===now.getMonth()+1&&d===now.getDate();
    const mins=byDay[d]||0;
    const ds=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isSel=sel_===ds;
    const cell=div('cal-d '+(mins>0?'worked':'no-work')+(isToday?' today':'')+(isSel?' sel':''));
    cell.innerHTML=`<span class="cal-d-n">${d}</span>${mins>0?`<span class="cal-d-h">${fmtD(mins)}</span>`:''}`;
    cell.addEventListener('click',()=>{ S.calSel=S.calSel===ds?null:ds; renderTab2(); });
    grid.appendChild(cell);
  }
  cCard.appendChild(grid);
  const leg=div('cal-leg');
  leg.innerHTML=`<span class="leg"><span class="leg-dot" style="background:rgba(79,142,247,.2);border:1px solid rgba(79,142,247,.3)"></span>Worked</span><span class="leg"><span class="leg-dot" style="background:var(--input);border:1px solid var(--border)"></span>No record</span><span style="color:var(--text3);font-size:.7rem">Tap a day to edit</span>`;
  cCard.appendChild(leg);
  wrap.appendChild(cCard);

  // Day panel
  if(sel_){
    const panel=div('day-panel');
    const dee=entries().filter(e=>isoD(new Date(e.clockIn))===sel_);
    const dm=dee.reduce((s,e)=>s+(e.durationMins||0),0);
    const r=parseFloat(cfg().rate)||0;
    const ph=div('day-panel-header');
    ph.innerHTML=`<span class="day-panel-date">${new Date(sel_+'T12:00:00').toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}</span>`;
    const addBtn2=el('button','btn btn-primary btn-sm','+ Add');
    addBtn2.addEventListener('click',()=>{
      const af=$('dp-add-form'); if(!af) return;
      if(af.classList.contains('open')){ af.classList.remove('open'); af.innerHTML=''; return; }
      af.classList.add('open');
      af.appendChild(buildEF({id:'_new',clockIn:new Date(sel_+'T09:00').toISOString(),clockOut:new Date(sel_+'T17:00').toISOString(),durationMins:480,note:''},true,()=>renderTab2()));
    });
    ph.appendChild(addBtn2);
    panel.appendChild(ph);

    const tb=div('day-total-bar'); tb.innerHTML=`<span class="day-total-big">${dm>0?fmtD(dm):'No hours'}</span><span class="day-total-plain">${plainD(dm)}</span>${r>0&&dm>0?`<span class="day-total-pay">${money(dm/60*r)}</span>`:''}`;
    panel.appendChild(tb);

    if(dee.length===0) panel.innerHTML+=`<div class="empty" style="padding:1.5rem">No entries. Tap "+ Add" above.</div>`;
    dee.forEach(e=>{
      const ci=new Date(e.clockIn),co=new Date(e.clockOut);
      const de=div('dp-entry');
      de.innerHTML=`<div class="dp-times">${fmt12(ci.getHours()*60+ci.getMinutes())} → ${fmt12(co.getHours()*60+co.getMinutes())}</div><div class="dp-dur">${fmtD(e.durationMins)} <span class="dp-dur-plain">${plainD(e.durationMins)}</span></div>${e.note?`<div class="dp-note">${e.note}</div>`:''}<div class="dp-btns"><button class="btn btn-sm btn-ghost dp-ed" data-id="${e.id}">Edit</button><button class="btn btn-sm btn-danger dp-del" data-id="${e.id}">Delete</button></div><div class="he-ef" id="dpef-${e.id}"></div>`;
      panel.appendChild(de);
    });

    const addForm=div('he-ef'); addForm.id='dp-add-form'; panel.appendChild(addForm);

    $$('.dp-del',panel).forEach(b=>b.addEventListener('click',e=>{ if(confirm('Delete?')){ remove(e.currentTarget.dataset.id); renderTab2(); toast('Deleted'); } }));
    $$('.dp-ed',panel).forEach(b=>b.addEventListener('click',e=>{
      const id=e.currentTarget.dataset.id, ef=$('dpef-'+id); if(!ef) return;
      if(ef.classList.contains('open')){ ef.classList.remove('open'); ef.innerHTML=''; return; }
      const entry=entries().find(x=>x.id===id); if(!entry) return;
      ef.classList.add('open'); ef.appendChild(buildEF(entry,false,()=>renderTab2()));
    }));

    wrap.appendChild(panel);
  }
  return wrap;
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS PAGE
// ══════════════════════════════════════════════════════════════
function settingsPage(){
  const wrap=document.createElement('div');
  const s=cfg();
  const c1=div('card');
  c1.innerHTML=`<div class="card-title">Pay Settings</div>
    <div class="row2" style="margin-bottom:14px">
      <div class="fld"><label class="lbl">Hourly rate ($)</label><input class="inp" type="number" id="st-r" value="${s.rate||''}" placeholder="15.00" min="0" step="0.01"/></div>
      <div class="fld"><label class="lbl">OT after (hrs/wk)</label><input class="inp" type="number" id="st-o" value="${s.otWeek||40}" min="1"/></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-primary" id="sv-cfg">Save settings</button>
      <span id="sv-ok" style="display:none;font-size:.82rem;color:var(--green);font-weight:600">Saved ✓</span>
    </div>`;
  c1.querySelector('#sv-cfg').addEventListener('click',()=>{
    const ns={rate:c1.querySelector('#st-r').value,otWeek:parseFloat(c1.querySelector('#st-o').value)||40};
    saveCfg(ns); S.settings={...ns};
    const ok=c1.querySelector('#sv-ok'); ok.style.display='inline'; setTimeout(()=>ok.style.display='none',2000); toast('Settings saved');
  });
  wrap.appendChild(c1);

  const c2=div('card');
  c2.innerHTML=`<div class="card-title">Account</div>
    <div style="margin-bottom:14px"><div style="font-size:.9rem;font-weight:600">${S.users[S.user]?.name||''}</div><div style="font-size:.78rem;color:var(--text3)">${S.user}</div></div>
    <div style="font-size:.82rem;color:var(--text2);margin-bottom:14px;line-height:1.6">All data is stored locally in your browser. Use the export button to back up your records.</div>
    <button class="btn btn-danger" id="clr-all">Clear all my data</button>`;
  c2.querySelector('#clr-all').addEventListener('click',()=>{ if(confirm('Delete all data?')){ const u=S.users[S.user]; if(u){ u.entries=[]; saveDB(); toast('Cleared'); renderTab2(); } } });
  wrap.appendChild(c2);
  return wrap;
}

// ── Boot ────────────────────────────────────────────────────
function boot(){
  loadDB();
  showLogin(); $('login-screen').classList.remove('hidden');
  $('btn-logout').addEventListener('click',()=>{ S.user=null; S.clockIn=null; stopClock(); $('app').classList.add('hidden'); $('login-screen').classList.remove('hidden'); S.loginMode='login'; S.loginError=''; showLogin(); });
  $('btn-export').addEventListener('click',exportCSV);
  $('btn-ci').addEventListener('click',toggleCI);
  $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
}
document.addEventListener('DOMContentLoaded',boot);

// ── PWA ─────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
let _dip=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_dip=e;});