import { SandTable } from './table.js';
import { REGIONS } from './atlas.js';
import { STATES, SEVEN, EVENTS, BATTLES, CHANGES, ACTS, actAt, START, END, formatYear, ownerAt } from './history.js';

const $ = (id) => document.getElementById(id);
const canvas = $('table');
const stage = canvas.parentElement;
const table = new SandTable(canvas);

let year = START;
let playing = false;
let lastTick = 0;
const battleById = new Map(table.battles.map((b) => [b.id, b]));

/* ── 纪年 ─────────────────────────────────────── */

const REIGNS = [
  [-475, -469, '周元王'], [-468, -442, '周贞定王'], [-441, -441, '周哀王'],
  [-440, -426, '周考王'], [-425, -402, '周威烈王'], [-401, -376, '周安王'],
  [-375, -369, '周烈王'], [-368, -321, '周显王'], [-320, -315, '周慎靓王'],
  [-314, -256, '周赧王'], [-255, -251, '秦昭襄王'], [-250, -250, '秦孝文王'],
  [-249, -247, '秦庄襄王'], [-246, -221, '秦王政'],
];

const DIGITS = '〇一二三四五六七八九';

function cn(n) {
  if (n <= 10) return n === 10 ? '十' : DIGITS[n];
  if (n < 20) return '十' + DIGITS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return DIGITS[t] + '十' + (o ? DIGITS[o] : '');
}

function eraOf(y) {
  const r = REIGNS.find(([a, b]) => y >= a && y <= b);
  if (!r) return '';
  const n = y - r[0] + 1;
  return `${r[2]}${n === 1 ? '元' : cn(n)}年`;
}

/* ── 铜尺 ─────────────────────────────────────── */

const ruler = $('ruler');
const pct = (y) => ((y - START) / (END - START)) * 100;

function buildRuler() {
  $('acts').innerHTML = ACTS.map((a, i) => {
    const l = pct(a.from);
    const w = pct(a.to) - l;
    return `<button class="act" data-act="${i}" style="left:${l}%;width:${w}%">
      <b>${a.no}</b><span>${a.title}</span></button>`;
  }).join('');
  const ticks = $('ticks');
  const marks = $('marks');
  let html = '';
  for (let y = -470; y <= END; y += 10) {
    const major = y % 50 === 0;
    html += `<i class="tick${major ? ' is-major' : ''}" style="left:${pct(y)}%;height:${major ? 16 : 8}px"></i>`;
    if (major) html += `<i class="tick-label" style="left:${pct(y)}%">前${-y}</i>`;
  }
  ticks.innerHTML = html;
  marks.innerHTML = BATTLES.map(
    (b) => `<i class="mark" style="left:${pct(b.year)}%" title="${b.name}"></i>`
  ).join('');
}

$('acts').addEventListener('click', (e) => {
  const el = e.target.closest('.act');
  if (!el) return;
  e.stopPropagation();
  pause();
  endMarch();
  setYear(ACTS[+el.dataset.act].from);
  showAct();
});

function syncActs() {
  const cur = actAt(year);
  $('actNo').textContent = cur.no;
  $('actTitle').textContent = cur.title;
  for (const el of $('acts').children) {
    el.classList.toggle('is-now', ACTS[+el.dataset.act] === cur);
  }
}

function yearFromEvent(e) {
  const r = ruler.getBoundingClientRect();
  const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  return Math.round(START + t * (END - START));
}

let scrubbing = false;
ruler.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.act')) return;
  scrubbing = true;
  endMarch();
  if (detailMode !== 'act') showAct();
  ruler.setPointerCapture(e.pointerId);
  setYear(yearFromEvent(e));
  pause();
});
ruler.addEventListener('pointermove', (e) => { if (scrubbing) setYear(yearFromEvent(e)); });
ruler.addEventListener('pointerup', () => { scrubbing = false; syncChron(); });
ruler.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 10 : 1;
  if (detailMode === 'battle' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { endMarch(); showAct(); }
  if (e.key === 'ArrowLeft') { setYear(year - step); pause(); }
  else if (e.key === 'ArrowRight') { setYear(year + step); pause(); }
  else if (e.key === 'Home') { setYear(START); pause(); }
  else if (e.key === 'End') { setYear(END); pause(); }
  else if (e.key === ' ') { toggle(); }
  else return;
  e.preventDefault();
});

/* ── 大事记 ───────────────────────────────────── */

