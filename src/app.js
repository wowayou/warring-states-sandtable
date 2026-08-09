import { SandTable } from './table.js';
import { speech, chime } from './sound.js';
import { REGIONS } from './atlas.js';
import { STATES, SEVEN, EVENTS, BATTLES, CHANGES, BASE, ACTS, actAt, START, END, formatYear, ownerAt } from './history.js';

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
  table.scrubbing = true;
  hideCaption();
  if (detailMode !== 'act') showAct();
  ruler.setPointerCapture(e.pointerId);
  setYear(yearFromEvent(e), false);
  pause();
});
// 拖动时不做过渡动画：每换一年都跑一遍二十帧的渐变，正是拖不动的原因
ruler.addEventListener('pointermove', (e) => { if (scrubbing) setYear(yearFromEvent(e), false); });
ruler.addEventListener('pointerup', () => { scrubbing = false; table.scrubbing = false; table.dirty = true; syncChron(); });
ruler.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 10 : 1;
  if (detailMode !== 'act' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { hideCaption(); showAct(); }
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
  else { setYear(+li.dataset.year); showEvent(EVENTS[+li.dataset.i]); }
});

let chronAnchor = null;

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
  // 逐年重启平滑滚动会互相打断，只在当前条目真的换了才滚
  if (anchor && anchor !== chronAnchor && !scrubbing) {
    chronAnchor = anchor;
    const box = $('chron');
    const top = anchor.offsetTop - box.clientHeight * 0.42;
    box.scrollTo({ top, behavior: playing ? 'smooth' : 'auto' });
  }
}

/* ── 国力 ─────────────────────────────────────── */

// 各国立国之年：前473 的赵魏韩尚未分晋，不能说「已亡」
const RISEN = new Map();
{
  const owner = { ...BASE };
  const mark = (y) => { for (const st of new Set(Object.values(owner))) if (!RISEN.has(st)) RISEN.set(st, y); };
  mark(START);
  for (const c of CHANGES) { Object.assign(owner, c.set); mark(c.year); }
  for (const st of SEVEN) if (!RISEN.has(st)) RISEN.set(st, Infinity);
}

const powerBox = $('power');
const powerRows = new Map();
let powerOrder = '';

function powerRow(id) {
  let row = powerRows.get(id);
  if (row) return row;
  const st = STATES[id];
  const el = document.createElement('div');
  el.className = 'pw';
  el.innerHTML = `<span class="pw-name" style="color:${st.ink || st.color}">${st.name}</span>`
    + `<span class="pw-bar"><i class="pw-fill" style="background-color:${st.color}"></i></span>`
    + '<span class="pw-num"></span>';
  row = { el, fill: el.querySelector('.pw-fill'), num: el.querySelector('.pw-num') };
  powerRows.set(id, row);
  return row;
}

const goneNote = document.createElement('p');
goneNote.className = 'dt-empty';
goneNote.style.marginTop = '6px';

function syncPower() {
  const power = table.power();
  const owner = ownerAt(year);
  const counts = new Map();
  for (const r of REGIONS) counts.set(owner[r.id], (counts.get(owner[r.id]) || 0) + 1);
  const rows = [...power.entries()].sort((a, b) => b[1] - a[1])
    .filter(([id, v]) => SEVEN.includes(id) || v >= 1.4);
  const max = rows.length ? rows[0][1] : 1;

  const order = rows.map(([id]) => id).join(',');
  if (order !== powerOrder) {
    powerOrder = order;
    for (const [id] of rows) powerBox.appendChild(powerRow(id).el);
    for (const [id, row] of powerRows) {
      if (!rows.some(([x]) => x === id)) row.el.remove();
    }
  }
  for (const [id, v] of rows) {
    const row = powerRow(id);
    row.fill.style.width = `${(v / max) * 100}%`;
    row.num.textContent = `${counts.get(id) || 0}郡 · 带甲${Math.round(v * 4.5)}万`;
  }
  const gone = SEVEN.filter((x) => !power.has(x) && RISEN.get(x) <= year);
  const unborn = SEVEN.filter((x) => !power.has(x) && !(RISEN.get(x) <= year));
  const parts = [];
  if (unborn.length) parts.push(`${unborn.map((x) => STATES[x].name).join('、')} 未立`);
  if (gone.length) parts.push(`${gone.map((x) => STATES[x].name).join('、')} 已亡`);
  if (parts.length) {
    goneNote.textContent = parts.join(' · ');
    powerBox.appendChild(goneNote);
  } else {
    goneNote.remove();
  }
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
  const wars = BATTLES.filter((b) => b.year >= a.from && b.year <= a.to).sort((x, y) => x.year - y.year);
  detail.innerHTML = `<p class="dt-eyebrow">第${a.no}幕</p>
    <p class="dt-title">${a.title}</p>
    <p class="dt-sub">${formatYear(a.from)} — ${formatYear(a.to)}</p>
    <p class="dt-val">${a.thesis}</p>
    <div class="dt-row" style="margin-top:14px"><p class="dt-key">本幕战事</p>
      <ul class="dt-wars">${wars.map((b) =>
        `<li><button data-battle="${b.id}"><i>${formatYear(b.year)}</i>${b.name}</button></li>`).join('')}</ul></div>`;
}

