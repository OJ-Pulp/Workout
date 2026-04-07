const DAY_SHORT = ['M','T','W','T','F','S','S'];

let FULL_POOL = {};
let CONFLICTS = [];

// April–October: bodyweight + outdoor. November–March: equipment + indoor.
function getSeason() {
  const m = new Date().getMonth() + 1;
  return (m >= 4 && m <= 10) ? 'bodyweight' : 'equipment';
}
function getCardioEnv() {
  const m = new Date().getMonth() + 1;
  return (m >= 4 && m <= 10) ? 'outdoor' : 'indoor';
}

function getMondayStr() {
  const d = new Date(), day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diff);
  return mon.toISOString().split('T')[0];
}
function getTodayStr() { return new Date().toISOString().split('T')[0]; }
function getTodayIdx() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function generateSchedule() {
  const types = ['strength','strength','power','power','cardio','cardio'];
  for (let t = 0; t < 2000; t++) {
    const s = shuffle(types);
    let ok = true;
    for (let i = 1; i < s.length; i++) { if (s[i]===s[i-1]) { ok=false; break; } }
    if (ok) return [...s, 'rest'];
  }
  return ['strength','cardio','power','strength','cardio','power','rest'];
}

function freshState() {
  return { week_start: getMondayStr(), schedule: generateSchedule(), used: { upper:[], lower:[], core:[], cardio:[] }, log:{} };
}

function loadState() {
  try {
    const raw = localStorage.getItem('workout_v3');
    const s = raw ? JSON.parse(raw) : null;
    if (!s || s.week_start !== getMondayStr()) { const f=freshState(); saveState(f); return f; }
    return s;
  } catch(e) { return freshState(); }
}
function saveState(s) { try { localStorage.setItem('workout_v3', JSON.stringify(s)); } catch(e){} }

// Returns the raw seasonal pool arrays for a given workout type
function getSeasonalPools(dayType) {
  const season = getSeason();
  const cardioEnv = getCardioEnv();
  const wType = (dayType === 'power') ? 'power' : 'strength';

  const upperAll       = FULL_POOL.upper[season][wType];
  const lowerAll       = FULL_POOL.lower[season][wType];
  const coreMovers     = FULL_POOL.core[season].movers;
  const coreStabilizers = FULL_POOL.core[season].stabilizers;

  const cardioData = FULL_POOL.cardio[cardioEnv];
  const cardioAll  = [...new Set([
    ...Object.keys(cardioData.sprint),
    ...Object.keys(cardioData.distance)
  ])];

  return { upperAll, lowerAll, coreMovers, coreStabilizers, cardioAll, cardioEnv };
}

function availablePool(state, dayType) {
  const { upperAll, lowerAll, coreMovers, coreStabilizers, cardioAll, cardioEnv } = getSeasonalPools(dayType);

  function avail(all, used) {
    const rem = all.filter(x => !used.includes(x));
    return rem.length > 0 ? rem : [...all];
  }

  return {
    upper:           avail(upperAll,        state.used.upper),
    lower:           avail(lowerAll,        state.used.lower),
    coreMovers:      avail(coreMovers,      state.used.core),
    coreStabilizers: avail(coreStabilizers, state.used.core),
    cardio:          avail(cardioAll,       state.used.cardio),
    cardioEnv,
  };
}

function pickArr(pool, n) { return shuffle(pool).slice(0, Math.min(n, pool.length)); }

// Remove conflicting pairs from picks, replacing with a non-conflicting alt from poolAll
function resolveConflicts(picks, poolAll) {
  let result = [...picks];
  for (const pair of CONFLICTS) {
    if (pair.every(x => result.includes(x))) {
      const removed = pair[1];
      result = result.filter(x => x !== removed);
      const alt = poolAll.find(x =>
        !result.includes(x) &&
        !CONFLICTS.some(p => p.includes(x) && p.some(y => result.includes(y)))
      );
      if (alt) result.push(alt);
    }
  }
  return result;
}

function buildCardio(pool) {
  const modality = pickArr(pool.cardio, 1)[0];
  const cardioData = FULL_POOL.cardio[pool.cardioEnv];
  const hasSprint = cardioData.sprint[modality] != null;
  const isSprint  = hasSprint && Math.random() < 0.5;

  if (isSprint) {
    const opts   = cardioData.sprint[modality];
    const chosen = opts[Math.floor(Math.random() * opts.length)];
    return { modality, isSprint: true, detail: chosen[0], sets: chosen[1] };
  } else {
    const opts = cardioData.distance[modality];
    return { modality, isSprint: false, detail: opts[Math.floor(Math.random() * opts.length)], sets: null };
  }
}