function buildChron() {
  $('chron').innerHTML = EVENTS.map(
    (e, i) => `<li class="evt" data-i="${i}" data-kind="${e.kind}" data-year="${e.year}"${e.battle ? ` data-battle="${e.battle}"` : ''}>
      <span class="evt-year">${formatYear(e.year)}</span>
      <div class="evt-body">
        <p class="evt-title"><i class="evt-kind">${e.kind}</i>${e.title}</p>
        <p class="evt-text">${e.text}</p>
      </div>
    </li>`
  ).join('');
}

$('chron').addEventListener('click', (e) => {
  const li = e.target.closest('.evt');
  if (!li) return;
  pause();
  if (li.dataset.battle) { setYear(+li.dataset.year); selectBattle(li.dataset.battle, true); }
  else { endMarch(); setYear(+li.dataset.year); showEvent(EVENTS[+li.dataset.i]); }
});

function syncChron() {
  const items = $('chron').children;
  let anchor = null;
  for (const li of items) {
    const y = +li.dataset.year;
    li.classList.toggle('is-past', y <= year);
    const now = y === year;
    li.classList.toggle('is-now', now);
    if (y <= year) anchor = li;
  }
  if (anchor && !scrubbing) {
    const box = $('chron');
    const top = anchor.offsetTop - box.clientHeight * 0.42;
    box.scrollTo({ top, behavior: 'smooth' });
  }
}

/* ── 国力 ─────────────────────────────────────── */