function showEvent(e, narrate = true) {
  detailMode = 'event';
  actShown = null;
  table.selected = null;
  if (narrate) showLore(e); else endMarch();
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
const cap = $('caption');

const SEALS = { 战: '#c8352b', 变: '#8fae4e', 纵: '#4a9db4', 并: '#c9a227', 都: '#9b66ad', 学: '#b98cc4', 工: '#a8845c' };

function startMarch(b) {
  march = { battle: b, step: -1, struck: false };
  const talk = speech.enabled && speech.ready;
  const avg = b.steps.reduce((n, t) => n + t.length, 0) / b.steps.length;
  table.play(b, talk ? Math.max(1600, avg * 190) : 1250);
  document.body.classList.add('is-marching');
  cap.hidden = false;
  cap.classList.remove('is-lore');
  $('capName').textContent = b.name;
  $('capYear').textContent = `${formatYear(b.year)} · ${eraOf(b.year)}`;
  $('capDots').innerHTML = b.steps.map(() => '<i></i>').join('');
  syncCaption(true);
}

function endMarch(home = true) {
  if (!march) return;
  march = null;
  speech.hush();
  table.stop();
  if (home) table.flyHome();
  table.selected = null;
  table.dirty = true;
  document.body.classList.remove('is-marching');
  cap.hidden = true;
}

// 讲解：把随年而来的事说在盘上，而不是只躺在左栏里
function showLore(e) {
  endMarch();
  cap.hidden = false;
  cap.classList.add('is-lore');
  cap.classList.remove('is-final');
  cap.style.setProperty('--seal', SEALS[e.kind] || 'var(--bronze)');
  $('capName').textContent = e.title;
  $('capYear').textContent = `${formatYear(e.year)} · ${eraOf(e.year)}`;
  $('capNo').textContent = e.kind;
  $('capText').textContent = e.text;
  $('capDots').innerHTML = '';
}

function hideCaption() {
  endMarch();
  speech.hush();
  cap.hidden = true;
  queue = [];
  loreUntil = 0;
}

const NUMERALS = ['一', '二', '三', '四', '五', '六'];

function syncCaption(force = false) {
  if (!march || !table.playback) return;
  const step = table.playback.step;
  if (!force && step === march.step) return;
  march.step = step;
  const line = march.battle.steps[step] || march.battle.steps[march.battle.steps.length - 1];
  speech.say(line);
  if (step >= march.battle.steps.length - 1 && !march.struck) { march.struck = true; chime('war'); }
  $('capNo').textContent = NUMERALS[step] || NUMERALS[march.battle.steps.length - 1];
  $('capText').textContent = line;
  const dots = $('capDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].className = i <= step ? 'is-done' : '';
  $('caption').classList.toggle('is-final', step >= march.battle.steps.length - 1);
}

$('capClose').addEventListener('click', () => { hideCaption(); pause(); });

/* ── 放映 ─────────────────────────────────────── */

const card = $('actCard');
let cinema = false;
let cardUntil = 0;
let cardShown = null;

function toggleCinema() {
  cinema = !cinema;
  document.body.classList.toggle('is-cinema', cinema);
  table.cinema = cinema;
  table.dirty = true;
  $('btnCinema').setAttribute('aria-pressed', String(cinema));
  requestAnimationFrame(() => table.resize());
  if (cinema) {
    hideCaption();
    table.startDrift();
    syncCine();
    showCard(actAt(year));
    wake();
    if (!playing) start();
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    table.stopDrift();
    document.body.classList.remove('is-idle');
    clearTimeout(idleTimer);
    card.hidden = true;
    cardShown = null;
    cardUntil = 0;
    table.fit();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
}

function showCard(act) {
  cardShown = act;
  card.hidden = false;
  card.classList.remove('is-out');
  $('cardNo').textContent = act.no;
  $('cardKicker').textContent = `ACT ${act.roman} · ${-act.from}–${-act.to} BC`;
  $('cardTitle').textContent = act.title;
  $('cardEn').textContent = act.en;
  $('cardThesis').textContent = act.thesis;
  // 重放入场动画：元素依次落位，而非整块淡入
  for (const el of card.querySelectorAll('.card-rule, .card-eyebrow, .card-title, .card-en, .card-thesis')) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
  cardUntil = performance.now() + 6200;
  if (speech.enabled && speech.ready) {
    speech.say(`第${act.no}幕，${act.title}。${act.thesis}`, () => {
      cardUntil = Math.max(cardUntil, performance.now() + 900);
    });
  }
  chime('act');
}

function syncCine() {
  if (!cinema) return;
  const a = actAt(year);
  $('cineActNo').textContent = a.no;
  $('cineActTitle').textContent = a.title;
  $('cineYear').textContent = formatYear(year);
  $('cineReign').textContent = eraOf(year);
}

let idleTimer = 0;

function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (cinema) idleTimer = setTimeout(() => document.body.classList.add('is-idle'), 2600);
}

for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
  window.addEventListener(ev, wake, { passive: true });
}

$('btnCinema').addEventListener('click', toggleCinema);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cinema) toggleCinema();
});

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
  syncCine();
  if (detailMode === 'act') showAct();
  const change = CHANGES.find((c) => c.year === year && c.note);
  if (change && animate) showToast(`${formatYear(year)} · ${change.note}`);
  if (playing) {
    const evs = EVENTS.filter((e) => e.year === year);
    const war = evs.find((e) => e.battle);
    queue = evs.filter((e) => !e.battle);
    loreUntil = 0;
    if (war) selectBattle(war.battle);
    else if (queue.length) nextLore(performance.now());
  }
}