function buildWorkout(state, dayType) {
  if (dayType === 'rest') return { type: 'rest' };
  const pool = availablePool(state, dayType);

  if (dayType === 'cardio') {
    const cardio = buildCardio(pool);
    return { type: 'cardio', cardio, usedCats: { cardio: [cardio.modality] } };
  }

  const upper = resolveConflicts(pickArr(pool.upper, 2), pool.upper);
  const lower = resolveConflicts(pickArr(pool.lower, 2), pool.lower);

  // Core: always 1 stabilizer + 2–3 movers, no conflicts between them
  const stab = pickArr(pool.coreStabilizers, 1);
  const moverCount = Math.random() < 0.5 ? 2 : 3;

  // Filter movers that conflict with the chosen stabilizer, then resolve mover–mover conflicts
  const safeMovers = pool.coreMovers.filter(x =>
    !CONFLICTS.some(p => p.includes(x) && p.some(y => stab.includes(y)))
  );
  let movers = resolveConflicts(pickArr(safeMovers, moverCount), safeMovers);

  // Fill up if we lost any movers due to conflict resolution
  while (movers.length < moverCount) {
    const alt = safeMovers.find(x =>
      !movers.includes(x) &&
      !CONFLICTS.some(p => p.includes(x) && p.some(y => movers.includes(y)))
    );
    if (!alt) break;
    movers.push(alt);
  }

  const core = [...stab, ...movers];

  return { type: dayType, upper, lower, core, usedCats: { upper, lower, core } };
}

function applyUsed(state, workout) {
  if (!workout.usedCats) return;
  for (const [cat, items] of Object.entries(workout.usedCats)) {
    for (const item of items) { if (!state.used[cat].includes(item)) state.used[cat].push(item); }
  }
}

function renderWeekStrip(state) {
  const todayIdx = getTodayIdx();
  let html = '';
  state.schedule.forEach((type, i) => {
    const isToday = i === todayIdx;
    const isDone = Object.keys(state.log).some(k => {
      const d = new Date(k+'T12:00:00');
      return (d.getDay()===0 ? 6 : d.getDay()-1) === i;
    });
    const cls = ['day-cell',`type-${type}`,isToday?'today':'',isDone?'done':''].filter(Boolean).join(' ');
    html += `<div class="${cls}"><span class="d-name">${DAY_SHORT[i]}</span><div class="d-dot"></div></div>`;
  });
  document.getElementById('week-strip').innerHTML = html;
}

function renderTypeTag(dayType) {
  const labels = { strength:'Strength', power:'Power', cardio:'Cardio', rest:'Rest' };
  document.getElementById('type-tag-container').innerHTML =
    `<div class="type-tag ${dayType}"><div class="dot"></div>${labels[dayType]||''}</div>`;
}

