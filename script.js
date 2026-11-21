// ═══════════════════════════════════════════════
//  CONFIG — change this to your server address
// ═══════════════════════════════════════════════
// Same origin when served by the backend; localhost:3000 when opened as a file.
const API = (location.protocol.startsWith('http') ? '' : 'http://localhost:3000') + '/api';
 
// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
const AIRPORTS = [
  {cc:'LHE',icao:'OPLA',name:'Allama Iqbal International',city:'Lahore',   type:'International'},
  {cc:'KHI',icao:'OPKC',name:'Jinnah International',      city:'Karachi',  type:'International'},
  {cc:'ISB',icao:'OPIS',name:'Islamabad International',   city:'Islamabad',type:'International'},
  {cc:'PEW',icao:'OPPS',name:'Bacha Khan International',  city:'Peshawar', type:'International'},
  {cc:'UET',icao:'OPQT',name:'Quetta International',      city:'Quetta',   type:'International'},
  {cc:'MUX',icao:'OPMT',name:'Multan International',      city:'Multan',   type:'International'},
  {cc:'LYP',icao:'OPFA',name:'Faisalabad International',  city:'Faisalabad',type:'International'},
  {cc:'SKT',icao:'OPST',name:'Sialkot International',     city:'Sialkot',  type:'International'},
  {cc:'GWD',icao:'OPGD',name:'Gwadar International',      city:'Gwadar',   type:'International'},
  {cc:'GIL',icao:'OPGT',name:'Gilgit Airport',            city:'Gilgit',   type:'Domestic'},
  {cc:'BHV',icao:'OPBW',name:'Bahawalpur Airport',        city:'Bahawalpur',type:'Domestic'},
  {cc:'RYK',icao:'OPRK',name:'Sheikh Zayed International',city:'Rahim Yar Khan',type:'International'},
  {cc:'SKZ',icao:'OPSK',name:'Sukkur Airport',            city:'Sukkur',   type:'Domestic'},
  {cc:'KDU',icao:'OPSD',name:'Skardu Airport',            city:'Skardu',   type:'Domestic'},
];
 
let selectedAirport = null;
let boardMode       = 'dep';
let depFilter       = 'all';
let arrFilter       = 'all';
let depData         = [];
let arrData         = [];
let refreshTimer    = null;
let countdown       = 30;
 
const STATUSES = ['Scheduled','Departed','Landed','Boarding','Arriving','Delayed','Cancelled','Estimated'];
 
