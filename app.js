/* ─────────────────────────────────────────────────────────────
   TimeCard — app.js
   ───────────────────────────────────────────────────────────── */
'use strict';

const DB_KEY    = 'timecard_v4';
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEK_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const WEEK_FULL = {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'};
const TAB_TITLES= {calculator:'Calculator',timecard:'Time Card',calendar:'Calendar',history:'History',settings:'Settings'};
const HOURS12   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINS_LIST = Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));

// ── State ──────────────────────────────────────────────────────
let state = {
  user:null, users:{}, tab:'calculator',
  weekShifts: buildEmptyWeek(),
  calcSettings:{rate:'',otWeek:40,otDay:8,payPeriod:'weekly',employeeName:'',payPeriodLabel:''},
  clockInTime:null, clockTimer:null,
  calYear:new Date().getFullYear(), calMonth:new Date().getMonth()+1,
  calSelectedDate:null,
  histFilter:'all',
  weekOffset:0, tcView:'weekly',
  loginMode:'login', loginError:'',
  // Pay period range tracker
  rangeFrom:'', rangeTo:'',
};

function buildEmptyWeek(){
  const w={};
  WEEK_KEYS.forEach(d=>{w[d]={startH:'9',startM:'00',startP:'AM',endH:'5',endM:'00',endP:'PM'};});
  return w;
}

// ── DB ─────────────────────────────────────────────────────────
function loadDB(){try{const d=JSON.parse(localStorage.getItem(DB_KEY)||'{}');if(d.users)state.users=d.users;}catch(e){}}
function saveDB(){try{localStorage.setItem(DB_KEY,JSON.stringify({users:state.users}));}catch(e){}}
function getEntries(){return state.users[state.user]?.entries||[];}
function saveEntry(entry){
  if(!state.users[state.user])state.users[state.user]={entries:[]};
  const arr=state.users[state.user].entries;
  const i=arr.findIndex(e=>e.id===entry.id);
  if(i>=0)arr[i]=entry; else arr.push(entry);
  saveDB();
}
function deleteEntry(id){const u=state.users[state.user];if(u)u.entries=u.entries.filter(e=>e.id!==id);saveDB();}
function getUserSettings(){return state.users[state.user]?.settings||{rate:'',otWeek:40,otDay:8,payPeriod:'weekly'};}
function saveUserSettings(s){if(!state.users[state.user])state.users[state.user]={entries:[]};state.users[state.user].settings=s;saveDB();}

// ── Utils ──────────────────────────────────────────────────────
function genId(){return Date.now()+'-'+(Math.random()*9999|0);}
function todayStr(){return new Date().toISOString().split('T')[0];}
function hashPass(p){let h=0;for(let i=0;i<p.length;i++){h=((h<<5)-h)+p.charCodeAt(i);h|=0;}return h.toString(36);}
function el(id){return document.getElementById(id);}
function qs(sel,ctx){return(ctx||document).querySelector(sel);}
function qsa(sel,ctx){return[...(ctx||document).querySelectorAll(sel)];}
function fmt(n,d=2){return parseFloat(n).toFixed(d);}
function fmtMoney(n){return'$'+parseFloat(n).toFixed(2);}
function initials(n){return n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);}
function div(cls,html){const d=document.createElement('div');d.className=cls;if(html!=null)d.innerHTML=html;return d;}