let queue = [];
let loreUntil = 0;

function nextLore(now) {
  const e = queue.shift();
  if (!e) return;
  showLore(e);
  if (cinema && e.at) table.focusOn(e.at, 1.22, 2800);
  if (playing) showAct();
  const base = dwell(e);
  loreUntil = now + base;
  if (speech.enabled && speech.ready) {
    // 念完再走；万一语音没回调，也有上限兜底
    loreUntil = now + base * 3;
    speech.say(`${e.title}。${e.text}`, () => { loreUntil = performance.now() + 500; });
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
  if (year >= END) { hideCaption(); setYear(START, false); }
  playing = true;
  lastTick = performance.now();
  $('playIcon').textContent = '❚❚';
  $('playText').textContent = '暂停';
}

function pause() {
  playing = false;
  speech.hush();
  $('playIcon').textContent = '▶';
  $('playText').textContent = '推演';
}

// 平淡的年份一带而过；有事的年份按其字数留出读完的工夫
// 只为「疆域动了但无事可讲」的年份留驻足；有事的年份由讲解自己决定长短
const EVENT_YEARS = new Set(EVENTS.map((e) => e.year));
const NOTABLE = new Set(CHANGES.map((c) => c.year).filter((y) => !EVENT_YEARS.has(y)));
let speed = 1;

function dwell(x) {
  if (typeof x === 'object') {
    return Math.min(5600, 1500 + (x.title.length + x.text.length) * 62) * speed;
  }
  return NOTABLE.has(x) ? 1250 * speed : 110;
}

/* ── 声 ─────────────────────────────────────── */

const btnSound = $('btnSound');
let soundReady = speech.probe();

function refreshSoundBtn() {
  soundReady = speech.ready;
  btnSound.disabled = !soundReady;
  btnSound.title = soundReady
    ? '朗读解说，战事落定敲一记编钟'
    : '此浏览器未提供中文语音，无法朗读';
}
refreshSoundBtn();
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', refreshSoundBtn);

btnSound.addEventListener('click', () => {
  speech.enabled = !speech.enabled;
  btnSound.setAttribute('aria-pressed', String(speech.enabled));
  if (!speech.enabled) speech.hush();
  else speech.say('戰國沙盤');
});

document.addEventListener('visibilitychange', () => { if (document.hidden) speech.hush(); });
window.addEventListener('pagehide', () => speech.hush());

$('btnSpeed').addEventListener('click', () => {
  speed = speed === 1 ? 0.5 : 1;
  const on = speed !== 1;
  $('btnSpeed').setAttribute('aria-pressed', String(on));
});

$('btnPlay').addEventListener('click', toggle);

function frame(now) {
  if (march) syncCaption();
  if (playing) {
    if (cinema) {
      const a = actAt(year);
      if (a !== cardShown && !table.playback) { showCard(a); lastTick = now; }
      if (cardUntil > now) { lastTick = now; table.draw(now); requestAnimationFrame(frame); return; }
      if (!card.hidden && cardUntil && cardUntil <= now) {
        card.classList.add('is-out');
        setTimeout(() => { card.hidden = true; }, 700);
        cardUntil = 0;
      }
    }
    const pb = table.playback;
    if (pb && pb.t < 1) {
      lastTick = now;
    } else if (march) {
      endMarch(!cinema);
      showAct();
      if (cinema) table.startDrift();
      if (queue.length) nextLore(now + 300);
      lastTick = now + 300;
    } else if (loreUntil > now) {
      lastTick = now;
    } else if (queue.length) {
      nextLore(now);
      lastTick = now;
    } else if (now - lastTick > dwell(year)) {
      lastTick = now;
      if (!cap.hidden) cap.hidden = true;
      if (year >= END) pause(); else setYear(year + 1);
    }
  }
  table.draw(now);
  requestAnimationFrame(frame);
}

/* ── 交互 ─────────────────────────────────────── */

const tip = $('tip');
let dragging = null;

function placeTip(px, py) {
  const w = tip.offsetWidth + 18;
  const flip = px + w > stage.clientWidth;
  tip.classList.toggle('is-left', flip);
  tip.style.left = `${px}px`;
  tip.style.top = `${Math.max(16, Math.min(stage.clientHeight - 16, py))}px`;
}
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
    if (table.hover !== null) table.dirty = true;
    table.hover = null;
    canvas.style.cursor = 'pointer';
    tip.hidden = false;
    tip.innerHTML = `<b>${b.name}</b> <span>${formatYear(b.year)}</span>`;
    placeTip(px, py);
    return;
  }
  canvas.style.cursor = '';
  const i = table.regionAt(px, py);
  if (i !== table.hover) table.dirty = true;
  table.hover = i;
  if (i < 0) { tip.hidden = true; return; }
  const rg = REGIONS[i];
  const st = STATES[table.owner[rg.id]];
  tip.hidden = false;
  tip.innerHTML = `<b>${rg.name}</b> <span style="color:${st.ink || st.color}">${st.name}</span>`;
  placeTip(px, py);
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
  if (i >= 0) { pause(); hideCaption(); showRegion(i); }
});

canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; dragging = null; });
canvas.addEventListener('pointerleave', () => { table.hover = null; table.dirty = true; tip.hidden = true; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  // 触控板一次轻扫连发数十个 wheel，故按位移大小取指数并夹住单次幅度
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 16;
  else if (e.deltaMode === 2) d *= 400;
  d = Math.max(-64, Math.min(64, d));
  table.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0018));
  $('hint').classList.add('is-hidden');
}, { passive: false });

$('btnFit').addEventListener('click', () => table.fit());
$('btnZoomIn').addEventListener('click', () => table.zoomAt(table.css.w / 2, table.css.h / 2, 1.3));
$('btnZoomOut').addEventListener('click', () => table.zoomAt(table.css.w / 2, table.css.h / 2, 1 / 1.3));

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    const key = chip.dataset.layer;
    table.layers[key] = !table.layers[key];
    table.dirty = true;
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

if (document.fonts) document.fonts.load('700 24px "Sandtable Serif"').catch(() => {});

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
