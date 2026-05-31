/* ─────────────────────────────────────────────────────────────
   TimeCard — app.js
   ───────────────────────────────────────────────────────────── */
'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const DB_KEY     = 'timecard_v3';
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TAB_TITLES = { calculator:'Calculator', timecard:'Time Card', calendar:'Calendar', history:'History', settings:'Settings' };
const HOURS12    = Array.from({length:12},(_,i)=>String(i+1));
const MINUTES    = Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  user: null, users: {}, tab: 'calculator',
  // Calculator — weekly grid (Mon–Sun)
  weekShifts: {
    Mon:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
    Tue:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
    Wed:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
    Thu:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
    Fri:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
    Sat:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
    Sun:{ startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:'' },
  },
  calcSettings: { rate:'', otWeek:40, otDay:8, payPeriod:'weekly', employeeName:'', payPeriodLabel:'' },
  nextShiftId: 1,
  // Clock-in
  clockInTime: null, clockTimer: null,
  // Calendar
  calYear: new Date().getFullYear(), calMonth: new Date().getMonth()+1,
  // History
  histFilter: 'all',
  // Time card
  weekOffset: 0, tcView: 'weekly',
  // Login
  loginMode: 'login', loginError: '',
};

// ─── Persistence ─────────────────────────────────────────────────────────────
function loadDB() {
  try { const d=JSON.parse(localStorage.getItem(DB_KEY)||'{}'); if(d.users) state.users=d.users; } catch(e){}
}
function saveDB() { try { localStorage.setItem(DB_KEY,JSON.stringify({users:state.users})); } catch(e){} }
function getEntries() { return state.users[state.user]?.entries||[]; }
function saveEntry(entry) {
  if(!state.users[state.user]) state.users[state.user]={entries:[]};
  const entries=state.users[state.user].entries;
  const idx=entries.findIndex(e=>e.id===entry.id);
  if(idx>=0) entries[idx]=entry; else entries.push(entry);
  saveDB();
}
function deleteEntry(id) { const u=state.users[state.user]; if(u) u.entries=u.entries.filter(e=>e.id!==id); saveDB(); }
function getUserSettings() { return state.users[state.user]?.settings||{rate:'',otWeek:40,otDay:8,payPeriod:'weekly'}; }
function saveUserSettings(s) {
  if(!state.users[state.user]) state.users[state.user]={entries:[]};
  state.users[state.user].settings=s; saveDB();
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function genId()    { return Date.now()+'-'+(Math.random()*9999|0); }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function hashPass(p){ let h=0; for(let i=0;i<p.length;i++){h=((h<<5)-h)+p.charCodeAt(i);h|=0;} return h.toString(36); }
function el(id)     { return document.getElementById(id); }
function qs(sel,ctx){ return (ctx||document).querySelector(sel); }
function qsa(sel,ctx){ return [...(ctx||document).querySelectorAll(sel)]; }
function fmt(n,d=2) { return parseFloat(n).toFixed(d); }
function fmtMoney(n){ return '$'+parseFloat(n).toFixed(2); }
function initials(name){ return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

function fmtDur(m) {
  if(!m||m<=0) return '0m';
  const h=Math.floor(m/60),mn=Math.floor(m%60);
  if(h===0) return mn+'m'; if(mn===0) return h+'h'; return h+'h '+mn+'m';
}
function humanDur(m) {
  if(!m||m<=0) return 'no time';
  const h=Math.floor(m/60),mn=Math.floor(m%60);
  if(h===0) return mn+' minute'+(mn!==1?'s':'');
  if(mn===0) return h+' hour'+(h!==1?'s':'')+' exactly';
  if(mn<=5)  return h+' hour'+(h!==1?'s':'')+' and a few extra minutes';
  if(mn<=15) return h+' hour'+(h!==1?'s':'')+' and about a quarter more';
  if(mn>=25&&mn<=35) return h+' and a half hour'+(h!==1?'s':'');
  if(mn>=50) return 'almost '+(h+1)+' hour'+((h+1)!==1?'s':'');
  return h+' hour'+(h!==1?'s':'')+' and '+mn+' minute'+(mn!==1?'s':'');
}
function shortDate(d){ return new Date(d+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'}); }

// Convert 12h fields to 24h total minutes
function to24Mins(h,m,ampm) {
  let hh=parseInt(h)||0, mm=parseInt(m)||0;
  if(ampm==='AM'){ if(hh===12) hh=0; }
  else { if(hh!==12) hh+=12; }
  return hh*60+mm;
}

// Format minutes as 12h display string
function fmt12(totalMins) {
  if(totalMins<0) totalMins+=1440;
  let h=Math.floor(totalMins/60)%24, m=totalMins%60;
  const ampm=h<12?'AM':'PM';
  if(h===0) h=12; else if(h>12) h-=12;
  return h+':'+(String(m).padStart(2,'0'))+' '+ampm;
}

// Compute hours for a shift row
function calcRowMins(row) {
  if(!row.startH||!row.startM||!row.endH||!row.endM) return 0;
  let startMins=to24Mins(row.startH,row.startM,row.startP);
  let endMins=to24Mins(row.endH,row.endM,row.endP);
  if(endMins<=startMins) endMins+=1440; // overnight
  let diff=endMins-startMins;
  const breakMins=(parseInt(row.breakH)||0)*60+(parseInt(row.breakM)||0);
  diff-=breakMins;
  return Math.max(0,diff);
}

function fmtElapsed(ms) {
  const s=Math.floor(ms/1000),h=Math.floor(s/3600),min=Math.floor((s%3600)/60),sec=s%60;
  return (h?h+':':'')+(String(min).padStart(h?2:1,'0'))+':'+(String(sec).padStart(2,'0'));
}

// ─── Clock-in ────────────────────────────────────────────────────────────────
function startClockTimer() {
  if(state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer=setInterval(updateClockDisplay,1000);
  updateClockDisplay();
}
function stopClockTimer() { if(state.clockTimer){clearInterval(state.clockTimer);state.clockTimer=null;} }
function updateClockDisplay() {
  const timerEl=el('clockin-timer'),labelEl=el('clockin-label'),dotEl=qs('.pulse-dot'),btn=el('btn-clockin');
  if(state.clockInTime){
    const elapsed=Date.now()-state.clockInTime;
    if(timerEl) timerEl.textContent=fmtElapsed(elapsed);
    if(labelEl) labelEl.textContent='Clocked in';
    if(dotEl)   dotEl.classList.add('active');
    if(btn){btn.textContent='Clock Out';btn.classList.add('clocked-in');}
  } else {
    if(timerEl) timerEl.textContent='';
    if(labelEl) labelEl.textContent='Not clocked in';
    if(dotEl)   dotEl.classList.remove('active');
    if(btn){btn.textContent='Clock In';btn.classList.remove('clocked-in');}
  }
}
function handleClockToggle() {
  if(!state.clockInTime){
    state.clockInTime=Date.now(); startClockTimer();
  } else {
    const clockOutTime=Date.now();
    const durationMins=Math.round((clockOutTime-state.clockInTime)/60000);
    saveEntry({id:genId(),clockIn:new Date(state.clockInTime).toISOString(),clockOut:new Date(clockOutTime).toISOString(),durationMins,note:'',source:'clockin'});
    state.clockInTime=null; stopClockTimer(); updateClockDisplay();
    showToast('Shift saved — '+humanDur(durationMins));
    if(state.tab==='history'||state.tab==='timecard') renderTab();
  }
}

// ─── Live clock ──────────────────────────────────────────────────────────────
function startLiveClock() {
  function tick() {
    const clockEl=el('live-clock');
    if(clockEl) {
      const now=new Date();
      let h=now.getHours(),m=now.getMinutes(),s=now.getSeconds();
      const ampm=h<12?'AM':'PM';
      if(h===0)h=12; else if(h>12)h-=12;
      clockEl.textContent=h+':'+(String(m).padStart(2,'0'))+':'+(String(s).padStart(2,'0'))+' '+ampm;
    }
  }
  tick(); setInterval(tick,1000);
}

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg) {
  let toast=el('toast');
  if(!toast){
    toast=document.createElement('div'); toast.id='toast';
    toast.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 16px;border-radius:10px;font-family:var(--font-sans);font-size:0.8rem;font-weight:500;transition:all 0.25s ease;pointer-events:none;background:var(--bg-overlay);border:1px solid var(--border-mid);color:var(--text-primary)';
    document.body.appendChild(toast);
  }
  toast.textContent=msg; toast.style.opacity='1'; toast.style.transform='translateY(0)';
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateY(8px)';},2500);
}

// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportCSV() {
  const entries=getEntries();
  if(!entries.length){showToast('No entries to export');return;}
  const sets=getUserSettings(), rate=parseFloat(sets.rate)||0;
  const rows=[['Date','Day','Clock In','Clock Out','Duration (hrs)','Duration (mins)','Note',rate?'Pay ($)':''].filter(Boolean)];
  [...entries].sort((a,b)=>new Date(a.clockIn)-new Date(b.clockIn)).forEach(e=>{
    const cIn=new Date(e.clockIn),cOut=new Date(e.clockOut);
    const row=[cIn.toLocaleDateString(),DAYS_LONG[cIn.getDay()],fmt12(cIn.getHours()*60+cIn.getMinutes()),fmt12(cOut.getHours()*60+cOut.getMinutes()),(e.durationMins/60).toFixed(2),e.durationMins,e.note||''];
    if(rate) row.push((e.durationMins/60*rate).toFixed(2));
    rows.push(row);
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='timecard-export.csv'; a.click();
  URL.revokeObjectURL(url); showToast('CSV exported');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function renderLogin() {
  const lScreen=el('login-screen'),app=el('app');
  lScreen.classList.remove('hidden'); app.classList.add('hidden');
  const title=el('login-title'),sub=el('login-sub'),fields=el('login-fields'),submit=el('login-submit'),toggleP=el('login-toggle-text'),errEl=el('login-error');
  errEl.classList.add('hidden'); errEl.textContent=state.loginError||'';
  if(state.loginError) errEl.classList.remove('hidden');
  const isLogin=state.loginMode==='login';
  title.textContent=isLogin?'Welcome back':'Create account';
  sub.textContent=isLogin?'Sign in to continue tracking your hours.':'Start tracking your work hours for free.';
  submit.textContent=isLogin?'Sign in':'Create account';
  submit.className='btn btn-primary btn-full';
  fields.innerHTML=`
    ${!isLogin?`<div class="field"><label>Full name</label><input id="li-name" type="text" placeholder="Your name" autocomplete="name"/></div>`:''}
    <div class="field"><label>Email</label><input id="li-email" type="email" placeholder="you@email.com" autocomplete="email"/></div>
    <div class="field"><label>Password</label><input id="li-pass" type="password" placeholder="••••••••" autocomplete="${isLogin?'current-password':'new-password'}"/></div>`;
  toggleP.innerHTML=isLogin?`Don't have an account? <button id="li-toggle">Register free</button>`:`Already have an account? <button id="li-toggle">Sign in</button>`;
  submit.onclick=handleLoginSubmit;
  el('li-pass').onkeydown=e=>{if(e.key==='Enter')handleLoginSubmit();};
  el('li-toggle').onclick=()=>{state.loginMode=isLogin?'register':'login';state.loginError='';renderLogin();};
}

function handleLoginSubmit() {
  const email=el('li-email').value.trim().toLowerCase(), pass=el('li-pass').value;
  if(state.loginMode==='register'){
    const name=el('li-name').value.trim();
    if(!name||!email||!pass){state.loginError='All fields are required.';renderLogin();return;}
    if(state.users[email]){state.loginError='That email is already registered.';renderLogin();return;}
    state.users[email]={name,passHash:hashPass(pass),entries:[]}; saveDB();
    state.user=email; state.loginError=''; launchApp();
  } else {
    if(!email||!pass){state.loginError='Please enter your email and password.';renderLogin();return;}
    const u=state.users[email];
    if(!u||u.passHash!==hashPass(pass)){state.loginError='Invalid email or password.';renderLogin();return;}
    state.user=email; state.loginError=''; launchApp();
  }
}

function launchApp() {
  el('login-screen').classList.add('hidden'); el('app').classList.remove('hidden');
  const u=state.users[state.user];
  el('sidebar-name').textContent=u?.name||state.user;
  el('sidebar-email').textContent=state.user;
  el('sidebar-avatar').textContent=initials(u?.name||state.user);
  const sets=getUserSettings(); state.calcSettings={...state.calcSettings,...sets};
  startLiveClock(); if(state.clockInTime) startClockTimer(); renderTab();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setTab(tab) {
  state.tab=tab;
  qsa('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  el('topbar-title').textContent=TAB_TITLES[tab]||tab;
  renderTab();
  el('sidebar').classList.remove('open'); el('sidebar-overlay').classList.add('hidden');
}
function renderTab() {
  const content=el('tab-content'); content.innerHTML='';
  const fns={calculator:renderCalculator,timecard:renderTimeCard,calendar:renderCalendar,history:renderHistory,settings:renderSettings};
  if(fns[state.tab]) content.appendChild(fns[state.tab]());
}
function div(cls,html){const d=document.createElement('div');d.className=cls;if(html!==undefined)d.innerHTML=html;return d;}

// ─── SELECT BUILDER ──────────────────────────────────────────────────────────
function buildSelect(options, selected, cls, dataAttr) {
  const s=document.createElement('select');
  s.className=cls; if(dataAttr) Object.entries(dataAttr).forEach(([k,v])=>s.dataset[k]=v);
  options.forEach(o=>{
    const opt=document.createElement('option');
    opt.value=o; opt.textContent=o; if(o===selected) opt.selected=true;
    s.appendChild(opt);
  });
  return s;
}

// ─── CALCULATOR TAB (Weekly grid) ────────────────────────────────────────────
function renderCalculator() {
  const wrap=document.createElement('div');
  const s=state.calcSettings;

  // ── Header card: employee name + pay period ──
  const headerCard=div('card');
  headerCard.innerHTML=`
    <div class="calc-header-fields">
      <div class="field" style="flex:1">
        <label>Employee Name</label>
        <input type="text" id="calc-emp-name" placeholder="Employee Name" value="${s.employeeName||''}"/>
      </div>
      <div class="field" style="flex:1">
        <label>Pay Period</label>
        <input type="text" id="calc-pay-period-label" placeholder="e.g. Jun 1 – Jun 7, 2025" value="${s.payPeriodLabel||''}"/>
      </div>
    </div>
  `;
  wrap.appendChild(headerCard);

  // ── Settings strip ──
  const settingsCard=div('card');
  settingsCard.innerHTML=`
    <div class="card-header"><span class="card-title">Pay settings</span></div>
    <div class="form-row cols-4">
      <div class="field"><label>Hourly rate ($)</label><input type="number" id="cs-rate" value="${s.rate||''}" placeholder="0.00" min="0" step="0.01"/></div>
      <div class="field"><label>Pay period</label>
        <select id="cs-period">
          <option value="weekly"${s.payPeriod==='weekly'?' selected':''}>Weekly</option>
          <option value="biweekly"${s.payPeriod==='biweekly'?' selected':''}>Bi-weekly</option>
          <option value="monthly"${s.payPeriod==='monthly'?' selected':''}>Monthly</option>
        </select>
      </div>
      <div class="field"><label>Weekly OT after</label><input type="number" id="cs-otweek" value="${s.otWeek||40}" min="1"/><div class="hint">hrs/week</div></div>
      <div class="field"><label>Daily OT after</label><input type="number" id="cs-otday" value="${s.otDay||8}" min="1" step="0.5"/><div class="hint">hrs/day</div></div>
    </div>
  `;
  wrap.appendChild(settingsCard);
  ['cs-rate','cs-period','cs-otweek','cs-otday'].forEach(id=>{
    const inp=settingsCard.querySelector('#'+id);
    if(inp) inp.addEventListener('input',()=>{
      state.calcSettings={...state.calcSettings,rate:el('cs-rate')?.value||'',payPeriod:el('cs-period')?.value||'weekly',otWeek:parseFloat(el('cs-otweek')?.value)||40,otDay:parseFloat(el('cs-otday')?.value)||8};
      saveUserSettings(state.calcSettings); refreshCalcView();
    });
  });
  headerCard.querySelector('#calc-emp-name').addEventListener('input',e=>{state.calcSettings.employeeName=e.target.value;});
  headerCard.querySelector('#calc-pay-period-label').addEventListener('input',e=>{state.calcSettings.payPeriodLabel=e.target.value;});

  // ── Weekly grid ──
  const gridCard=div('card');
  const gridWrap=document.createElement('div');
  gridWrap.className='weekly-grid';

  // Table header
  const thead=document.createElement('div');
  thead.className='wg-header';
  thead.innerHTML=`
    <div class="wg-day-col">Day</div>
    <div class="wg-time-col">Starting Time</div>
    <div class="wg-time-col">Ending Time</div>
    <div class="wg-break-col">Break <span class="break-hint" title="Enter break time to deduct (hours:minutes)">?</span></div>
    <div class="wg-total-col">Total</div>
  `;
  gridWrap.appendChild(thead);

  const WEEK_DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let totalWeekMins=0;

  WEEK_DAYS.forEach(day=>{
    const row=state.weekShifts[day];
    const rowMins=calcRowMins(row);
    totalWeekMins+=rowMins;
    const dh=rowMins/60;
    const otD=parseFloat(s.otDay)||8;
    const isOT=dh>otD&&rowMins>0;

    const rowEl=document.createElement('div');
    rowEl.className='wg-row';
    rowEl.dataset.day=day;

    // Day label
    const dayDiv=document.createElement('div');
    dayDiv.className='wg-day-col wg-day-label';
    dayDiv.textContent=day==='Mon'?'Monday':day==='Tue'?'Tuesday':day==='Wed'?'Wednesday':day==='Thu'?'Thursday':day==='Fri'?'Friday':day==='Sat'?'Saturday':'Sunday';
    rowEl.appendChild(dayDiv);

    // Start time
    const startDiv=document.createElement('div');
    startDiv.className='wg-time-col';
    const startInner=document.createElement('div');
    startInner.className='time-picker';
    const sh=buildSelect(HOURS12,row.startH,'tp-select tp-h',{day,field:'startH'});
    const sm=buildSelect(MINUTES,row.startM,'tp-select tp-m',{day,field:'startM'});
    const sp=buildSelect(['AM','PM'],row.startP,'tp-select tp-ampm',{day,field:'startP'});
    startInner.append(sh,document.createTextNode(' : '),sm,' ',sp);
    startDiv.appendChild(startInner);
    rowEl.appendChild(startDiv);

    // End time
    const endDiv=document.createElement('div');
    endDiv.className='wg-time-col';
    const endInner=document.createElement('div');
    endInner.className='time-picker';
    const eh=buildSelect(HOURS12,row.endH,'tp-select tp-h',{day,field:'endH'});
    const em=buildSelect(MINUTES,row.endM,'tp-select tp-m',{day,field:'endM'});
    const ep=buildSelect(['AM','PM'],row.endP,'tp-select tp-ampm',{day,field:'endP'});
    endInner.append(eh,document.createTextNode(' : '),em,' ',ep);
    endDiv.appendChild(endInner);
    rowEl.appendChild(endDiv);

    // Break
    const breakDiv=document.createElement('div');
    breakDiv.className='wg-break-col';
    const breakInner=document.createElement('div');
    breakInner.className='break-picker';
    const bh=document.createElement('input');
    bh.type='number'; bh.min='0'; bh.max='23'; bh.placeholder='0';
    bh.className='bp-input'; bh.value=row.breakH||''; bh.dataset.day=day; bh.dataset.field='breakH';
    const bm=document.createElement('input');
    bm.type='number'; bm.min='0'; bm.max='59'; bm.placeholder='00';
    bm.className='bp-input'; bm.value=row.breakM||''; bm.dataset.day=day; bm.dataset.field='breakM';
    breakInner.append(bh,document.createTextNode(' : '),bm);
    breakDiv.appendChild(breakInner);
    rowEl.appendChild(breakDiv);

    // Total
    const totalDiv=document.createElement('div');
    totalDiv.className='wg-total-col';
    if(rowMins>0){
      totalDiv.textContent=fmt(dh);
      totalDiv.style.color=isOT?'var(--amber)':'var(--text-primary)';
      totalDiv.style.fontWeight='600';
    } else {
      totalDiv.textContent='';
    }
    rowEl.appendChild(totalDiv);

    gridWrap.appendChild(rowEl);
  });

  // Footer totals row
  const rate=parseFloat(s.rate)||0;
  const otW=parseFloat(s.otWeek)||40, otD=parseFloat(s.otDay)||8;
  const totalH=totalWeekMins/60;
  const regH=Math.min(totalH,otW), otH=Math.max(0,totalH-otW);
  const totalPay=regH*rate+otH*rate*1.5;

  const footer=document.createElement('div');
  footer.className='wg-footer';
  footer.innerHTML=`
    <div class="wg-day-col"></div>
    <div class="wg-time-col"></div>
    <div class="wg-time-col"></div>
    <div class="wg-break-col"></div>
    <div class="wg-total-col wg-footer-total">
      <span class="wg-total-label">Weekly Total:</span>
      <span class="wg-total-value" style="color:var(--green)">${totalWeekMins>0?fmt(totalH):''}</span>
    </div>
  `;
  gridWrap.appendChild(footer);

  gridCard.innerHTML=`<div class="card-header"><span class="card-title">Weekly Time Sheet</span></div>`;
  gridCard.appendChild(gridWrap);

  // Action buttons
  const actionsRow=document.createElement('div');
  actionsRow.className='calc-actions';
  actionsRow.innerHTML=`
    <button class="btn btn-calc-print" id="calc-print">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="4" y="7" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M6 7V4h8v3M6 13h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      PRINT
    </button>
    <button class="btn btn-calc-action" id="calc-calculate">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      CALCULATE
    </button>
    <button class="btn btn-calc-action" id="calc-clear">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      CLEAR
    </button>
    <div class="calc-weekly-total">
      Weekly Total: <span style="color:var(--green);font-weight:700">${totalWeekMins>0?fmt(totalH):''}</span>
    </div>
  `;
  gridCard.appendChild(actionsRow);
  wrap.appendChild(gridCard);

  // ── Results (only shown after CALCULATE) ──
  if(state.calcShowResults&&totalWeekMins>0){
    const statGrid=div('stat-grid');
    statGrid.innerHTML=`
      <div class="stat-card accent"><div class="stat-label">Total hours</div><div class="stat-value">${fmt(totalH)}h</div><div class="stat-sub">${humanDur(totalWeekMins)}</div></div>
      <div class="stat-card"><div class="stat-label">Regular hours</div><div class="stat-value">${fmt(regH)}h</div><div class="stat-sub">${rate>0?fmtMoney(regH*rate)+' earned':'Threshold: '+otW+'h'}</div></div>
      <div class="stat-card ${otH>0?'amber':''}"><div class="stat-label">Overtime</div><div class="stat-value">${otH>0?fmt(otH)+'h':'None'}</div><div class="stat-sub">${rate>0&&otH>0?fmtMoney(otH*rate*1.5)+' (1.5×)':otH>0?'Over '+otW+'h/wk':'Within threshold'}</div></div>
      ${rate>0?`<div class="stat-card green"><div class="stat-label">Total pay</div><div class="stat-value">${fmtMoney(totalPay)}</div><div class="stat-sub">@ ${fmtMoney(rate)}/hr</div></div>`:''}
    `;
    wrap.appendChild(statGrid);

    // Day breakdown table
    const breakdownCard=div('card');
    const WEEK_DAYS2=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const DAY_FULL={Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'};
    breakdownCard.innerHTML=`
      <div class="card-header"><span class="card-title">Day breakdown</span></div>
      <table class="data-table">
        <thead><tr><th>Day</th><th>Start</th><th>End</th><th>Break</th><th>Total</th><th>Daily OT</th>${rate>0?'<th>Pay</th>':''}</tr></thead>
        <tbody>
          ${WEEK_DAYS2.map(day=>{
            const row=state.weekShifts[day];
            const rm=calcRowMins(row);
            if(!rm) return `<tr><td style="color:var(--text-muted)">${DAY_FULL[day]}</td><td colspan="${rate>0?5:4}" style="color:var(--text-muted);font-size:0.75rem">—</td></tr>`;
            const dh=rm/60, dOT=Math.max(0,dh-otD);
            const breakMins=(parseInt(row.breakH)||0)*60+(parseInt(row.breakM)||0);
            return `<tr>
              <td style="font-weight:500">${DAY_FULL[day]}</td>
              <td class="mono" style="font-size:0.78rem">${row.startH}:${row.startM} ${row.startP}</td>
              <td class="mono" style="font-size:0.78rem">${row.endH}:${row.endM} ${row.endP}</td>
              <td class="mono" style="font-size:0.78rem;color:var(--text-muted)">${breakMins>0?fmtDur(breakMins):'—'}</td>
              <td class="mono" style="font-weight:600">${fmt(dh)}h</td>
              <td>${dOT>0?`<span class="badge badge-amber">+${fmt(dOT)}h OT</span>`:'<span style="color:var(--text-muted)">—</span>'}</td>
              ${rate>0?`<td class="mono" style="color:var(--green)">${fmtMoney(dh*rate)}</td>`:''}
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr>
          <td style="font-weight:600">Total</td><td></td><td></td><td></td>
          <td class="mono" style="font-weight:600">${fmt(totalH)}h</td>
          <td>${otH>0?`<span class="badge badge-amber">${fmt(otH)}h OT</span>`:'—'}</td>
          ${rate>0?`<td class="mono" style="color:var(--green);font-weight:600">${fmtMoney(totalPay)}</td>`:''}
        </tr></tfoot>
      </table>
    `;
    wrap.appendChild(breakdownCard);

    // Summary
    const summary=div('summary-callout');
    let t='You worked a total of <strong>'+humanDur(totalWeekMins)+'</strong>';
    if(otH>0) t+=', including <strong>'+humanDur(otH*60)+' of overtime</strong>';
    t+='.';
    if(rate>0){ t+=' At <strong>'+fmtMoney(rate)+'/hr</strong>'; if(otH>0) t+=' with overtime at 1.5×'; t+=', your estimated pay is <strong>'+fmtMoney(totalPay)+'</strong>.'; }
    summary.innerHTML=t;
    wrap.appendChild(summary);

    // Save to history
    const saveWrap=div(''); saveWrap.style.cssText='text-align:center;margin-bottom:2rem';
    const saveBtn=document.createElement('button');
    saveBtn.className='btn btn-primary'; saveBtn.textContent='Save to history & calendar'; saveBtn.style.padding='10px 32px';
    saveBtn.addEventListener('click',()=>{
      let saved=0;
      const today=new Date();
      const dayOfWeek=today.getDay(); // 0=Sun
      WEEK_DAYS2.forEach((day,i)=>{
        const row=state.weekShifts[day]; const rm=calcRowMins(row); if(!rm) return;
        // Map Mon=0..Sun=6 to actual dates this week
        const dayIdx=[1,2,3,4,5,6,0][i]; // Mon=1..Sun=0
        const diff=dayIdx-dayOfWeek;
        const d=new Date(today); d.setDate(today.getDate()+diff);
        const dateStr=d.toISOString().split('T')[0];
        const startMins=to24Mins(row.startH,row.startM,row.startP);
        const endMins=to24Mins(row.endH,row.endM,row.endP);
        const sh=String(Math.floor(startMins/60)).padStart(2,'0')+':'+String(startMins%60).padStart(2,'0');
        const eh=String(Math.floor(endMins/60)).padStart(2,'0')+':'+String(endMins%60).padStart(2,'0');
        saveEntry({id:genId(),clockIn:new Date(dateStr+'T'+sh).toISOString(),clockOut:new Date(dateStr+'T'+eh).toISOString(),durationMins:rm,note:'',source:'manual'});
        saved++;
      });
      if(saved){ saveBtn.textContent='✓ Saved '+saved+' shift'+(saved!==1?'s':''); saveBtn.style.background='var(--green)'; saveBtn.style.borderColor='var(--green)'; setTimeout(()=>{saveBtn.textContent='Save to history & calendar';saveBtn.style.background='';saveBtn.style.borderColor='';},2500); showToast(saved+' shift'+(saved!==1?'s':'')+' saved'); }
    });
    saveWrap.appendChild(saveBtn);
    wrap.appendChild(saveWrap);
  }

  // ── Bind all select / input changes ──
  qsa('.tp-select',wrap).forEach(sel=>{
    sel.addEventListener('change',e=>{
      const {day,field}=e.target.dataset;
      state.weekShifts[day][field]=e.target.value;
      refreshCalcView();
    });
  });
  qsa('.bp-input',wrap).forEach(inp=>{
    inp.addEventListener('input',e=>{
      const {day,field}=e.target.dataset;
      state.weekShifts[day][field]=e.target.value;
      refreshCalcView();
    });
  });

  // CALCULATE button
  const calcBtn=wrap.querySelector('#calc-calculate');
  if(calcBtn) calcBtn.addEventListener('click',()=>{ state.calcShowResults=true; refreshCalcView(); });

  // CLEAR button
  const clearBtn=wrap.querySelector('#calc-clear');
  if(clearBtn) clearBtn.addEventListener('click',()=>{
    if(confirm('Clear all time entries?')){
      Object.keys(state.weekShifts).forEach(day=>{ state.weekShifts[day]={startH:'',startM:'',startP:'AM',endH:'',endM:'',endP:'PM',breakH:'',breakM:''}; });
      state.calcShowResults=false; refreshCalcView();
    }
  });

  // PRINT
  const printBtn=wrap.querySelector('#calc-print');
  if(printBtn) printBtn.addEventListener('click',()=>window.print());

  return wrap;
}

function refreshCalcView() {
  const content=el('tab-content');
  const scrollY=content.scrollTop;
  content.innerHTML='';
  content.appendChild(renderCalculator());
  content.scrollTop=scrollY;
}

// ─── Time Card Tab ────────────────────────────────────────────────────────────
function renderTimeCard() {
  const wrap=document.createElement('div');
  const sets=getUserSettings(), entries=getEntries();
  function getWeekStart(offset=0){ const d=new Date(); d.setDate(d.getDate()-d.getDay()+offset*7); d.setHours(0,0,0,0); return d; }
  const ws=getWeekStart(state.weekOffset);
  const we=new Date(ws);
  const numDays=state.tcView==='biweekly'?14:state.tcView==='monthly'?new Date(ws.getFullYear(),ws.getMonth()+1,0).getDate():7;
  we.setDate(ws.getDate()+numDays-1); we.setHours(23,59,59,999);
  const filtered=entries.filter(e=>{const d=new Date(e.clockIn);return d>=ws&&d<=we;});
  const byDay={};
  filtered.forEach(e=>{
    const k=new Date(e.clockIn).toISOString().split('T')[0];
    if(!byDay[k])byDay[k]={mins:0,entries:[]};
    byDay[k].mins+=e.durationMins||0; byDay[k].entries.push(e);
  });
  const totalMins=filtered.reduce((s,e)=>s+(e.durationMins||0),0);
  const totalH=totalMins/60, rate=parseFloat(sets.rate)||0;
  const otW=sets.otWeek||40, otD=sets.otDay||8;
  const regH=Math.min(totalH,otW), otH=Math.max(0,totalH-otW);
  const totalPay=regH*rate+otH*rate*1.5;
  const days=[]; for(let i=0;i<numDays;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);days.push(d);}

  const card=div('card');
  card.innerHTML=`
    <div class="card-header" style="flex-wrap:wrap;gap:10px">
      <div class="period-tabs">${['weekly','biweekly','monthly'].map(v=>`<button class="period-tab${state.tcView===v?' active':''}" data-tcview="${v}">${v.charAt(0).toUpperCase()+v.slice(1)}</button>`).join('')}</div>
      <div class="week-nav">
        <button class="btn btn-outline btn-sm" id="wk-prev">‹ Prev</button>
        <div class="week-label">${ws.toLocaleDateString([],{month:'short',day:'numeric'})} – ${we.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}</div>
        <button class="btn btn-outline btn-sm" id="wk-next">Next ›</button>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card accent"><div class="stat-label">Total hours</div><div class="stat-value">${fmt(totalH)}h</div><div class="stat-sub">${humanDur(totalMins)}</div></div>
      <div class="stat-card"><div class="stat-label">Regular</div><div class="stat-value">${fmt(regH)}h</div><div class="stat-sub">${rate>0?fmtMoney(regH*rate):'Threshold: '+otW+'h'}</div></div>
      <div class="stat-card ${otH>0?'amber':''}"><div class="stat-label">Overtime</div><div class="stat-value">${otH>0?fmt(otH)+'h':'None'}</div><div class="stat-sub">${rate>0&&otH>0?fmtMoney(otH*rate*1.5)+' (1.5×)':'—'}</div></div>
      ${rate>0?`<div class="stat-card green"><div class="stat-label">Est. pay</div><div class="stat-value">${fmtMoney(totalPay)}</div><div class="stat-sub">@ ${fmtMoney(rate)}/hr</div></div>`:''}
    </div>
    <table class="data-table">
      <thead><tr><th>Day</th><th>Date</th><th>Shifts</th><th>Hours</th><th>Daily OT</th>${rate>0?'<th>Pay</th>':''}</tr></thead>
      <tbody>
        ${days.map(d=>{
          const k=d.toISOString().split('T')[0]; const dd=byDay[k]; const dm=dd?dd.mins:0; const dh=dm/60; const dOT=Math.max(0,dh-otD); const isToday=d.toDateString()===new Date().toDateString();
          return `<tr style="${isToday?'background:rgba(79,142,247,0.05)':''}">
            <td style="font-weight:${isToday?600:400};color:${isToday?'var(--accent)':'var(--text-primary)'}">${DAYS[d.getDay()]}</td>
            <td class="mono" style="color:var(--text-muted);font-size:0.75rem">${d.toLocaleDateString([],{month:'short',day:'numeric'})}</td>
            <td>${dd?dd.entries.map(e=>`<div style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${fmt12(new Date(e.clockIn).getHours()*60+new Date(e.clockIn).getMinutes())}–${fmt12(new Date(e.clockOut).getHours()*60+new Date(e.clockOut).getMinutes())}</div>`).join(''):'<span style="color:var(--border-mid)">—</span>'}</td>
            <td>${dm>0?`<div class="mono" style="font-weight:500;font-size:0.8rem">${fmt(dh)}h</div><div style="font-size:0.7rem;color:var(--text-muted)">${fmtDur(dm)}</div>`:'<span style="color:var(--border-mid)">—</span>'}</td>
            <td>${dOT>0?`<span class="badge badge-amber">+${fmt(dOT)}h</span>`:'<span style="color:var(--border-mid);font-size:0.75rem">—</span>'}</td>
            ${rate>0?`<td class="mono" style="color:var(--green);font-size:0.78rem">${dm>0?fmtMoney(dh*rate):'—'}</td>`:''}
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="2" style="font-weight:600">Total</td><td></td>
        <td class="mono" style="font-weight:600">${fmt(totalH)}h</td>
        <td>${otH>0?`<span class="badge badge-amber">${fmt(otH)}h OT</span>`:'—'}</td>
        ${rate>0?`<td class="mono" style="color:var(--green);font-weight:600">${fmtMoney(totalPay)}</td>`:''}
      </tr></tfoot>
    </table>
  `;
  qsa('[data-tcview]',card).forEach(b=>b.addEventListener('click',()=>{state.tcView=b.dataset.tcview;state.weekOffset=0;renderTab();}));
  card.querySelector('#wk-prev').addEventListener('click',()=>{state.weekOffset--;renderTab();});
  card.querySelector('#wk-next').addEventListener('click',()=>{state.weekOffset++;renderTab();});
  wrap.appendChild(card); return wrap;
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function renderCalendar() {
  const wrap=document.createElement('div');
  const entries=getEntries(); const {calYear:y,calMonth:m}=state;
  const byDay={};
  entries.forEach(e=>{const d=new Date(e.clockIn);if(d.getFullYear()===y&&d.getMonth()+1===m){const day=d.getDate();byDay[day]=(byDay[day]||0)+(e.durationMins||0);}});
  const totalMins=Object.values(byDay).reduce((a,b)=>a+b,0);
  const firstDay=new Date(y,m-1,1).getDay(), daysIn=new Date(y,m,0).getDate(), today=new Date();
  const cells=[]; for(let i=0;i<firstDay;i++) cells.push(null); for(let d=1;d<=daysIn;d++) cells.push(d);
  const card=div('card');
  card.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <button class="btn btn-outline btn-sm" id="cal-prev">‹</button>
      <div style="text-align:center">
        <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:500">${MONTHS[m-1]} ${y}</div>
        ${totalMins>0?`<div style="font-size:0.72rem;color:var(--accent);margin-top:3px">${humanDur(totalMins)} logged this month</div>`:''}
      </div>
      <button class="btn btn-outline btn-sm" id="cal-next">›</button>
    </div>
    <div class="cal-grid">
      ${DAYS.map(d=>`<div class="cal-day-name">${d}</div>`).join('')}
      ${cells.map(day=>{
        if(!day) return '<div class="cal-day empty"></div>';
        const isToday=y===today.getFullYear()&&m===today.getMonth()+1&&day===today.getDate();
        const mins=byDay[day]||0, worked=mins>0;
        return `<div class="cal-day ${worked?'worked':'no-work'}${isToday?' today':''}"><span class="cal-num">${day}</span>${worked?`<span class="cal-hrs">${(mins/60).toFixed(1)}h</span>`:''}</div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;margin-top:1rem;font-size:0.72rem;color:var(--text-muted)">
      <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--accent-dim);border:1px solid rgba(79,142,247,.3);border-radius:3px;display:inline-block"></span>Worked</span>
      <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--bg-raised);border:1px solid var(--border-subtle);border-radius:3px;display:inline-block"></span>No record</span>
    </div>
  `;
  card.querySelector('#cal-prev').addEventListener('click',()=>{if(state.calMonth===1){state.calMonth=12;state.calYear--;}else state.calMonth--;renderTab();});
  card.querySelector('#cal-next').addEventListener('click',()=>{if(state.calMonth===12){state.calMonth=1;state.calYear++;}else state.calMonth++;renderTab();});
  wrap.appendChild(card); return wrap;
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function renderHistory() {
  const wrap=document.createElement('div');
  const now=new Date(), entries=getEntries();
  const filters=['all','today','week','month'];
  const filtered=entries.filter(e=>{
    const d=new Date(e.clockIn);
    if(state.histFilter==='today') return d.toDateString()===now.toDateString();
    if(state.histFilter==='week')  return (now-d)<7*86400000;
    if(state.histFilter==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    return true;
  }).sort((a,b)=>new Date(b.clockIn)-new Date(a.clockIn));
  const totalMins=filtered.reduce((s,e)=>s+(e.durationMins||0),0);
  const card=div('card');
  card.innerHTML=`
    <div class="card-header" style="flex-wrap:wrap;gap:10px">
      <span class="card-title">Work history</span>
      <div class="period-tabs">${filters.map(f=>`<button class="period-tab${state.histFilter===f?' active':''}" data-hfilt="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}</div>
    </div>
    ${totalMins>0?`<div style="margin-bottom:1rem;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="badge badge-accent">${filtered.length} record${filtered.length!==1?'s':''}</span><span style="font-size:0.8rem;color:var(--text-secondary)">Total: <span class="mono" style="color:var(--accent)">${fmtDur(totalMins)}</span> · ${humanDur(totalMins)}</span></div>`:''}
    ${filtered.length===0?`<div class="empty-state"><p>No records found for this period.</p></div>`:`
      <table class="data-table">
        <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Duration</th><th>Source</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${filtered.map(e=>`<tr>
            <td><div style="font-size:0.8rem;font-weight:500">${new Date(e.clockIn).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</div><div style="font-size:0.68rem;color:var(--text-muted)">${new Date(e.clockIn).getFullYear()}</div></td>
            <td class="mono" style="font-size:0.78rem">${fmt12(new Date(e.clockIn).getHours()*60+new Date(e.clockIn).getMinutes())}</td>
            <td class="mono" style="font-size:0.78rem">${fmt12(new Date(e.clockOut).getHours()*60+new Date(e.clockOut).getMinutes())}</td>
            <td><div class="mono" style="font-weight:500;font-size:0.8rem">${fmtDur(e.durationMins)}</div><div style="font-size:0.68rem;color:var(--text-muted)">${humanDur(e.durationMins)}</div></td>
            <td>${e.source==='clockin'?'<span class="badge badge-green">Clock-in</span>':'<span class="badge badge-accent">Manual</span>'}</td>
            <td style="font-size:0.78rem;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.note||'—'}</td>
            <td><button class="del-btn" data-delentry="${e.id}" title="Delete">×</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`}
  `;
  qsa('[data-hfilt]',card).forEach(b=>b.addEventListener('click',()=>{state.histFilter=b.dataset.hfilt;renderTab();}));
  qsa('[data-delentry]',card).forEach(b=>b.addEventListener('click',e=>{if(confirm('Delete this entry?')){deleteEntry(e.currentTarget.dataset.delentry);renderTab();showToast('Entry deleted');}}));
  wrap.appendChild(card); return wrap;
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function renderSettings() {
  const wrap=document.createElement('div');
  const s=getUserSettings();
  const card1=div('card'); card1.style.maxWidth='560px';
  card1.innerHTML=`
    <div class="card-header"><span class="card-title">Pay & overtime</span></div>
    <div class="form-row cols-2" style="margin-bottom:14px">
      <div class="field"><label>Hourly rate ($)</label><input type="number" id="st-rate" value="${s.rate||''}" placeholder="e.g. 18.50" min="0" step="0.01"/></div>
      <div class="field"><label>Pay period</label><select id="st-period"><option value="weekly"${s.payPeriod==='weekly'?' selected':''}>Weekly</option><option value="biweekly"${s.payPeriod==='biweekly'?' selected':''}>Bi-weekly</option><option value="monthly"${s.payPeriod==='monthly'?' selected':''}>Monthly</option></select></div>
    </div>
    <div class="form-row cols-2" style="margin-bottom:1.25rem">
      <div class="field"><label>Weekly OT threshold</label><input type="number" id="st-otweek" value="${s.otWeek||40}" min="1"/><div class="hint">Standard is 40 hours/week</div></div>
      <div class="field"><label>Daily OT threshold</label><input type="number" id="st-otday" value="${s.otDay||8}" min="1" step="0.5"/><div class="hint">Standard is 8 hours/day</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-primary" id="save-settings">Save settings</button>
      <span id="settings-saved" style="display:none;font-size:0.8rem;color:var(--green)">Settings saved.</span>
    </div>
  `;
  card1.querySelector('#save-settings').addEventListener('click',()=>{
    const ns={rate:card1.querySelector('#st-rate').value,payPeriod:card1.querySelector('#st-period').value,otWeek:parseFloat(card1.querySelector('#st-otweek').value)||40,otDay:parseFloat(card1.querySelector('#st-otday').value)||8};
    saveUserSettings(ns); state.calcSettings={...state.calcSettings,...ns};
    const msg=card1.querySelector('#settings-saved'); msg.style.display='inline';
    setTimeout(()=>msg.style.display='none',2000); showToast('Settings saved');
  });
  const card2=div('card'); card2.style.cssText='max-width:560px;margin-top:1rem';
  card2.innerHTML=`
    <div class="card-header"><span class="card-title">Account</span></div>
    <div style="margin-bottom:1rem"><div style="font-size:0.875rem;font-weight:500">${state.users[state.user]?.name||''}</div><div style="font-size:0.78rem;color:var(--text-muted)">${state.user}</div></div>
    <div class="card-header" style="margin-top:1.25rem;margin-bottom:0.75rem"><span class="card-title">Data</span></div>
    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">All data is stored locally in your browser. Use the Export button to download a CSV backup.</p>
    <button class="btn btn-danger btn-sm" id="clear-data">Clear all my data</button>
  `;
  card2.querySelector('#clear-data').addEventListener('click',()=>{
    if(confirm('Delete ALL your recorded data? This cannot be undone.')){const u=state.users[state.user];if(u){u.entries=[];saveDB();showToast('All data cleared');renderTab();}}
  });
  wrap.appendChild(card1); wrap.appendChild(card2); return wrap;
}

// ─── App bootstrap ────────────────────────────────────────────────────────────
function init() {
  loadDB();
  renderLogin();
  el('login-screen').classList.remove('hidden');

  qsa('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  el('btn-logout').addEventListener('click',()=>{
    state.user=null; state.clockInTime=null; stopClockTimer();
    el('app').classList.add('hidden'); el('login-screen').classList.remove('hidden');
    state.loginMode='login'; state.loginError=''; renderLogin();
  });
  el('btn-export').addEventListener('click',exportCSV);
  el('btn-clockin').addEventListener('click',handleClockToggle);
  el('sidebar-toggle').addEventListener('click',()=>{
    const sb=el('sidebar'),ov=el('sidebar-overlay');
    sb.classList.toggle('open'); ov.classList.toggle('hidden',!sb.classList.contains('open'));
  });
  el('sidebar-overlay').addEventListener('click',()=>{el('sidebar').classList.remove('open');el('sidebar-overlay').classList.add('hidden');});

  // Handle URL shortcuts
  const params=new URLSearchParams(window.location.search);
  const tabParam=params.get('tab');
  if(tabParam&&TAB_TITLES[tabParam]) state.tab=tabParam;
}

document.addEventListener('DOMContentLoaded',init);

/* ─────────────────────────────────────────────────────────────
   PWA — Service Worker + Install Prompt
   ───────────────────────────────────────────────────────────── */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js')
      .then(reg=>console.log('[SW] Registered:',reg.scope))
      .catch(err=>console.warn('[SW] Failed:',err));
  });
}

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredInstallPrompt=e;
  const dismissed=localStorage.getItem('tc_install_dismissed');
  if(!dismissed){const banner=el('install-banner');if(banner)banner.classList.remove('hidden');}
});
document.addEventListener('click',e=>{
  if(e.target&&e.target.id==='install-btn'){
    if(deferredInstallPrompt){deferredInstallPrompt.prompt();deferredInstallPrompt.userChoice.then(r=>{if(r.outcome==='accepted'){showToast('TimeCard installed!');const b=el('install-banner');if(b)b.classList.add('hidden');}deferredInstallPrompt=null;});}
  }
  if(e.target&&e.target.closest&&e.target.closest('#install-dismiss')){const b=el('install-banner');if(b)b.classList.add('hidden');localStorage.setItem('tc_install_dismissed','1');}
});
window.addEventListener('appinstalled',()=>{const b=el('install-banner');if(b)b.classList.add('hidden');showToast('TimeCard installed successfully!');});