function fmtDur(m){
  if(!m||m<=0)return'—';
  const h=Math.floor(m/60),mn=Math.round(m%60);
  if(h===0)return mn+'m';
  if(mn===0)return h+'h';
  return h+'h '+mn+'m';
}
function plainDur(m){
  if(!m||m<=0)return'no time logged';
  const h=Math.floor(m/60),mn=Math.round(m%60);
  if(h===0)return mn+' minute'+(mn!==1?'s':'');
  if(mn===0)return h+' hour'+(h!==1?'s':'');
  return h+' hour'+(h!==1?'s':'')+' and '+mn+' minute'+(mn!==1?'s':'');
}
function fmt12(totalMins){
  if(totalMins<0)totalMins+=1440;
  let h=Math.floor(totalMins/60)%24,m=totalMins%60;
  const ap=h<12?'AM':'PM';
  if(h===0)h=12;else if(h>12)h-=12;
  return h+':'+(String(m).padStart(2,'0'))+' '+ap;
}
function to24Mins(h,m,ap){
  let hh=parseInt(h)||0,mm=parseInt(m)||0;
  if(ap==='AM'){if(hh===12)hh=0;}else{if(hh!==12)hh+=12;}
  return hh*60+mm;
}
function calcRowMins(row){
  if(!row.startH||!row.endH)return 0;
  let s=to24Mins(row.startH,row.startM,row.startP);
  let e=to24Mins(row.endH,row.endM,row.endP);
  if(e<=s)e+=1440;
  return Math.max(0,e-s);
}
function fmtElapsed(ms){
  const s=Math.floor(ms/1000),h=Math.floor(s/3600),min=Math.floor((s%3600)/60),sec=s%60;
  return(h?h+':':'')+(String(min).padStart(h?2:1,'0'))+':'+(String(sec).padStart(2,'0'));
}
function dateLabel(d){return new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
function isoDate(d){return d.toISOString().split('T')[0];}

// entries for a specific date string
function entriesForDate(dateStr){
  return getEntries().filter(e=>new Date(e.clockIn).toISOString().split('T')[0]===dateStr);
}
function minsForDate(dateStr){
  return entriesForDate(dateStr).reduce((s,e)=>s+(e.durationMins||0),0);
}

// ── Clock-in ───────────────────────────────────────────────────
function startClockTimer(){if(state.clockTimer)clearInterval(state.clockTimer);state.clockTimer=setInterval(updateClockDisplay,1000);updateClockDisplay();}
function stopClockTimer(){if(state.clockTimer){clearInterval(state.clockTimer);state.clockTimer=null;}}
function updateClockDisplay(){
  const te=el('clockin-timer'),le=el('clockin-label'),dot=qs('.pulse-dot'),btn=el('btn-clockin');
  if(state.clockInTime){
    if(te)te.textContent=fmtElapsed(Date.now()-state.clockInTime);
    if(le)le.textContent='Clocked in';
    if(dot)dot.classList.add('active');
    if(btn){btn.textContent='Clock Out';btn.classList.add('clocked-in');}
  }else{
    if(te)te.textContent='';
    if(le)le.textContent='Not clocked in';
    if(dot)dot.classList.remove('active');
    if(btn){btn.textContent='Clock In';btn.classList.remove('clocked-in');}
  }
}
function handleClockToggle(){
  if(!state.clockInTime){state.clockInTime=Date.now();startClockTimer();}
  else{
    const out=Date.now(),mins=Math.round((out-state.clockInTime)/60000);
    saveEntry({id:genId(),clockIn:new Date(state.clockInTime).toISOString(),clockOut:new Date(out).toISOString(),durationMins:mins,note:'',source:'clockin'});
    state.clockInTime=null;stopClockTimer();updateClockDisplay();
    showToast('Shift saved — '+plainDur(mins));
    if(state.tab==='history'||state.tab==='calendar')renderTab();
  }
}

// ── Live clock ─────────────────────────────────────────────────
function startLiveClock(){
  function tick(){const c=el('live-clock');if(!c)return;const n=new Date();let h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();const ap=h<12?'AM':'PM';if(h===0)h=12;else if(h>12)h-=12;c.textContent=h+':'+(String(m).padStart(2,'0'))+':'+(String(s).padStart(2,'0'))+' '+ap;}
  tick();setInterval(tick,1000);
}

// ── Toast ──────────────────────────────────────────────────────
let _toastTimer=null;
function showToast(msg){
  let t=el('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:0.8rem;font-weight:500;transition:all 0.25s ease;pointer-events:none;background:var(--bg-overlay);border:1px solid var(--border-mid);color:var(--text-primary);font-family:var(--font-sans)';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';t.style.transform='translateY(0)';
  if(_toastTimer)clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(8px)';},2800);
}

// ── CSV Export ─────────────────────────────────────────────────
function exportCSV(){
  const entries=getEntries();if(!entries.length){showToast('No entries to export');return;}
  const sets=getUserSettings(),rate=parseFloat(sets.rate)||0;
  const rows=[['Date','Day','Clock In','Clock Out','Hours','Minutes','Note',rate?'Pay ($)':''].filter(Boolean)];
  [...entries].sort((a,b)=>new Date(a.clockIn)-new Date(b.clockIn)).forEach(e=>{
    const ci=new Date(e.clockIn),co=new Date(e.clockOut);
    const row=[ci.toLocaleDateString(),DAYS_LONG[ci.getDay()],fmt12(ci.getHours()*60+ci.getMinutes()),fmt12(co.getHours()*60+co.getMinutes()),(e.durationMins/60).toFixed(2),e.durationMins,e.note||''];
    if(rate)row.push((e.durationMins/60*rate).toFixed(2));
    rows.push(row);
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='timecard-export.csv';a.click();
  URL.revokeObjectURL(url);showToast('CSV exported');
}

// ── Auth ───────────────────────────────────────────────────────
function renderLogin(){
  el('login-screen').classList.remove('hidden');el('app').classList.add('hidden');
  const isLogin=state.loginMode==='login';
  el('login-title').textContent=isLogin?'Welcome back':'Create account';
  el('login-sub').textContent=isLogin?'Sign in to continue tracking your hours.':'Start tracking your work hours for free.';
  el('login-submit').textContent=isLogin?'Sign in':'Create account';
  el('login-submit').className='btn btn-primary btn-full';
  const err=el('login-error');err.classList.toggle('hidden',!state.loginError);err.textContent=state.loginError||'';
  el('login-fields').innerHTML=`
    ${!isLogin?`<div class="field"><label>Full name</label><input id="li-name" type="text" placeholder="Your name" autocomplete="name"/></div>`:''}
    <div class="field"><label>Email</label><input id="li-email" type="email" placeholder="you@email.com" autocomplete="email"/></div>
    <div class="field"><label>Password</label><input id="li-pass" type="password" placeholder="••••••••" autocomplete="${isLogin?'current-password':'new-password'}"/></div>`;
  el('login-toggle-text').innerHTML=isLogin?`Don't have an account? <button id="li-toggle">Register free</button>`:`Already have an account? <button id="li-toggle">Sign in</button>`;
  el('login-submit').onclick=handleLoginSubmit;
  el('li-pass').onkeydown=e=>{if(e.key==='Enter')handleLoginSubmit();};
  el('li-toggle').onclick=()=>{state.loginMode=isLogin?'register':'login';state.loginError='';renderLogin();};
}
function handleLoginSubmit(){
  const email=el('li-email').value.trim().toLowerCase(),pass=el('li-pass').value;
  if(state.loginMode==='register'){
    const name=el('li-name').value.trim();
    if(!name||!email||!pass){state.loginError='All fields are required.';renderLogin();return;}
    if(state.users[email]){state.loginError='Email already registered.';renderLogin();return;}
    state.users[email]={name,passHash:hashPass(pass),entries:[]};saveDB();
    state.user=email;state.loginError='';launchApp();
  }else{
    if(!email||!pass){state.loginError='Please enter email and password.';renderLogin();return;}
    const u=state.users[email];
    if(!u||u.passHash!==hashPass(pass)){state.loginError='Invalid email or password.';renderLogin();return;}
    state.user=email;state.loginError='';launchApp();
  }
}
function launchApp(){
  el('login-screen').classList.add('hidden');el('app').classList.remove('hidden');
  const u=state.users[state.user];
  el('sidebar-name').textContent=u?.name||state.user;
  el('sidebar-email').textContent=state.user;
  el('sidebar-avatar').textContent=initials(u?.name||state.user);
  const sets=getUserSettings();state.calcSettings={...state.calcSettings,...sets};
  startLiveClock();if(state.clockInTime)startClockTimer();renderTab();
}

// ── Nav ────────────────────────────────────────────────────────
function setTab(tab){
  state.tab=tab;
  qsa('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  el('topbar-title').textContent=TAB_TITLES[tab]||tab;
  renderTab();
  el('sidebar').classList.remove('open');el('sidebar-overlay').classList.add('hidden');
}
function renderTab(){
  const c=el('tab-content');c.innerHTML='';
  const fns={calculator:renderCalculator,timecard:renderTimeCard,calendar:renderCalendar,history:renderHistory,settings:renderSettings};
  if(fns[state.tab])c.appendChild(fns[state.tab]());
}

// ── Select builder ─────────────────────────────────────────────
function buildSel(opts,selected,cls,data){
  const s=document.createElement('select');s.className=cls;
  if(data)Object.entries(data).forEach(([k,v])=>s.dataset[k]=v);
  opts.forEach(o=>{const op=document.createElement('option');op.value=o;op.textContent=o;if(String(o)===String(selected))op.selected=true;s.appendChild(op);});
  return s;
}

// ════════════════════════════════════════════════════════════════
//  CALCULATOR TAB
// ════════════════════════════════════════════════════════════════
function renderCalculator(){
  const wrap=document.createElement('div');
  const s=state.calcSettings;

  // ── Employee / pay period header ──
  const hCard=div('card');
  hCard.innerHTML=`
    <div class="calc-header-fields">
      <div class="field" style="flex:1"><label>Employee Name</label><input type="text" id="calc-emp" placeholder="Employee Name" value="${s.employeeName||''}"/></div>
      <div class="field" style="flex:1"><label>Pay Period</label><input type="text" id="calc-period-lbl" placeholder="e.g. Jun 1 – Jun 7, 2025" value="${s.payPeriodLabel||''}"/></div>
    </div>`;
  hCard.querySelector('#calc-emp').addEventListener('input',e=>{state.calcSettings.employeeName=e.target.value;});
  hCard.querySelector('#calc-period-lbl').addEventListener('input',e=>{state.calcSettings.payPeriodLabel=e.target.value;});
  wrap.appendChild(hCard);

  // ── Pay settings ──
  const pCard=div('card');
  pCard.innerHTML=`
    <div class="card-header"><span class="card-title">Pay settings</span></div>
    <div class="form-row cols-4">
      <div class="field"><label>Hourly rate ($)</label><input type="number" id="cs-rate" value="${s.rate||''}" placeholder="0.00" min="0" step="0.01"/></div>
      <div class="field"><label>Pay period</label><select id="cs-period"><option value="weekly"${s.payPeriod==='weekly'?' selected':''}>Weekly</option><option value="biweekly"${s.payPeriod==='biweekly'?' selected':''}>Bi-weekly</option><option value="monthly"${s.payPeriod==='monthly'?' selected':''}>Monthly</option></select></div>
      <div class="field"><label>Weekly OT after</label><input type="number" id="cs-otweek" value="${s.otWeek||40}" min="1"/><div class="hint">hrs/week</div></div>
      <div class="field"><label>Daily OT after</label><input type="number" id="cs-otday" value="${s.otDay||8}" min="1" step="0.5"/><div class="hint">hrs/day</div></div>
    </div>`;
  ['cs-rate','cs-period','cs-otweek','cs-otday'].forEach(id=>{
    const inp=pCard.querySelector('#'+id);
    if(inp)inp.addEventListener('input',()=>{
      state.calcSettings={...state.calcSettings,rate:pCard.querySelector('#cs-rate')?.value||'',payPeriod:pCard.querySelector('#cs-period')?.value||'weekly',otWeek:parseFloat(pCard.querySelector('#cs-otweek')?.value)||40,otDay:parseFloat(pCard.querySelector('#cs-otday')?.value)||8};
      saveUserSettings(state.calcSettings);refreshCalcView();
    });
  });
  wrap.appendChild(pCard);

  // ── Weekly time sheet grid ──
  const rate=parseFloat(s.rate)||0,otW=parseFloat(s.otWeek)||40,otD=parseFloat(s.otDay)||8;
  let totalWeekMins=0;
  const gCard=div('card');
  gCard.innerHTML=`<div class="card-header"><span class="card-title">Weekly Time Sheet</span></div>`;

  const grid=div('weekly-grid');

  // header row
  const thead=div('wg-header');
  thead.innerHTML=`<div class="wg-col-day">Day</div><div class="wg-col-time">Starting Time</div><div class="wg-col-time">Ending Time</div><div class="wg-col-total">Total</div>`;
  grid.appendChild(thead);

  WEEK_KEYS.forEach(day=>{
    const row=state.weekShifts[day];
    const mins=calcRowMins(row);
    totalWeekMins+=mins;
    const dh=mins/60;
    const isOT=mins>0&&dh>otD;

    const rowEl=div('wg-row');rowEl.dataset.day=day;

    // Day label
    const dayCol=div('wg-col-day wg-day-label');dayCol.textContent=WEEK_FULL[day];rowEl.appendChild(dayCol);

    // Start time
    const startCol=div('wg-col-time');
    const startPicker=div('time-picker');
    const sh=buildSel(HOURS12,row.startH,'tp-sel tp-h',{day,field:'startH'});
    const sm=buildSel(MINS_LIST,row.startM,'tp-sel tp-m',{day,field:'startM'});
    const sp=buildSel(['AM','PM'],row.startP,'tp-sel tp-ap',{day,field:'startP'});
    startPicker.append(sh,mkSep(),sm,mkSep2(),sp);
    startCol.appendChild(startPicker);rowEl.appendChild(startCol);

    // End time
    const endCol=div('wg-col-time');
    const endPicker=div('time-picker');
    const eh=buildSel(HOURS12,row.endH,'tp-sel tp-h',{day,field:'endH'});
    const em=buildSel(MINS_LIST,row.endM,'tp-sel tp-m',{day,field:'endM'});
    const ep=buildSel(['AM','PM'],row.endP,'tp-sel tp-ap',{day,field:'endP'});
    endPicker.append(eh,mkSep(),em,mkSep2(),ep);
    endCol.appendChild(endPicker);rowEl.appendChild(endCol);

    // Total — show both number and plain language
    const totalCol=div('wg-col-total');
    if(mins>0){
      totalCol.innerHTML=`<span class="wg-total-num${isOT?' wg-ot':''}">${fmtDur(mins)}</span><span class="wg-total-plain">${plainDur(mins)}</span>`;
    }
    rowEl.appendChild(totalCol);

    grid.appendChild(rowEl);
  });

  // Footer
  const foot=div('wg-footer');
  const weeklyTotalMins=totalWeekMins;
  const weeklyH=weeklyTotalMins/60;
  const regH=Math.min(weeklyH,otW),otH=Math.max(0,weeklyH-otW);
  const totalPay=regH*rate+otH*rate*1.5;
  foot.innerHTML=`
    <div class="wg-col-day"></div>
    <div class="wg-col-time"></div>
    <div class="wg-col-time"></div>
    <div class="wg-col-total wg-footer-total">
      <span class="wg-footer-label">Weekly Total</span>
      <span class="wg-footer-num">${weeklyTotalMins>0?fmtDur(weeklyTotalMins):''}</span>
      ${weeklyTotalMins>0?`<span class="wg-footer-plain">${plainDur(weeklyTotalMins)}</span>`:''}
    </div>`;
  grid.appendChild(foot);
  gCard.appendChild(grid);

  // Action bar
  const actions=div('calc-actions');
  actions.innerHTML=`
    <button class="btn btn-calc-print" id="calc-print">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="4" y="7" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M6 7V4h8v3M6 13h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      PRINT
    </button>
    <button class="btn btn-calc-action" id="calc-save">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 4h9l3 3v9H4V4z" stroke="currentColor" stroke-width="1.5"/><path d="M7 4v4h6V4M7 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      SAVE WEEK
    </button>
    <button class="btn btn-calc-action" id="calc-clear">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      CLEAR
    </button>
    <div class="calc-wk-total">
      Weekly Total: <strong>${weeklyTotalMins>0?fmtDur(weeklyTotalMins)+' <span style="color:var(--text-muted);font-weight:400;font-size:0.78rem">— '+plainDur(weeklyTotalMins)+'</span>':''}</strong>
    </div>`;
  gCard.appendChild(actions);
  wrap.appendChild(gCard);

  // ── Pay summary card (always visible when there are hours) ──
  if(weeklyTotalMins>0){
    const sumCard=div('card');
    sumCard.innerHTML=`<div class="card-header"><span class="card-title">This week at a glance</span></div>`;
    const sg=div('stat-grid');
    sg.innerHTML=`
      <div class="stat-card accent"><div class="stat-label">Total worked</div><div class="stat-value">${fmtDur(weeklyTotalMins)}</div><div class="stat-sub">${plainDur(weeklyTotalMins)}</div></div>
      <div class="stat-card"><div class="stat-label">Regular</div><div class="stat-value">${fmtDur(regH*60)}</div><div class="stat-sub">${rate>0?fmtMoney(regH*rate)+' earned':'up to '+otW+'h/wk'}</div></div>
      <div class="stat-card ${otH>0?'amber':''}"><div class="stat-label">Overtime</div><div class="stat-value">${otH>0?fmtDur(otH*60):'None'}</div><div class="stat-sub">${otH>0?'over '+otW+'h threshold':'within threshold'}</div></div>
      ${rate>0?`<div class="stat-card green"><div class="stat-label">Est. pay</div><div class="stat-value">${fmtMoney(totalPay)}</div><div class="stat-sub">${otH>0?'incl. '+fmtMoney(otH*rate*1.5)+' OT':'@ '+fmtMoney(rate)+'/hr'}</div></div>`:''}
    `;
    sumCard.appendChild(sg);

    // Plain language summary box
    const callout=div('summary-callout');
    let txt=`You worked <strong>${plainDur(weeklyTotalMins)}</strong> this week`;
    if(otH>0)txt+=`, including <strong>${plainDur(otH*60)} of overtime</strong>`;
    txt+='.';
    if(rate>0){txt+=` At <strong>${fmtMoney(rate)}/hr</strong>${otH>0?' with overtime at 1.5×':''}, your estimated pay is <strong>${fmtMoney(totalPay)}</strong>.`;}
    if(weeklyH>=otW)txt+=` You've hit the <strong>${otW}-hour</strong> overtime threshold.`;
    callout.innerHTML=txt;
    sumCard.appendChild(callout);
    wrap.appendChild(sumCard);
  }

  // ── Bind selects ──
  qsa('.tp-sel',wrap).forEach(sel=>{
    sel.addEventListener('change',e=>{
      const {day,field}=e.target.dataset;
      state.weekShifts[day][field]=e.target.value;
      refreshCalcView();
    });
  });

  // PRINT
  wrap.querySelector('#calc-print').addEventListener('click',()=>window.print());

  // SAVE WEEK — saves each day that has hours as a history entry
  wrap.querySelector('#calc-save').addEventListener('click',()=>{
    let saved=0;
    const today=new Date();const todayDow=today.getDay();
    // Map Mon..Sun to dates of current week
    const dayToOffset={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0};
    WEEK_KEYS.forEach(day=>{
      const row=state.weekShifts[day];const mins=calcRowMins(row);if(!mins)return;
      const targetDow=dayToOffset[day];
      const diff=targetDow-todayDow;
      const d=new Date(today);d.setDate(today.getDate()+diff);
      const dateStr=isoDate(d);
      const sm=to24Mins(row.startH,row.startM,row.startP);
      const em=to24Mins(row.endH,row.endM,row.endP);
      const sh=String(Math.floor(sm/60)).padStart(2,'0')+':'+String(sm%60).padStart(2,'0');
      const eh=String(Math.floor(em/60)).padStart(2,'0')+':'+String(em%60).padStart(2,'0');
      saveEntry({id:genId(),clockIn:new Date(dateStr+'T'+sh).toISOString(),clockOut:new Date(dateStr+'T'+eh).toISOString(),durationMins:mins,note:'',source:'manual'});
      saved++;
    });
    if(saved){showToast(saved+' day'+(saved!==1?'s':'')+' saved to history');}else{showToast('No hours to save');}
  });

  // CLEAR
  wrap.querySelector('#calc-clear').addEventListener('click',()=>{
    state.weekShifts=buildEmptyWeek();refreshCalcView();
  });

  return wrap;
}

function mkSep(){const s=document.createElement('span');s.className='tp-sep';s.textContent=':';return s;}
function mkSep2(){const s=document.createElement('span');s.style.width='4px';return s;}

function refreshCalcView(){
  const c=el('tab-content');const y=c.scrollTop;c.innerHTML='';c.appendChild(renderCalculator());c.scrollTop=y;
}

// ════════════════════════════════════════════════════════════════
//  CALENDAR TAB — click any day to view/edit hours
// ════════════════════════════════════════════════════════════════
function renderCalendar(){
  const wrap=document.createElement('div');
  const {calYear:y,calMonth:m,calSelectedDate:sel}=state;
  const entries=getEntries();
  const byDay={};
  entries.forEach(e=>{
    const d=new Date(e.clockIn);
    if(d.getFullYear()===y&&d.getMonth()+1===m){const day=d.getDate();byDay[day]=(byDay[day]||0)+(e.durationMins||0);}
  });
  const totalMins=Object.values(byDay).reduce((a,b)=>a+b,0);
  const firstDay=new Date(y,m-1,1).getDay(),daysIn=new Date(y,m,0).getDate(),today=new Date();

  const calCard=div('card');
  calCard.innerHTML=`
    <div class="cal-nav">
      <button class="btn btn-outline btn-sm" id="cal-prev">‹</button>
      <div>
        <div style="font-family:var(--font-mono);font-size:1.05rem;font-weight:500;text-align:center">${MONTHS[m-1]} ${y}</div>
        ${totalMins>0?`<div style="text-align:center;font-size:0.72rem;color:var(--accent);margin-top:2px">${plainDur(totalMins)} logged this month</div>`:''}
      </div>
      <button class="btn btn-outline btn-sm" id="cal-next">›</button>
    </div>
    <div class="cal-grid" id="cal-grid">
      ${DAYS.map(d=>`<div class="cal-day-name">${d}</div>`).join('')}
      ${Array(firstDay).fill('<div class="cal-day empty"></div>').join('')}
      ${Array.from({length:daysIn},(_,i)=>{
        const day=i+1;
        const isToday=y===today.getFullYear()&&m===today.getMonth()+1&&day===today.getDate();
        const mins=byDay[day]||0;
        const dateStr=y+'-'+(String(m).padStart(2,'0'))+'-'+(String(day).padStart(2,'0'));
        const isSel=sel===dateStr;
        return `<div class="cal-day ${mins>0?'worked':'no-work'}${isToday?' today':''}${isSel?' cal-selected':''}" data-date="${dateStr}">
          <span class="cal-num">${day}</span>
          ${mins>0?`<span class="cal-hrs">${fmtDur(mins)}</span>`:''}
        </div>`;
      }).join('')}
    </div>
    <div class="cal-legend">
      <span><span class="leg-dot worked-dot"></span>Worked</span>
      <span><span class="leg-dot empty-dot"></span>No record</span>
      <span style="color:var(--text-muted);font-size:0.72rem">Tap any day to view or edit</span>
    </div>
  `;

  calCard.querySelector('#cal-prev').addEventListener('click',()=>{if(state.calMonth===1){state.calMonth=12;state.calYear--;}else state.calMonth--;state.calSelectedDate=null;renderTab();});
  calCard.querySelector('#cal-next').addEventListener('click',()=>{if(state.calMonth===12){state.calMonth=1;state.calYear++;}else state.calMonth++;state.calSelectedDate=null;renderTab();});
  qsa('.cal-day[data-date]',calCard).forEach(cell=>{
    cell.addEventListener('click',()=>{
      state.calSelectedDate=state.calSelectedDate===cell.dataset.date?null:cell.dataset.date;
      renderTab();
    });
  });
  wrap.appendChild(calCard);

  // ── Day detail panel ──
  if(sel){
    wrap.appendChild(renderDayPanel(sel));
  }

  return wrap;
}

function renderDayPanel(dateStr){
  const panel=div('card day-panel');
  const dayEntries=entriesForDate(dateStr);
  const totalMins=dayEntries.reduce((s,e)=>s+(e.durationMins||0),0);
  const rate=parseFloat(getUserSettings().rate)||0;

  panel.innerHTML=`
    <div class="card-header">
      <span class="card-title">${dateLabel(dateStr)}</span>
      <button class="btn btn-primary btn-sm" id="dp-add-entry">+ Add entry</button>
    </div>
    <div class="day-summary-bar">
      <div class="day-sum-big">${totalMins>0?fmtDur(totalMins):'No hours logged'}</div>
      <div class="day-sum-plain">${plainDur(totalMins)}</div>
      ${rate>0&&totalMins>0?`<div class="day-sum-pay">${fmtMoney(totalMins/60*rate)} earned</div>`:''}
    </div>
    <div id="dp-entries">
      ${dayEntries.length===0?'<div class="empty-state" style="padding:1.5rem"><p>No entries for this day.<br/>Click "+ Add entry" to log hours manually.</p></div>':''}
      ${dayEntries.map(e=>renderDayEntry(e)).join('')}
    </div>
    <div id="dp-form-wrap"></div>
  `;

  panel.querySelector('#dp-add-entry').addEventListener('click',()=>{
    const fw=panel.querySelector('#dp-form-wrap');
    if(fw.innerHTML){fw.innerHTML='';return;}
    fw.appendChild(buildEntryForm(null,dateStr,panel));
  });

  qsa('.dp-edit-btn',panel).forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.dataset.id;
      const entry=getEntries().find(e=>e.id===id);
      if(!entry)return;
      const fw=panel.querySelector('#dp-form-wrap');
      fw.appendChild(buildEntryForm(entry,dateStr,panel));
      btn.closest('.dp-entry').style.opacity='0.4';
    });
  });
  qsa('.dp-del-btn',panel).forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(confirm('Delete this entry?')){deleteEntry(btn.dataset.id);renderTab();showToast('Entry deleted');}
    });
  });

  return panel;
}