function syncPower() {
  const power = table.power();
  const owner = ownerAt(year);
  const counts = new Map();
  for (const r of REGIONS) counts.set(owner[r.id], (counts.get(owner[r.id]) || 0) + 1);
  const rows = [...power.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  const shown = rows.filter(([id, v]) => SEVEN.includes(id) || v >= 1.4);
  $('power').innerHTML = shown.map(([id, v]) => {
    const st = STATES[id];
    return `<div class="pw">
      <span class="pw-name" style="color:${st.ink || st.color}">${st.name}</span>
      <span class="pw-bar"><i class="pw-fill" style="width:${(v / max) * 100}%;background-color:${st.color}"></i></span>
      <span class="pw-num">${counts.get(id) || 0}郡 · 带甲${Math.round(v * 4.5)}万</span>
    </div>`;
  }).join('') + (shown.length < 7
    ? `<p class="dt-empty" style="margin-top:6px">${SEVEN.filter((s) => !power.has(s)).map((s) => STATES[s].name).join('、')} 已亡</p>`
    : '');
}

/* ── 案上 ─────────────────────────────────────── */

const detail = $('detail');

let detailMode = 'act';
let actShown = null;

function showAct() {
  table.selected = null;
  detailMode = 'act';
  const a = actAt(year);
  if (actShown === a) return;
  actShown = a;
  const wars = BATTLES.filter((b) => b.year >= a.from && b.year <= a.to);
  detail.innerHTML = `<p class="dt-eyebrow">第${a.no}幕</p>
    <p class="dt-title">${a.title}</p>
    <p class="dt-sub">${formatYear(a.from)} — ${formatYear(a.to)}</p>
    <p class="dt-val">${a.thesis}</p>
    <div class="dt-row" style="margin-top:14px"><p class="dt-key">本幕战事</p>
      <ul class="dt-wars">${wars.map((b) =>
        `<li><button data-battle="${b.id}"><i>${formatYear(b.year)}</i>${b.name}</button></li>`).join('')}</ul></div>`;
}

function showEvent(e) {
  detailMode = 'event';
  actShown = null;
  table.selected = null;
  endMarch();
  detail.innerHTML = `<p class="dt-eyebrow">${e.kind === '变' ? '变法' : e.kind === '纵' ? '纵横' : e.kind === '并' ? '兼并' : '迁都'}</p>
    <p class="dt-title">${e.title}</p>
    <p class="dt-sub">${formatYear(e.year)} · ${eraOf(e.year)}</p>
    <p class="dt-val">${e.text}</p>`;
}

function showRegion(i) {
  detailMode = 'region';
  actShown = null;
  table.selected = null;
  const r = REGIONS[i];
  const st = STATES[table.owner[r.id]];
  const hist = [];
  let prev = null;
  for (let y = START; y <= END; y++) {
    const o = ownerAt(y)[r.id];
    if (o !== prev) { hist.push({ y, o }); prev = o; }
  }
  detail.innerHTML = `<p class="dt-eyebrow">地</p>
    <p class="dt-title">${r.name}</p>
    <p class="dt-sub">${formatYear(year)} 属 ${st.name}</p>
    <div class="dt-row"><p class="dt-key">易主</p>
      <p class="dt-val">${hist.map((h) => `${formatYear(h.y)} <strong style="color:${STATES[h.o].ink || STATES[h.o].color}">${STATES[h.o].name}</strong>`).join(' → ')}</p></div>
    <div class="dt-row"><p class="dt-key">分量</p>
      <p class="dt-val">田赋人口之厚薄计 <strong>${r.weight.toFixed(1)}</strong>，约当带甲 ${Math.round(r.weight * 4.5)} 万</p></div>`;
}

function selectBattle(id, scroll = false) {
  const b = battleById.get(id);
  if (!b) return;
  detailMode = 'battle';
  actShown = null;
  table.selected = id;
  if (year !== b.year) setYear(b.year);
  detail.innerHTML = `<p class="dt-eyebrow">战</p>
    <p class="dt-title is-war">${b.name}</p>
    <p class="dt-sub">${formatYear(b.year)} · ${eraOf(b.year)}</p>
    <div class="dt-row"><p class="dt-key">形势</p><p class="dt-val">${b.sides}</p></div>
    <div class="dt-row"><p class="dt-key">兵力</p><p class="dt-val">${b.force}</p></div>
    <div class="dt-row"><p class="dt-key">结局</p><p class="dt-val">${b.result}</p></div>
    <p class="dt-weight">${b.weight}</p>
    <button class="dt-march" id="btnMarch">重看推演</button>`;
  $('btnMarch').addEventListener('click', () => startMarch(b));
  startMarch(b);
  if (scroll) detail.scrollTop = 0;
}

detail.addEventListener('click', (e) => {
  const el = e.target.closest('[data-battle]');
  if (!el) return;
  pause();
  selectBattle(el.dataset.battle, true);
});

/* ── 推演：盘面接管，解说随军而走 ─────────────── */

let march = null;

function startMarch(b) {
  march = { battle: b, step: -1 };
  table.play(b);
  document.body.classList.add('is-marching');
  $('caption').hidden = false;
  $('capName').textContent = b.name;
  $('capYear').textContent = `${formatYear(b.year)} · ${eraOf(b.year)}`;
  $('capDots').innerHTML = b.steps.map(() => '<i></i>').join('');
  syncCaption(true);
}

function endMarch(home = true) {
  if (!march) return;
  march = null;
  table.stop();
  if (home) table.flyHome();
  table.selected = null;
  document.body.classList.remove('is-marching');
  $('caption').hidden = true;
}

const NUMERALS = ['一', '二', '三', '四', '五', '六'];

function syncCaption(force = false) {
  if (!march || !table.playback) return;
  const step = table.playback.step;
  if (!force && step === march.step) return;
  march.step = step;
  const line = march.battle.steps[step] || march.battle.steps[march.battle.steps.length - 1];
  $('capNo').textContent = NUMERALS[step] || NUMERALS[march.battle.steps.length - 1];
  $('capText').textContent = line;
  const dots = $('capDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].className = i <= step ? 'is-done' : '';
  $('caption').classList.toggle('is-final', step >= march.battle.steps.length - 1);
}

$('capClose').addEventListener('click', () => endMarch());

/* ── 主循环 ───────────────────────────────────── */

function setYear(y, animate = true) {
  const next = Math.max(START, Math.min(END, Math.round(y)));
  if (next === year) return;
  year = next;
  table.setYear(year, animate);
  ruler.setAttribute('aria-valuenow', String(year));
  ruler.setAttribute('aria-valuetext', `${formatYear(year)}年`);
  const at = pct(year);
  $('cursor').style.left = `${at}%`;
  $('cursorYear').textContent = formatYear(year);
  $('cursorYear').classList.toggle('is-flipped', at > 86);
  $('yearBig').textContent = formatYear(year);
  $('yearTag').textContent = eraOf(year);
  syncChron();
  syncPower();
  syncActs();
  if (detailMode === 'act') showAct();
  const change = CHANGES.find((c) => c.year === year && c.note);
  if (change && animate) showToast(`${formatYear(year)} · ${change.note}`);
  if (playing) {
    const hit = BATTLES.find((b) => b.year === year);
    if (hit) selectBattle(hit.id);
  }
}

let toastTimer = 0;

function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('is-in');
  void el.offsetWidth;
  el.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('is-in'); }, 2600);
}

function toggle() { playing ? pause() : start(); }