function renderWorkout(workout) {
  const out     = document.getElementById('workout-output');
  const poolOut = document.getElementById('pool-output');
  const poolDiv = document.getElementById('pool-divider');

  if (!workout) {
    out.innerHTML = `<div class="empty-state">Tap generate to get today's workout.</div>`;
    poolOut.innerHTML=''; poolDiv.style.display='none'; return;
  }
  if (workout.type === 'rest') {
    out.innerHTML = `<div class="rest-screen"><div class="rest-icon">◯</div><p>Rest day — Sunday.<br>Recover, hydrate, eat well.</p></div>`;
    poolOut.innerHTML=''; poolDiv.style.display='none'; return;
  }

  let html='', delay=0;
  const row = (name, meta, d) =>
    `<div class="exercise-row" style="animation-delay:${d}ms"><span class="exercise-name">${name}</span><span class="exercise-meta">${meta}</span></div>`;

  if (workout.type === 'cardio') {
    const c = workout.cardio;
    const detail = c.isSprint ? `${c.detail}  ·  ${c.sets}` : c.detail;
    html += `<div class="workout-section"><div class="section-header">Cardio</div>
      <div class="cardio-row" style="animation-delay:0ms">
        <div class="cardio-top"><span class="cardio-name">${c.modality}</span><span class="cardio-type">${c.isSprint?'Sprint':'Distance'}</span></div>
        <span class="cardio-detail">${detail}</span>
      </div></div>`;
    out.innerHTML = html;

    const state = loadState();
    const { cardioAll } = getSeasonalPools('cardio');
    let poolHtml = `<div class="pool-section"><div class="section-header">Weekly pool</div>`;
    poolHtml += `<div class="pool-cat-label">cardio</div><div class="pool-row">`;
    cardioAll.forEach(o => {
      poolHtml += `<span class="pool-pill ${state.used.cardio.includes(o)?'used':'fresh'}">${o}</span>`;
    });
    poolHtml += `</div></div>`;
    poolOut.innerHTML = poolHtml;
    poolDiv.style.display = 'block';
    return;
  }

  const isPower = workout.type === 'power';
  const upperHeader = isPower ? 'Upper body power' : 'Upper body';
  const lowerHeader = isPower ? 'Lower body power' : 'Lower body';

  html += `<div class="workout-section"><div class="section-header">${upperHeader}</div>`;
  workout.upper.forEach(e => { html += row(e,'2 sets',delay); delay+=60; });
  html += `</div>`;

  html += `<div class="workout-section"><div class="section-header">${lowerHeader}</div>`;
  workout.lower.forEach(e => { html += row(e,'2 sets',delay); delay+=60; });
  html += `</div>`;

  html += `<div class="workout-section"><div class="section-header">Core</div>`;
  workout.core.forEach(e => { html += row(e,'2 sets',delay); delay+=60; });
  html += `</div>`;

  out.innerHTML = html;

  // Weekly pool tracker
  const state = loadState();
  const { upperAll, lowerAll, coreMovers, coreStabilizers } = getSeasonalPools(workout.type);
  let poolHtml = `<div class="pool-section"><div class="section-header">Weekly pool</div>`;
  [
    { label: 'upper',             pool: upperAll,        used: state.used.upper },
    { label: 'lower',             pool: lowerAll,        used: state.used.lower },
    { label: 'core movers',       pool: coreMovers,      used: state.used.core  },
    { label: 'core stabilizers',  pool: coreStabilizers, used: state.used.core  },
  ].forEach(({ label, pool, used }) => {
    poolHtml += `<div class="pool-cat-label">${label}</div><div class="pool-row">`;
    pool.forEach(o => {
      poolHtml += `<span class="pool-pill ${used.includes(o)?'used':'fresh'}">${o}</span>`;
    });
    poolHtml += `</div>`;
  });
  poolHtml += `</div>`;
  poolOut.innerHTML = poolHtml;
  poolDiv.style.display = 'block';
}

function generateWorkout() {
  const state    = loadState();
  const todayStr = getTodayStr();
  const dayType  = state.schedule[getTodayIdx()];

  if (state.log[todayStr]) {
    renderWorkout(state.log[todayStr]);
    document.getElementById('gen-btn').textContent = 'Generated';
    document.getElementById('regen-btn').style.display = 'block';
    return;
  }

  const workout = buildWorkout(state, dayType);
  applyUsed(state, workout);
  state.log[todayStr] = workout;
  saveState(state);
  renderWorkout(workout);
  renderWeekStrip(state);
  document.getElementById('gen-btn').textContent = 'Generated';
  document.getElementById('regen-btn').style.display = 'block';
}

function regenWorkout() {
  const state    = loadState();
  const todayStr = getTodayStr();
  const dayType  = state.schedule[getTodayIdx()];
  const old      = state.log[todayStr];
  if (old && old.usedCats) {
    for (const [cat, items] of Object.entries(old.usedCats)) {
      state.used[cat] = state.used[cat].filter(x => !items.includes(x));
    }
  }
  delete state.log[todayStr];
  const workout = buildWorkout(state, dayType);
  applyUsed(state, workout);
  state.log[todayStr] = workout;
  saveState(state);
  renderWorkout(workout);
  renderWeekStrip(state);
}

function resetWeek() {
  if (confirm('Reset the entire week?')) { localStorage.removeItem('workout_v3'); init(); }
}

async function init() {
  try {
    const res  = await fetch('/Workout/exercises.json');
    const data = await res.json();
    FULL_POOL = data;
    CONFLICTS = data.conflicts || [];
  } catch(e) {
    console.warn('Could not load exercises.json, using cached state only.');
  }

  const state    = loadState();
  const todayStr = getTodayStr();
  const todayIdx = getTodayIdx();
  const d = new Date();
  document.getElementById('date-label').textContent =
    d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  renderWeekStrip(state);
  renderTypeTag(state.schedule[todayIdx]);
  const regen = document.getElementById('regen-btn');
  if (state.log[todayStr]) {
    renderWorkout(state.log[todayStr]);
    document.getElementById('gen-btn').textContent = 'Generated';
    regen.style.display = 'block';
  } else {
    renderWorkout(null);
    regen.style.display = 'none';
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/Workout/sw.js')
      .catch(err => console.log('SW registration failed:', err));
  });
}

init();