function renderDayEntry(e){
  const ci=new Date(e.clockIn),co=new Date(e.clockOut);
  const inStr=fmt12(ci.getHours()*60+ci.getMinutes());
  const outStr=fmt12(co.getHours()*60+co.getMinutes());
  return `<div class="dp-entry" data-id="${e.id}">
    <div class="dp-entry-times"><span class="dp-in">${inStr}</span><span class="dp-arrow">→</span><span class="dp-out">${outStr}</span></div>
    <div class="dp-entry-dur">${fmtDur(e.durationMins)} <span style="color:var(--text-muted);font-size:0.72rem">· ${plainDur(e.durationMins)}</span></div>
    ${e.note?`<div class="dp-entry-note">${e.note}</div>`:''}
    <div class="dp-entry-actions">
      <button class="btn btn-outline btn-sm dp-edit-btn" data-id="${e.id}">Edit</button>
      <button class="btn btn-danger btn-sm dp-del-btn" data-id="${e.id}">Delete</button>
    </div>
  </div>`;
}

function buildEntryForm(entry,dateStr,panel){
  // Parse existing entry or defaults
  let defInH='9',defInM='00',defInP='AM',defOutH='5',defOutM='00',defOutP='PM',defNote='';
  if(entry){
    const ci=new Date(entry.clockIn),co=new Date(entry.clockOut);
    const ciMins=ci.getHours()*60+ci.getMinutes();
    const coMins=co.getHours()*60+co.getMinutes();
    let ih=ci.getHours(),im=ci.getMinutes(),ip=ih<12?'AM':'PM';
    if(ih===0)ih=12;else if(ih>12)ih-=12;
    defInH=String(ih);defInM=String(im).padStart(2,'0');defInP=ip;
    let oh=co.getHours(),om=co.getMinutes(),op=oh<12?'AM':'PM';
    if(oh===0)oh=12;else if(oh>12)oh-=12;
    defOutH=String(oh);defOutM=String(om).padStart(2,'0');defOutP=op;
    defNote=entry.note||'';
  }

  const form=div('entry-form');
  form.innerHTML=`
    <div class="entry-form-title">${entry?'Edit entry':'Add new entry'} for ${dateLabel(dateStr)}</div>
    <div class="entry-form-row">
      <div class="entry-form-col">
        <label class="entry-label">Start time</label>
        <div class="time-picker" id="ef-start"></div>
      </div>
      <div class="entry-form-col">
        <label class="entry-label">End time</label>
        <div class="time-picker" id="ef-end"></div>
      </div>
      <div class="entry-form-col" style="flex:2">
        <label class="entry-label">Note (optional)</label>
        <input type="text" id="ef-note" class="ef-note-input" placeholder="e.g. Opening shift" value="${defNote}"/>
      </div>
    </div>
    <div class="entry-form-preview" id="ef-preview"></div>
    <div class="entry-form-actions">
      <button class="btn btn-primary btn-sm" id="ef-save">${entry?'Update':'Add entry'}</button>
      <button class="btn btn-outline btn-sm" id="ef-cancel">Cancel</button>
    </div>
  `;

  // Inject time pickers
  const startDiv=form.querySelector('#ef-start');
  const sh=buildSel(HOURS12,defInH,'tp-sel tp-h',{});
  const sm=buildSel(MINS_LIST,defInM,'tp-sel tp-m',{});
  const sp=buildSel(['AM','PM'],defInP,'tp-sel tp-ap',{});
  startDiv.append(sh,mkSep(),sm,mkSep2(),sp);

  const endDiv=form.querySelector('#ef-end');
  const eh=buildSel(HOURS12,defOutH,'tp-sel tp-h',{});
  const em=buildSel(MINS_LIST,defOutM,'tp-sel tp-m',{});
  const ep=buildSel(['AM','PM'],defOutP,'tp-sel tp-ap',{});
  endDiv.append(eh,mkSep(),em,mkSep2(),ep);

  function updatePreview(){
    const sv=to24Mins(sh.value,sm.value,sp.value);
    const ev=to24Mins(eh.value,em.value,ep.value);
    let diff=ev-sv;if(diff<=0)diff+=1440;
    const prev=form.querySelector('#ef-preview');
    prev.innerHTML=diff>0?`<span class="ef-prev-num">${fmtDur(diff)}</span> <span class="ef-prev-plain">— ${plainDur(diff)}</span>`:'<span style="color:var(--red)">End time must be after start time</span>';
  }
  [sh,sm,sp,eh,em,ep].forEach(s=>s.addEventListener('change',updatePreview));
  updatePreview();

  form.querySelector('#ef-cancel').addEventListener('click',()=>{form.remove();qsa('.dp-entry',panel).forEach(e=>e.style.opacity='1');});

  form.querySelector('#ef-save').addEventListener('click',()=>{
    const sv=to24Mins(sh.value,sm.value,sp.value);
    const ev=to24Mins(eh.value,em.value,ep.value);
    let diff=ev-sv;if(diff<=0)diff+=1440;
    if(diff<=0){showToast('End time must be after start time');return;}
    const shStr=String(Math.floor(sv/60)).padStart(2,'0')+':'+String(sv%60).padStart(2,'0');
    const ehStr=String(Math.floor(ev/60)).padStart(2,'0')+':'+String(ev%60).padStart(2,'0');
    const note=form.querySelector('#ef-note').value.trim();
    const entryToSave={
      id:entry?entry.id:genId(),
      clockIn:new Date(dateStr+'T'+shStr).toISOString(),
      clockOut:new Date(dateStr+'T'+ehStr).toISOString(),
      durationMins:diff,note,source:'manual'
    };
    saveEntry(entryToSave);
    showToast(entry?'Entry updated':'Entry added');
    renderTab();
  });

  return form;
}