function start() {
  if (year >= END) { endMarch(); setYear(START, false); }
  playing = true;
  lastTick = performance.now();
  $('playIcon').textContent = '❚❚';
  $('playText').textContent = '暂停';
}

function pause() {
  playing = false;
  $('playIcon').textContent = '▶';
  $('playText').textContent = '推演';
}

// 有事的年份值得停一停，平淡的年份一带而过
const NOTABLE = new Set([...EVENTS.map((e) => e.year), ...CHANGES.map((c) => c.year)]);
const dwell = (y) => (NOTABLE.has(y) ? 1500 : 55);

$('btnPlay').addEventListener('click', toggle);

function frame(now) {
  if (march) syncCaption();
  if (playing) {
    const pb = table.playback;
    if (pb && pb.t < 1) {
      lastTick = now;
    } else if (march) {
      endMarch();
      showAct();
      lastTick = now + 450;
    } else if (now - lastTick > dwell(year)) {
      lastTick = now;
      if (year >= END) pause(); else setYear(year + 1);
    }
  }
  table.draw(now);
  requestAnimationFrame(frame);
}

/* ── 交互 ─────────────────────────────────────── */

const tip = $('tip');
let dragging = null;
const touches = new Map();
let pinch = null;

const spread = () => {
  const [a, b] = [...touches.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { dragging = null; pinch = spread(); return; }
  dragging = { x: e.clientX, y: e.clientY, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2 && pinch) {
    const now = spread();
    if (pinch.d > 0) table.zoomAt(now.x - r.left, now.y - r.top, now.d / pinch.d);
    pinch = now;
    tip.hidden = true;
    return;
  }
  if (dragging) {
    table.pan(e.clientX - dragging.x, e.clientY - dragging.y);
    dragging.moved += Math.abs(e.clientX - dragging.x) + Math.abs(e.clientY - dragging.y);
    dragging.x = e.clientX;
    dragging.y = e.clientY;
    tip.hidden = true;
    return;
  }
  const b = table.battleAt(px, py);
  if (b) {
    table.hover = null;
    canvas.style.cursor = 'pointer';
    tip.hidden = false;
    tip.innerHTML = `<b>${b.name}</b> <span>${formatYear(b.year)}</span>`;
    tip.style.left = `${px}px`;
    tip.style.top = `${py}px`;
    return;
  }
  canvas.style.cursor = '';
  const i = table.regionAt(px, py);
  table.hover = i;
  if (i < 0) { tip.hidden = true; return; }
  const rg = REGIONS[i];
  const st = STATES[table.owner[rg.id]];
  tip.hidden = false;
  tip.innerHTML = `<b>${rg.name}</b> <span style="color:${st.ink || st.color}">${st.name}</span>`;
  tip.style.left = `${px}px`;
  tip.style.top = `${py}px`;
  $('hint').classList.add('is-hidden');
});

canvas.addEventListener('pointerup', (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  const wasDrag = dragging && dragging.moved > 5;
  dragging = null;
  canvas.classList.remove('is-dragging');
  if (wasDrag) return;
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  const b = table.battleAt(px, py);
  if (b) { pause(); selectBattle(b.id, true); return; }
  const i = table.regionAt(px, py);
  if (i >= 0) { endMarch(); showRegion(i); }
});

canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; dragging = null; });
canvas.addEventListener('pointerleave', () => { table.hover = null; tip.hidden = true; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  table.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  $('hint').classList.add('is-hidden');
}, { passive: false });

$('btnFit').addEventListener('click', () => table.fit());
$('btnZoomIn').addEventListener('click', () => table.zoomAt(table.css.w / 2, table.css.h / 2, 1.3));
$('btnZoomOut').addEventListener('click', () => table.zoomAt(table.css.w / 2, table.css.h / 2, 1 / 1.3));

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    const key = chip.dataset.layer;
    table.layers[key] = !table.layers[key];
    chip.classList.toggle('is-on', table.layers[key]);
    chip.setAttribute('aria-pressed', String(table.layers[key]));
  });
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest('.ruler')) return;
  if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); toggle(); }
});

new ResizeObserver(() => table.resize()).observe(stage);

/* ── 启程 ─────────────────────────────────────── */

buildRuler();
buildChron();
table.resize();
table.setYear(START, false);
$('cursor').style.left = `${pct(START)}%`;
$('yearTag').textContent = eraOf(START);
syncChron();
syncPower();
syncActs();
showAct();
requestAnimationFrame(frame);