// ═══════════════════════════════════════════════
//  API HELPERS
// ═══════════════════════════════════════════════
async function apiFetch(endpoint, opts = {}) {
  const res = await fetch(API + endpoint, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
 
async function checkHealth() {
  try {
    const data = await apiFetch('/health');
    const el   = document.getElementById('db-status');
    const lb   = document.getElementById('db-label');
    if (data.db === 'connected') {
      el.className = 'tb-db-status db-live';
      lb.textContent = 'DB LIVE';
    } else {
      el.className = 'tb-db-status db-demo';
      lb.textContent = 'DEMO MODE';
    }
  } catch {
    const el = document.getElementById('db-status');
    el.className = 'tb-db-status db-error';
    document.getElementById('db-label').textContent = 'OFFLINE';
  }
}
 
// ═══════════════════════════════════════════════
//  AIRPORT SELECTOR
// ═══════════════════════════════════════════════
function buildSelector() {
  const grid = document.getElementById('ap-grid');
  grid.innerHTML = AIRPORTS.map(a => `
    <div class="ap-card" id="apc-${a.cc}" onclick="pickAirport('${a.cc}')">
      <span class="ap-badge ${a.type==='International'?'ap-intl':'ap-dom'}">${a.type==='International'?'INTL':'DOM'}</span>
      <div class="ap-iata">${a.cc}</div>
      <div class="ap-name">${a.name}</div>
      <div class="ap-city">${a.icao} · ${a.city}</div>
    </div>`).join('');
}
 
function pickAirport(cc) {
  selectedAirport = AIRPORTS.find(a => a.cc === cc);
  document.querySelectorAll('.ap-card').forEach(c => c.classList.remove('sel'));
  document.getElementById('apc-' + cc).classList.add('sel');
  document.getElementById('sel-chosen').innerHTML = `Selected: <span>${selectedAirport.name} (${cc})</span>`;
  document.getElementById('btn-enter').disabled = false;
}
 
function enterApp() {
  if (!selectedAirport) return;
  document.getElementById('overlay').classList.add('gone');
  document.getElementById('tb-name').textContent = `PAMR · ${selectedAirport.icao} · ${selectedAirport.name.toUpperCase()}`;
  document.getElementById('tb-iata').textContent = selectedAirport.cc;
  checkHealth();
  loadBoard();
  loadStats();
  startRefresh();
}
 
function reopenSelector() {
  document.getElementById('overlay').classList.remove('gone');
  if (selectedAirport) {
    document.querySelectorAll('.ap-card').forEach(c => c.classList.remove('sel'));
    document.getElementById('apc-' + selectedAirport.cc)?.classList.add('sel');
  }
}
 
// ═══════════════════════════════════════════════
//  CLOCK
// ═══════════════════════════════════════════════
function updateClock() {
  const n = new Date();
  document.getElementById('clock').textContent =
    String(n.getHours()).padStart(2,'0') + ':' +
    String(n.getMinutes()).padStart(2,'0') + ':' +
    String(n.getSeconds()).padStart(2,'0') + ' PKT';
}
setInterval(updateClock, 1000);
updateClock();
 
// ═══════════════════════════════════════════════
//  AUTO-REFRESH
// ═══════════════════════════════════════════════
function startRefresh() {
  clearInterval(refreshTimer);
  countdown = 30;
  refreshTimer = setInterval(() => {
    countdown--;
    document.getElementById('fids-refresh').textContent = `AUTO-REFRESH: ${countdown}s`;
    if (countdown <= 0) { loadBoard(); countdown = 30; }
  }, 1000);
}
 
// ═══════════════════════════════════════════════
//  FIDS
// ═══════════════════════════════════════════════
function makeRow(f, type) {
  const dest   = type === 'dep' ? (f.d_name || '') : (f.a_name || '');
  const code   = type === 'dep' ? (f.cc || '') : (f.ac || '');
  const status = f.live_status || f.stat || 'Scheduled';
  return `<div class="fl-row">
    <span class="fl-cs">${f.cs}</span>
    <span class="fl-airline">${f.airl}</span>
    <span class="fl-dest">${dest}<small>${code}</small></span>
    <span class="fl-time">${(f.times||'').slice(0,5)}</span>
    <span><span class="badge b-${status}">${status.toUpperCase()}</span></span>
  </div>`;
}
 
function showSkeleton(containerId, count = 8) {
  const html = Array(count).fill(0).map(() => `
    <div class="loading-row">
      <div class="skel" style="width:70px"></div>
      <div class="skel" style="width:140px;margin-left:20px"></div>
      <div class="skel" style="flex:1;margin-left:20px"></div>
      <div class="skel" style="width:60px;margin-left:20px"></div>
      <div class="skel" style="width:90px;margin-left:20px"></div>
    </div>`).join('');
  document.getElementById(containerId).innerHTML = html;
}
 
async function loadBoard() {
  if (!selectedAirport) return;
  const container = document.getElementById('fids-rows');
  showSkeleton('fids-rows');
 
  try {
    if (boardMode === 'dep') {
      const res = await apiFetch(`/departures?airport=${selectedAirport.cc}`);
      depData = res.data || [];
      container.innerHTML = depData.length
        ? depData.map(f => makeRow(f, 'dep')).join('')
        : '<div class="empty-state">NO DEPARTURES FOUND</div>';
    } else {
      const res = await apiFetch(`/arrivals?airport=${selectedAirport.cc}`);
      arrData = res.data || [];
      container.innerHTML = arrData.length
        ? arrData.map(f => makeRow(f, 'arr')).join('')
        : '<div class="empty-state">NO ARRIVALS FOUND</div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state">⚠ ${err.message}<br><br>Check your backend connection at ${API}</div>`;
  }
}
 
function switchBoard(mode, btn) {
  boardMode = mode;
  document.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadBoard();
}
 
// ═══════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════
async function runSearch() {
  if (!selectedAirport) return;
  const cs   = document.getElementById('s-cs').value.trim();
  const airl = document.getElementById('s-airl').value.trim();
  const dest = document.getElementById('s-dest').value.trim();
  const stat = document.getElementById('s-stat').value;
  const type = document.getElementById('s-type').value;
 
  const params = new URLSearchParams();
  params.set('airport', selectedAirport.cc);
  if (cs)   params.set('search', cs);
  if (airl) params.set('airline', airl);
  if (stat) params.set('status', stat);
 
  try {
    let results = [];
    if (!type || type === 'dep') {
      const r = await apiFetch(`/departures?${params}`);
      results.push(...(r.data || []).map(f => ({...f, _type: 'dep'})));
    }
    if (!type || type === 'arr') {
      const r = await apiFetch(`/arrivals?${params}`);
      results.push(...(r.data || []).map(f => ({...f, _type: 'arr'})));
    }
    if (dest) {
      results = results.filter(f =>
        (f.d_name || f.a_name || '').toLowerCase().includes(dest.toLowerCase())
      );
    }
    results.sort((a, b) => (a.times || '').localeCompare(b.times || ''));
    document.getElementById('s-count').textContent = `${results.length} flight${results.length !== 1 ? 's' : ''} found`;
    document.getElementById('search-rows').innerHTML = results.length
      ? results.map(f => makeRow(f, f._type)).join('')
      : '<div class="empty-state">NO MATCHING FLIGHTS</div>';
  } catch (err) {
    document.getElementById('search-rows').innerHTML = `<div class="empty-state">⚠ ${err.message}</div>`;
  }
}
 
function clearSearch() {
  ['s-cs','s-airl','s-dest'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('s-stat').value = '';
  document.getElementById('s-type').value = '';
  document.getElementById('s-count').textContent = '—';
  document.getElementById('search-rows').innerHTML = '';
}
 
// ═══════════════════════════════════════════════
//  ADMIN — STATS
// ═══════════════════════════════════════════════
async function loadStats() {
  if (!selectedAirport) return;
  try {
    const r = await apiFetch(`/stats?airport=${selectedAirport.cc}`);
    const d = r.data;
    document.getElementById('st-dep').textContent = d.departures;
    document.getElementById('st-arr').textContent = d.arrivals;
    document.getElementById('st-del').textContent = d.delayed;
    document.getElementById('st-can').textContent = d.cancelled;
    document.getElementById('st-ok').textContent  = d.ontime;
  } catch {}
}
 
// ═══════════════════════════════════════════════
//  ADMIN — ADD FLIGHT
// ═══════════════════════════════════════════════
function updateFormLabels() {
  const t = document.querySelector('input[name=ftype]:checked').value;
  document.getElementById('f-cc-lbl').textContent   = t === 'dep' ? 'DESTINATION CODE *' : 'ORIGIN CODE *';
  document.getElementById('f-name-lbl').textContent = t === 'dep' ? 'DESTINATION NAME *' : 'ORIGIN NAME *';
}
 
async function addFlight() {
  const type  = document.querySelector('input[name=ftype]:checked').value;
  const cs    = document.getElementById('f-cs').value.trim();
  const airl  = document.getElementById('f-airl').value.trim();
  const cc    = document.getElementById('f-cc').value.trim().toUpperCase();
  const name  = document.getElementById('f-name').value.trim();
  const time  = document.getElementById('f-time').value;
  const stat  = document.getElementById('f-stat').value;
 
  if (!cs || !airl || !cc || !name || !time) { toast('Fill all required fields', 'err'); return; }
  if (!selectedAirport) { toast('Select an airport first', 'err'); return; }
 
  const times = time.length === 5 ? time + ':00' : time;
 
  try {
    if (type === 'dep') {
      await apiFetch('/departures', {
        method: 'POST',
        body: JSON.stringify({ cs, airl, cc, dc: selectedAirport.cc, d_name: name, times, stat }),
      });
    } else {
      await apiFetch('/arrivals', {
        method: 'POST',
        // arrival: cc = this airport (where it lands), ac = origin code
        body: JSON.stringify({ cs, airl, ac: cc, cc: selectedAirport.cc, a_name: name, times, stat }),
      });
    }
    toast(`Flight ${cs} added successfully`);
    clearForm(); loadStats(); loadBoard();
  } catch (err) {
    toast(err.message, 'err');
  }
}
 
function clearForm() {
  ['f-cs','f-airl','f-cc','f-name'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-time').value = '';
  document.getElementById('f-stat').value = 'Scheduled';
}
 
// ═══════════════════════════════════════════════
//  ADMIN — EDIT LIST
// ═══════════════════════════════════════════════
async function loadEditList(type) {
  if (!selectedAirport) return;
  const filter = type === 'dep' ? depFilter : arrFilter;
  const el     = document.getElementById('edit-' + type);
  el.innerHTML = '<div class="empty-state"><div class="spin"></div></div>';
 
  try {
    const params = new URLSearchParams({ airport: selectedAirport.cc });
    if (filter !== 'all') params.set('status', filter);
    const endpoint = type === 'dep' ? '/departures' : '/arrivals';
    const r = await apiFetch(`${endpoint}?${params}`);
    const data = (r.data || []).sort((a,b) => (a.times||'').localeCompare(b.times||''));
 
    const nameKey = type === 'dep' ? 'd_name' : 'a_name';
 
    if (!data.length) { el.innerHTML = '<div class="empty-state">NO FLIGHTS MATCH FILTER</div>'; return; }
 
    el.innerHTML = data.map(f => `
      <div class="edit-row" id="er-${type}-${f.cs}">
        <span class="fl-cs" style="font-size:12px">${f.cs}</span>
        <input value="${f.airl}" id="ei-a-${type}-${f.cs}">
        <select id="ei-s-${type}-${f.cs}">
          ${STATUSES.map(s => `<option${f.stat===s?' selected':''}>${s}</option>`).join('')}
        </select>
        <input value="${(f.times||'').slice(0,5)}" id="ei-t-${type}-${f.cs}" style="width:58px">
        <span>
          <button class="icon-btn ok" title="Save" onclick="saveEdit('${type}','${f.cs}','${f[nameKey] || ''}','${type==='dep'?f.cc:f.ac}')">✓</button>
          <button class="icon-btn del" title="Delete" onclick="deleteRow('${type}','${f.cs}')">✕</button>
        </span>
      </div>`).join('');
  } catch (err) {
    el.innerHTML = `<div class="empty-state">⚠ ${err.message}</div>`;
  }
}
 
async function saveEdit(type, cs, name, code) {
  const airl  = document.getElementById(`ei-a-${type}-${cs}`).value;
  const stat  = document.getElementById(`ei-s-${type}-${cs}`).value;
  const tVal  = document.getElementById(`ei-t-${type}-${cs}`).value;
  const times = tVal.length === 5 ? tVal + ':00' : tVal;
 
  try {
    if (type === 'dep') {
      await apiFetch(`/departures/${cs}`, {
        method: 'PUT',
        body: JSON.stringify({ airl, cc: code, d_name: name, times, stat }),
      });
    } else {
      await apiFetch(`/arrivals/${cs}`, {
        method: 'PUT',
        body: JSON.stringify({ airl, ac: code, a_name: name, times, stat }),
      });
    }
    toast(`${cs} updated`);
    loadStats(); loadBoard();
  } catch (err) { toast(err.message, 'err'); }
}
 
async function deleteRow(type, cs) {
  if (!confirm(`Delete flight ${cs}?`)) return;
  try {
    const endpoint = type === 'dep' ? `/departures/${cs}` : `/arrivals/${cs}`;
    await apiFetch(endpoint, { method: 'DELETE' });
    toast(`${cs} removed`);
    loadEditList(type); loadStats(); loadBoard();
  } catch (err) { toast(err.message, 'err'); }
}
 
function filterEdit(type, val, btn) {
  if (type === 'dep') depFilter = val; else arrFilter = val;
  btn.closest('.filter-bar').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  loadEditList(type);
}
 
// ═══════════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════════
function switchTab(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'admin') { loadStats(); loadEditList('dep'); loadEditList('arr'); }
  if (name === 'search') { clearSearch(); }
}
 
function switchAdmin(tab, btn) {
  document.querySelectorAll('.apanel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
  document.getElementById('ap-' + tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'edep') loadEditList('dep');
  if (tab === 'earr') loadEditList('arr');
}
 
// ═══════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════
let toastTimer;
function toast(msg, type = '') {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  toastTimer = setTimeout(() => t.className = 'toast', 3000);
}
 
// ── INIT ──────────────────────────────────────────
buildSelector();