// ════════════════════════════════════════════════════════════════
//  HISTORY TAB — with pay period range calculator
// ════════════════════════════════════════════════════════════════
function renderHistory(){
  const wrap=document.createElement('div');
  const now=new Date();

  // ── Pay period range calculator ──
  const rangeCard=div('card');
  const {rangeFrom:rf,rangeTo:rt}=state;
  // Compute range totals
  let rangeMins=0,rangeDays=0;
  const sets=getUserSettings();const rate=parseFloat(sets.rate)||0;
  const otW=sets.otWeek||40;
  if(rf&&rt){
    const from=new Date(rf+'T00:00:00'),to=new Date(rt+'T23:59:59');
    getEntries().forEach(e=>{const d=new Date(e.clockIn);if(d>=from&&d<=to){rangeMins+=e.durationMins||0;}});
    // count unique days
    const daySet=new Set();
    getEntries().filter(e=>{const d=new Date(e.clockIn);return d>=from&&d<=to;}).forEach(e=>daySet.add(isoDate(new Date(e.clockIn))));
    rangeDays=daySet.size;
  }
  const rangeH=rangeMins/60;
  const rangeReg=Math.min(rangeH,otW),rangeOT=Math.max(0,rangeH-otW);
  const rangePay=rangeReg*rate+rangeOT*rate*1.5;

  rangeCard.innerHTML=`
    <div class="card-header"><span class="card-title">Pay period calculator</span></div>
    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">
      Select a date range — like your last pay period — to see exactly how many hours you worked and how much you're owed.
    </p>
    <div class="form-row cols-2" style="margin-bottom:1rem">
      <div class="field"><label>From date</label><input type="date" id="range-from" value="${rf||''}"/></div>
      <div class="field"><label>To date</label><input type="date" id="range-to" value="${rt||''}"/></div>
    </div>
    ${rf&&rt&&rangeMins>0?`
      <div class="range-result">
        <div class="stat-grid" style="margin-bottom:1rem">
          <div class="stat-card accent"><div class="stat-label">Total hours</div><div class="stat-value">${fmtDur(rangeMins)}</div><div class="stat-sub">${plainDur(rangeMins)}</div></div>
          <div class="stat-card"><div class="stat-label">Days worked</div><div class="stat-value">${rangeDays}</div><div class="stat-sub">${rangeDays} day${rangeDays!==1?'s':''}</div></div>
          <div class="stat-card ${rangeOT>0?'amber':''}"><div class="stat-label">Overtime</div><div class="stat-value">${rangeOT>0?fmtDur(rangeOT*60):'None'}</div><div class="stat-sub">${rangeOT>0?'over '+otW+'h threshold':'within threshold'}</div></div>
          ${rate>0?`<div class="stat-card green"><div class="stat-label">You are owed</div><div class="stat-value">${fmtMoney(rangePay)}</div><div class="stat-sub">${rangeOT>0?'incl. OT pay':'@ '+fmtMoney(rate)+'/hr'}</div></div>`:''}
        </div>
        <div class="summary-callout">
          From <strong>${new Date(rf+'T12:00:00').toLocaleDateString([],{month:'long',day:'numeric'})}</strong> to <strong>${new Date(rt+'T12:00:00').toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'})}</strong>, you worked <strong>${plainDur(rangeMins)}</strong> across <strong>${rangeDays} day${rangeDays!==1?'s':''}</strong>${rangeOT>0?`, including <strong>${plainDur(rangeOT*60)} of overtime</strong>`:''}${rate>0?`. Your estimated pay for this period is <strong>${fmtMoney(rangePay)}</strong>`:''}.
        </div>
      </div>`
    : rf&&rt&&rangeMins===0?`<div class="summary-callout" style="border-left-color:var(--amber)">No hours logged in this date range. Try adjusting your dates or add entries in the Calendar tab.</div>`
    : ''}
  `;

  rangeCard.querySelector('#range-from').addEventListener('change',e=>{state.rangeFrom=e.target.value;renderTab();});
  rangeCard.querySelector('#range-to').addEventListener('change',e=>{state.rangeTo=e.target.value;renderTab();});
  wrap.appendChild(rangeCard);

  // ── History list ──
  const filters=['all','today','week','month'];
  const filtered=getEntries().filter(e=>{
    const d=new Date(e.clockIn);
    if(state.histFilter==='today')return d.toDateString()===now.toDateString();
    if(state.histFilter==='week')return(now-d)<7*86400000;
    if(state.histFilter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    return true;
  }).sort((a,b)=>new Date(b.clockIn)-new Date(a.clockIn));

  const totalMins=filtered.reduce((s,e)=>s+(e.durationMins||0),0);

  const listCard=div('card');
  listCard.innerHTML=`
    <div class="card-header" style="flex-wrap:wrap;gap:10px">
      <span class="card-title">All entries</span>
      <div class="period-tabs">${filters.map(f=>`<button class="period-tab${state.histFilter===f?' active':''}" data-hfilt="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}</div>
    </div>
    ${totalMins>0?`<div style="margin-bottom:1rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="badge badge-accent">${filtered.length} record${filtered.length!==1?'s':''}</span>
      <span style="font-size:0.8rem;color:var(--text-secondary)">Total: <strong style="color:var(--accent)">${fmtDur(totalMins)}</strong> — ${plainDur(totalMins)}</span>
      ${rate>0?`<span style="font-size:0.8rem;color:var(--green)">≈ ${fmtMoney(totalMins/60*rate)}</span>`:''}
    </div>`:''}
    ${filtered.length===0?`<div class="empty-state"><p>No records for this period.<br/>Clock in, or use the Calendar tab to add entries manually.</p></div>`:`
      <table class="data-table">
        <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Duration</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${filtered.map(e=>`<tr>
            <td><div style="font-size:0.82rem;font-weight:500">${new Date(e.clockIn).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</div><div style="font-size:0.68rem;color:var(--text-muted)">${new Date(e.clockIn).getFullYear()}</div></td>
            <td class="mono" style="font-size:0.78rem">${fmt12(new Date(e.clockIn).getHours()*60+new Date(e.clockIn).getMinutes())}</td>
            <td class="mono" style="font-size:0.78rem">${fmt12(new Date(e.clockOut).getHours()*60+new Date(e.clockOut).getMinutes())}</td>
            <td><div style="font-weight:600;font-size:0.82rem">${fmtDur(e.durationMins)}</div><div style="font-size:0.7rem;color:var(--text-muted)">${plainDur(e.durationMins)}</div></td>
            <td style="font-size:0.78rem;color:var(--text-muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.note||'—'}</td>
            <td><button class="del-btn" data-delentry="${e.id}">×</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`}
  `;
  qsa('[data-hfilt]',listCard).forEach(b=>b.addEventListener('click',()=>{state.histFilter=b.dataset.hfilt;renderTab();}));
  qsa('[data-delentry]',listCard).forEach(b=>b.addEventListener('click',e=>{if(confirm('Delete this entry?')){deleteEntry(e.currentTarget.dataset.delentry);renderTab();showToast('Entry deleted');}}));
  wrap.appendChild(listCard);
  return wrap;
}

// ════════════════════════════════════════════════════════════════
//  TIME CARD TAB
// ════════════════════════════════════════════════════════════════
function renderTimeCard(){
  const wrap=document.createElement('div');
  const sets=getUserSettings(),entries=getEntries();
  function getWeekStart(off=0){const d=new Date();d.setDate(d.getDate()-d.getDay()+off*7);d.setHours(0,0,0,0);return d;}
  const ws=getWeekStart(state.weekOffset);
  const we=new Date(ws);
  const numDays=state.tcView==='biweekly'?14:state.tcView==='monthly'?new Date(ws.getFullYear(),ws.getMonth()+1,0).getDate():7;
  we.setDate(ws.getDate()+numDays-1);we.setHours(23,59,59,999);
  const filtered=entries.filter(e=>{const d=new Date(e.clockIn);return d>=ws&&d<=we;});
  const byDay={};
  filtered.forEach(e=>{const k=isoDate(new Date(e.clockIn));if(!byDay[k])byDay[k]={mins:0,entries:[]};byDay[k].mins+=e.durationMins||0;byDay[k].entries.push(e);});
  const totalMins=filtered.reduce((s,e)=>s+(e.durationMins||0),0);
  const totalH=totalMins/60,rate=parseFloat(sets.rate)||0;
  const otW=sets.otWeek||40,otD=sets.otDay||8;
  const regH=Math.min(totalH,otW),otH=Math.max(0,totalH-otW);
  const totalPay=regH*rate+otH*rate*1.5;
  const days=[];for(let i=0;i<numDays;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);days.push(d);}
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
      <div class="stat-card accent"><div class="stat-label">Total worked</div><div class="stat-value">${fmtDur(totalMins)}</div><div class="stat-sub">${plainDur(totalMins)}</div></div>
      <div class="stat-card"><div class="stat-label">Regular</div><div class="stat-value">${fmtDur(regH*60)}</div><div class="stat-sub">${rate>0?fmtMoney(regH*rate):'up to '+otW+'h/wk'}</div></div>
      <div class="stat-card ${otH>0?'amber':''}"><div class="stat-label">Overtime</div><div class="stat-value">${otH>0?fmtDur(otH*60):'None'}</div><div class="stat-sub">${rate>0&&otH>0?fmtMoney(otH*rate*1.5)+' (1.5×)':'—'}</div></div>
      ${rate>0?`<div class="stat-card green"><div class="stat-label">Est. pay</div><div class="stat-value">${fmtMoney(totalPay)}</div><div class="stat-sub">@ ${fmtMoney(rate)}/hr</div></div>`:''}
    </div>
    <table class="data-table">
      <thead><tr><th>Day</th><th>Date</th><th>Hours</th><th>In plain words</th><th>OT</th>${rate>0?'<th>Pay</th>':''}</tr></thead>
      <tbody>
        ${days.map(d=>{
          const k=isoDate(d),dd=byDay[k],dm=dd?dd.mins:0,dh=dm/60,dOT=Math.max(0,dh-otD);
          const isToday=d.toDateString()===new Date().toDateString();
          return`<tr style="${isToday?'background:rgba(79,142,247,0.06)':''}">
            <td style="font-weight:${isToday?600:400};color:${isToday?'var(--accent)':'var(--text-primary)'}">${DAYS[d.getDay()]}</td>
            <td class="mono" style="color:var(--text-muted);font-size:0.75rem">${d.toLocaleDateString([],{month:'short',day:'numeric'})}</td>
            <td>${dm>0?`<strong style="font-size:0.85rem">${fmtDur(dm)}</strong>`:'<span style="color:var(--border-mid)">—</span>'}</td>
            <td style="font-size:0.78rem;color:var(--text-secondary)">${dm>0?plainDur(dm):'—'}</td>
            <td>${dOT>0?`<span class="badge badge-amber">+${fmtDur(dOT*60)} OT</span>`:'<span style="color:var(--border-mid)">—</span>'}</td>
            ${rate>0?`<td class="mono" style="color:var(--green);font-size:0.78rem">${dm>0?fmtMoney(dh*rate):'—'}</td>`:''}
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="2" style="font-weight:600">Total</td>
        <td style="font-weight:600">${fmtDur(totalMins)}</td>
        <td style="font-size:0.78rem;color:var(--text-secondary)">${plainDur(totalMins)}</td>
        <td>${otH>0?`<span class="badge badge-amber">${fmtDur(otH*60)} OT</span>`:'—'}</td>
        ${rate>0?`<td class="mono" style="color:var(--green);font-weight:600">${fmtMoney(totalPay)}</td>`:''}
      </tr></tfoot>
    </table>
  `;
  qsa('[data-tcview]',card).forEach(b=>b.addEventListener('click',()=>{state.tcView=b.dataset.tcview;state.weekOffset=0;renderTab();}));
  card.querySelector('#wk-prev').addEventListener('click',()=>{state.weekOffset--;renderTab();});
  card.querySelector('#wk-next').addEventListener('click',()=>{state.weekOffset++;renderTab();});
  wrap.appendChild(card);return wrap;
}

// ════════════════════════════════════════════════════════════════
//  SETTINGS TAB
// ════════════════════════════════════════════════════════════════
function renderSettings(){
  const wrap=document.createElement('div');
  const s=getUserSettings();
  const c1=div('card');c1.style.maxWidth='560px';
  c1.innerHTML=`
    <div class="card-header"><span class="card-title">Pay & overtime</span></div>
    <div class="form-row cols-2" style="margin-bottom:14px">
      <div class="field"><label>Hourly rate ($)</label><input type="number" id="st-rate" value="${s.rate||''}" placeholder="e.g. 15.50" min="0" step="0.01"/></div>
      <div class="field"><label>Pay period</label><select id="st-period"><option value="weekly"${s.payPeriod==='weekly'?' selected':''}>Weekly</option><option value="biweekly"${s.payPeriod==='biweekly'?' selected':''}>Bi-weekly</option><option value="monthly"${s.payPeriod==='monthly'?' selected':''}>Monthly</option></select></div>
    </div>
    <div class="form-row cols-2" style="margin-bottom:1.25rem">
      <div class="field"><label>Weekly OT threshold (hrs)</label><input type="number" id="st-otweek" value="${s.otWeek||40}" min="1"/><div class="hint">Standard is 40h/week</div></div>
      <div class="field"><label>Daily OT threshold (hrs)</label><input type="number" id="st-otday" value="${s.otDay||8}" min="1" step="0.5"/><div class="hint">Standard is 8h/day</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-primary" id="save-settings">Save settings</button>
      <span id="settings-saved" style="display:none;font-size:0.8rem;color:var(--green)">Saved!</span>
    </div>`;
  c1.querySelector('#save-settings').addEventListener('click',()=>{
    const ns={rate:c1.querySelector('#st-rate').value,payPeriod:c1.querySelector('#st-period').value,otWeek:parseFloat(c1.querySelector('#st-otweek').value)||40,otDay:parseFloat(c1.querySelector('#st-otday').value)||8};
    saveUserSettings(ns);state.calcSettings={...state.calcSettings,...ns};
    const m=c1.querySelector('#settings-saved');m.style.display='inline';setTimeout(()=>m.style.display='none',2000);showToast('Settings saved');
  });
  const c2=div('card');c2.style.cssText='max-width:560px;margin-top:1rem';
  c2.innerHTML=`
    <div class="card-header"><span class="card-title">Account</span></div>
    <div style="margin-bottom:1rem"><div style="font-size:0.875rem;font-weight:500">${state.users[state.user]?.name||''}</div><div style="font-size:0.78rem;color:var(--text-muted)">${state.user}</div></div>
    <div class="card-header" style="margin-top:1rem;margin-bottom:0.75rem"><span class="card-title">Data</span></div>
    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">All data is stored in your browser. Use Export in the top bar to download a CSV.</p>
    <button class="btn btn-danger btn-sm" id="clear-data">Clear all my data</button>`;
  c2.querySelector('#clear-data').addEventListener('click',()=>{
    if(confirm('Delete ALL your data? Cannot be undone.')){const u=state.users[state.user];if(u){u.entries=[];saveDB();showToast('All data cleared');renderTab();}}
  });
  wrap.appendChild(c1);wrap.appendChild(c2);return wrap;
}

// ── Bootstrap ──────────────────────────────────────────────────
function init(){
  loadDB();
  renderLogin();
  el('login-screen').classList.remove('hidden');
  qsa('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  el('btn-logout').addEventListener('click',()=>{state.user=null;state.clockInTime=null;stopClockTimer();el('app').classList.add('hidden');el('login-screen').classList.remove('hidden');state.loginMode='login';state.loginError='';renderLogin();});
  el('btn-export').addEventListener('click',exportCSV);
  el('btn-clockin').addEventListener('click',handleClockToggle);
  el('sidebar-toggle').addEventListener('click',()=>{const sb=el('sidebar'),ov=el('sidebar-overlay');sb.classList.toggle('open');ov.classList.toggle('hidden',!sb.classList.contains('open'));});
  el('sidebar-overlay').addEventListener('click',()=>{el('sidebar').classList.remove('open');el('sidebar-overlay').classList.add('hidden');});
  const params=new URLSearchParams(window.location.search);
  if(params.get('tab')&&TAB_TITLES[params.get('tab')])state.tab=params.get('tab');
}
document.addEventListener('DOMContentLoaded',init);

// ── PWA ────────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(r=>console.log('[SW]',r.scope)).catch(e=>console.warn('[SW]',e)));
}
let _dip=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_dip=e;if(!localStorage.getItem('tc_install_dismissed')){const b=el('install-banner');if(b)b.classList.remove('hidden');}});
document.addEventListener('click',e=>{
  if(e.target?.id==='install-btn'){if(_dip){_dip.prompt();_dip.userChoice.then(r=>{if(r.outcome==='accepted'){showToast('TimeCard installed!');const b=el('install-banner');if(b)b.classList.add('hidden');}_dip=null;});}}
  if(e.target?.closest?.('#install-dismiss')){const b=el('install-banner');if(b)b.classList.add('hidden');localStorage.setItem('tc_install_dismissed','1');}
});
window.addEventListener('appinstalled',()=>{const b=el('install-banner');if(b)b.classList.add('hidden');showToast('TimeCard installed!');});