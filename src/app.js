import { SandTable } from './table.js';
import { chime, stopChime } from './sound.js';
import { PlaybackController } from './player.js';
import { SCENES, TOUR, tourFrom, captionAt } from './narration.js';
import { NARRATION } from './narration-data.js';
import { makeStoryboard, storyboardAt } from './storyboard.js';
import { REGIONS } from './atlas.js';
import {
  STATES, SEVEN, EVENTS, BATTLES, CHANGES, BASE, ACTS, KIND_NAME,
  actAt, START, END, formatYear, dateOf, eraOf, ownerAt,
} from './history.js';

const $ = (id) => document.getElementById(id);
const canvas = $('table');
const stage = canvas.parentElement;
const table = new SandTable(canvas);

let year = START;
let playing = false;
const battleById = new Map(table.battles.map((b) => [b.id, b]));

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
    (b) => `<i class="mark" style="left:${pct(b.year)}%" title="${dateOf(b)} ${b.name}"></i>`
  ).join('');
}

$('acts').addEventListener('click', (e) => {
  const el = e.target.closest('.act');
  if (!el) return;
  e.stopPropagation();
  explore();
  setYear(ACTS[+el.dataset.act].from);
  showAct();
  playScene(`act-${ACTS[+el.dataset.act].roman}`);
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
  explore();
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
for (const type of ['pointercancel', 'lostpointercapture']) ruler.addEventListener(type, () => {
  scrubbing = false; table.scrubbing = false; table.dirty = true;
});
ruler.addEventListener('keydown', (e) => {
  if (e.target.closest('button')) return;
  const step = e.shiftKey ? 10 : 1;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) explore();
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
    (e, i) => `<li class="evt" tabindex="-1" data-i="${i}" data-kind="${e.kind}" data-year="${e.year}"${e.battle ? ` data-battle="${e.battle}"` : ''}>
      <span class="evt-year">${dateOf(e)}</span>
      <div class="evt-body">
        <p class="evt-title"><i class="evt-kind" title="${KIND_NAME[e.kind]}" aria-label="${KIND_NAME[e.kind]}">${e.kind}</i>${e.title}</p>
        <p class="evt-text">${e.text}</p>
      </div>
    </li>`
  ).join('');
}

let picked = null;

// 点中的那一条要亮起来——同年往往不止一事，前479 的孔子卒更在纪年之外
function pick(li) {
  if (picked === li) return;
  picked?.classList.remove('is-picked');
  picked = li;
  li?.classList.add('is-picked');
}

function openEvt(li) {
  explore();
  setYear(+li.dataset.year);
  pick(li);
  // 换年会把简册滚到当年那一段；点的是哪条，就让哪条留在眼前
  li.scrollIntoView({ block: 'nearest' });
  if (li.dataset.battle) selectBattle(li.dataset.battle, true);
  else playScene(EVENTS[+li.dataset.i].id);
}

$('chron').addEventListener('click', (e) => {
  const li = e.target.closest('.evt');
  if (li) openEvt(li);
});

// 键盘：上下移动、回车打开
$('chron').addEventListener('keydown', (e) => {
  const li = e.target.closest('.evt');
  if (!li) {
    if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault();
      (chronAnchor || $('chron').firstElementChild)?.focus();
    }
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEvt(li); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling)?.focus();
  }
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
  if (picked && +picked.dataset.year !== year) pick(null);
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
goneNote.className = 'pw-gone';

// 条长是估算，须当面说清，免得被当作史载兵数
const powerNote = document.createElement('p');
powerNote.className = 'pw-note';
powerNote.textContent = '条长按所辖之地的田赋人口估算，示意消长，非史载兵数';

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
    row.num.textContent = `${counts.get(id) || 0} 地`;
    row.el.title = `${STATES[id].name}：辖 ${counts.get(id) || 0} 地，分量 ${v.toFixed(1)}`;
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
  powerBox.appendChild(powerNote);
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
        `<li><button data-battle="${b.id}"><i>${dateOf(b)}</i>${b.name}</button></li>`).join('')}</ul></div>`;
}

function showEvent(e) {
  detailMode = 'event';
  actShown = null;
  table.selected = null;
  detail.innerHTML = `<p class="dt-eyebrow">${KIND_NAME[e.kind]}</p>
    <p class="dt-title">${e.title}</p>
    <p class="dt-sub">${dateOf(e)} · ${e.year < START ? '范围外史事；地图显示前475' : eraOf(e.year)}</p>
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
      <p class="dt-val">${hist.map((h) => `${dateOf(CHANGES.find((c) => c.year === h.y) || { year: h.y })} <strong style="color:${STATES[h.o].ink || STATES[h.o].color}">${STATES[h.o].name}</strong>`).join(' → ')}</p></div>
    <div class="dt-row"><p class="dt-key">分量</p>
      <p class="dt-val">按田赋人口之厚薄估作 <strong>${r.weight.toFixed(1)}</strong>（关中计 2.0）。示意之数，非史载</p></div>`;
}

function showBattle(id) {
  const b = battleById.get(id);
  if (!b) return;
  detailMode = 'battle';
  actShown = null;
  table.selected = id;
  if (year !== b.year) setYear(b.year);
  detail.innerHTML = `<p class="dt-eyebrow">战</p>
    <p class="dt-title is-war">${b.name}</p>
    <p class="dt-sub">${dateOf(b)} · ${eraOf(b.year)}</p>
    <div class="dt-row"><p class="dt-key">形势</p><p class="dt-val">${b.sides}</p></div>
    <div class="dt-row"><p class="dt-key">兵力</p><p class="dt-val">${b.force}</p></div>
    <div class="dt-row"><p class="dt-key">结局</p><p class="dt-val">${b.result}</p></div>
    <p class="dt-weight">${b.weight}</p>
    <button class="dt-march" id="btnMarch">重看推演</button>`;
  $('btnMarch').addEventListener('click', () => playScene(`battle-${b.id}`));
}

detail.addEventListener('click', (e) => {
  const el = e.target.closest('[data-battle]');
  if (!el) return;
  explore();
  selectBattle(el.dataset.battle, true);
});

/* ── 统一讲解、探索断点与放映 ─────────────────── */

const cap = $('caption');
const card = $('actCard');
const NUMERALS = ['一', '二', '三', '四', '五', '六'];
let cinema = false;
let idleTimer = 0;
let returnPoint = null;
let exploring = false;
let renderedScene = null;
let visualClock = 0;
let previousPosition = 0;
let previousPart = null;
let lastCaptionText = '';
let lastProgressKey = '';
let narrativeShots = [];
const player = new PlaybackController({
  scenes: SCENES, recordings: NARRATION,
  onPart: renderPart, onChange: renderTransport,
  onSceneEnd: (scene) => { if (player.voice && scene.kind === 'battle') chime('war'); },
  onComplete: wake,
});

function playScene(id) {
  exploring = false;
  renderedScene = null;
  player.load([id], { mode: 'single' });
}

function selectBattle(id, scroll = false) {
  playScene(`battle-${id}`);
  if (scroll) detail.scrollTop = 0;
}

function explore() {
  if (!exploring && player.scene) {
    if (!returnPoint) returnPoint = player.snapshot();
    pause();
  }
  exploring = true;
  $('toast').hidden = true;
  toastUntil = 0;
  table.cam = null;
  table.stopDrift();
  card.hidden = true;
  hideCaption();
  renderTransport();
}

function hideCaption() {
  cap.hidden = true;
  document.body.classList.remove('is-marching');
  table.stop();
  table.clearNarration();
  table.dirty = true;
}

function startTour({ restart = false } = {}) {
  returnPoint = null;
  exploring = false;
  renderedScene = null;
  const startYear = restart ? START : year;
  player.load(tourFrom(startYear), { mode: 'tour' });
}

function toggle() {
  if (exploring || !player.scene || player.state === 'ended') startTour({ restart: !exploring && player.state === 'ended' && year >= END });
  else if (player.active) pause();
  else player.resume();
}

function pause() { player.pause(); stopChime(); }

function renderTransport() {
  playing = player.active;
  if (player.state === 'error' || player.state === 'buffering') stopChime();
  table.dirty = true;
  document.body.classList.toggle('is-paused', player.state !== 'playing');
  $('playIcon').textContent = playing ? '❚❚' : '▶';
  $('playText').textContent = exploring ? '从此处推演' : playing ? '暂停' : player.state === 'ended' ? '重新推演' : player.scene ? '继续' : '推演';
  $('btnPlay').setAttribute('aria-label', $('playText').textContent);
  $('btnSound').setAttribute('aria-pressed', String(player.voice));
  $('btnSound').textContent = player.voice ? '配音开' : '无声';
  $('btnReturn').hidden = !returnPoint;
  $('btnFromHere').hidden = !(player.scene && (player.mode === 'single' || exploring));
  $('btnReplay').disabled = !player.part || exploring;
  $('clipSeek').disabled = !player.part || !player.duration || exploring;
  $('audioError').hidden = player.state !== 'error' || exploring;
  $('audioErrorText').textContent = player.error;
  $('btnSilent').disabled = !player.recording;
  const names = { idle: '点击推演开始讲解', loading: '正在加载配音…', buffering: '正在缓冲，画面已暂停…',
    playing: player.voice ? 'AI 合成配音' : '无声演示', paused: '讲解已暂停', ended: '本次讲解结束', error: '配音暂不可用' };
  $('playStatus').textContent = exploring ? '自由探索 · 可返回原讲解' : names[player.state];
  const navScenes = SCENES.filter((s) => s.kind === 'event' || s.kind === 'battle');
  const at = exploring ? -1 : navScenes.findIndex((s) => s.id === player.scene?.id);
  $('btnPrev').disabled = at === 0 || (!player.scene && year <= START);
  $('btnNext').disabled = at === navScenes.length - 1;
  renderProgress(true);
  if (!playing) wake();
}

function navigateScene(direction) {
  const scenes = SCENES.filter((s) => s.kind === 'event' || s.kind === 'battle');
  const wasExploring = exploring;
  let at = exploring ? -1 : scenes.findIndex((s) => s.id === player.scene?.id);
  if (at < 0) {
    at = direction > 0 ? scenes.findIndex((s) => s.year >= year) - 1
      : scenes.findLastIndex((s) => s.year <= year) + 1;
  }
  const next = scenes[at + direction];
  if (!next) return;
  exploring = false;
  renderedScene = null;
  if (!wasExploring && player.mode === 'tour' && next.year >= START) {
    const index = TOUR.findIndex((s) => s.id === next.id);
    player.load(TOUR.slice(index).map((s) => s.id));
  } else playScene(next.id);
}

function renderPart() {
  const s = player.scene;
  const part = player.part;
  narrativeShots = makeStoryboard(s, player.recording);
  table.clearNarration();
  previousPosition = player.position;
  previousPart = part.id;
  table.clock = visualClock;
  setYear(s.year);
  if (renderedScene !== s.id) {
    const leavingBattle = Boolean(table.playback);
    table.stop();
    table.stopDrift();
    renderedScene = s.id;
    table.selected = null;
    if (s.kind === 'battle') {
      showBattle(s.battle.id);
      table.play(battleById.get(s.battle.id));
    } else if (s.kind === 'event') {
      showEvent(s.event);
      if (s.at) table.focusOn(s.at, 1.22, 1600); else table.flyHome();
    } else {
      showAct();
      if (s.kind === 'act' || leavingBattle) table.flyHome();
    }
    if (s.event) pick([...$('chron').children].find((li) => EVENTS[+li.dataset.i] === s.event));
  }
  document.body.classList.toggle('is-marching', s.kind === 'battle');
  cap.hidden = s.kind === 'travel' || (cinema && s.kind === 'act');
  cap.classList.toggle('is-lore', s.kind !== 'battle');
  cap.classList.toggle('is-final', s.kind === 'battle' && part.step === s.battle.steps.length - 1);
  $('capName').textContent = s.title;
  $('capYear').textContent = s.year < START ? `${formatYear(s.year)} · 范围外史事，地图前475` : `${s.event ? dateOf(s.event) : formatYear(s.year)} · ${eraOf(s.year)}`;
  $('capNo').textContent = s.kind === 'battle' ? (part.step < 0 ? '序' : NUMERALS[part.step]) : s.kind === 'act' ? s.act.no : s.event?.kind || '';
  const stepHadFocus = $('capDots').contains(document.activeElement);
  $('capDots').innerHTML = s.kind === 'battle' ? s.parts.map((p, i) =>
    `<button type="button" data-part="${i}" aria-label="${i ? `第${i}步：${p.text}` : '战役开场'}" aria-current="${i === player.partIndex ? 'step' : 'false'}">${i || '序'}</button>`).join('') : '';
  if (stepHadFocus) $('capDots').querySelector('[aria-current="step"]')?.focus({ preventScroll: true });
  lastCaptionText = '';
  renderCard();
  renderProgress(true);
}

function renderProgress(force = false) {
  if (!player.part || exploring) return;
  const time = player.position;
  const duration = player.duration;
  const key = `${player.part.id}:${time}:${duration}`;
  if (!force && key === lastProgressKey) return;
  lastProgressKey = key;
  const text = captionAt(player.recording, time) || player.part.text;
  const cue = storyboardAt(narrativeShots, time);
  if (cue) {
    table.presentNarration(cue);
    // Exact seeks/pauses must not reuse a nearby rounded camera cache key.
    if (force) { table.boardCacheKey = null; table.baseCacheKey = null; }
  }
  syncChapterVisibility();
  if (text !== lastCaptionText) { $('capText').textContent = text; lastCaptionText = text; }
  if ($('clipSeek').max !== String(duration || 1)) $('clipSeek').max = String(duration || 1);
  if (document.activeElement !== $('clipSeek')) $('clipSeek').value = String(time);
  const label = `${clockLabel(time)} / ${clockLabel(duration)}`;
  if ($('clipTime').textContent !== label) {
    $('clipTime').textContent = label;
    $('clipSeek').setAttribute('aria-valuetext', `${clockLabel(time)}，共${clockLabel(duration)}`);
  }
  if (player.scene.kind === 'battle') {
    if (!table.playback) table.play(battleById.get(player.scene.battle.id));
    table.playback.step = player.part.step;
    table.playback.progress = duration ? Math.min(1, time / duration) : 0;
    table.dirty = table.dirty || player.state === 'playing';
  }
}

function clockLabel(seconds) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function setYear(y, animate = true) {
  const next = Math.max(START, Math.min(END, Math.round(y)));
  if (next === year) return;
  $('toast').hidden = true;
  toastUntil = 0;
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
  syncChron(); syncPower(); syncActs(); syncCine();
  if (detailMode === 'act') showAct();
  const change = CHANGES.find((c) => c.year === year && c.note);
  if (change && animate) showToast(`${dateOf(change)} · ${change.note}`);
}

let toastUntil = 0;
function showToast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  $('toast').classList.add('is-in');
  toastUntil = visualClock + 2600;
}

function renderCard() {
  const s = player.scene;
  syncChapterVisibility();
  if (card.hidden) return;
  const a = s.act;
  $('cardNo').textContent = a.no;
  $('cardKicker').textContent = `ACT ${a.roman} · ${-a.from}–${-a.to} BC`;
  $('cardTitle').textContent = a.title;
  $('cardEn').textContent = a.en;
  $('cardThesis').textContent = a.thesis;
}

function syncChapterVisibility() {
  const s = player.scene;
  const titleEnd = Math.min(4.5, player.recording?.sentences?.[0]?.end || 3.5);
  card.hidden = !cinema || exploring || s?.kind !== 'act' || player.position >= titleEnd;
  cap.hidden = exploring || !s || s.kind === 'travel' || !card.hidden;
}

function toggleCinema() {
  cinema = !cinema;
  document.body.classList.toggle('is-cinema', cinema);
  table.cinema = cinema;
  if (!cinema) table.stopDrift();
  table.dirty = true;
  $('btnCinema').setAttribute('aria-pressed', String(cinema));
  syncCine(); renderCard(); wake();
  syncChapterVisibility();
  requestAnimationFrame(() => { table.resize(); restoreCamera(); });
}

function restoreCamera() {
  if (exploring || !player.scene) return;
  const s = player.scene;
  if (narrativeShots.length) { renderProgress(true); return; }
  if (s.kind === 'battle') table.play(battleById.get(s.battle.id));
  else if (s.at) table.focusOn(s.at, 1.22, 1600);
  if (table.cam) { Object.assign(table.view, table.cam.to); table.cam = null; }
  table.dirty = true;
  renderProgress(true);
}

function syncCine() {
  const a = actAt(year);
  $('cineActNo').textContent = a.no;
  $('cineActTitle').textContent = a.title;
  $('cineYear').textContent = formatYear(year);
  $('cineReign').textContent = eraOf(year);
}

function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (cinema && player.state === 'playing') idleTimer = setTimeout(() => {
    if (player.state === 'playing' && !document.querySelector('.controls:focus-within, .audio-error:focus-within')) document.body.classList.add('is-idle');
  }, 2600);
}

for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, wake, { passive: true });
$('btnPlay').addEventListener('click', toggle);
$('btnPrev').addEventListener('click', () => navigateScene(-1));
$('btnNext').addEventListener('click', () => navigateScene(1));
$('btnReplay').addEventListener('click', () => player.replay());
$('btnFromHere').addEventListener('click', () => startTour());
$('btnReturn').addEventListener('click', () => {
  if (!returnPoint) return;
  const point = returnPoint;
  returnPoint = null; exploring = false; renderedScene = null;
  player.restore(point); restoreCamera();
});
$('btnSound').addEventListener('click', () => {
  stopChime();
  player.setVoice(!player.voice, { autoplay: !exploring && (player.active || player.state === 'error') });
});
$('btnSpeed').addEventListener('change', (e) => player.setRate(Number(e.target.value)));
// Audition/review opens separately; never let two pages speak at once or lose the tour position.
for (const id of ['btnVoiceOptions', 'btnVoiceReview']) $(id).addEventListener('click', pause);
$('clipSeek').addEventListener('input', (e) => { player.seek(Number(e.target.value)); table.dirty = true; renderProgress(true); });
$('btnRetry').addEventListener('click', () => player.retry());
$('btnSilent').addEventListener('click', () => player.setVoice(false));
$('capClose').addEventListener('click', explore);
$('capDots').addEventListener('click', (e) => {
  const button = e.target.closest('[data-part]');
  if (button) { player.selectPart(Number(button.dataset.part), 0, player.active); restoreCamera(); }
});
$('btnCinema').addEventListener('click', toggleCinema);
for (const id of ['btnChronPanel', 'btnDetailPanel']) {
  $(id).addEventListener('click', () => {
    const panel = $($(id).getAttribute('aria-controls'));
    panel.hidden = !panel.hidden;
    $(id).setAttribute('aria-expanded', String(!panel.hidden));
    $(id).querySelector('.panel-toggle-mark').textContent = panel.hidden ? '+' : '−';
  });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cinema) toggleCinema(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);

function frame() {
  player.tick();
  if (!exploring && player.part) {
    const position = player.position;
    if (previousPart === player.part.id) visualClock += Math.max(0, position - previousPosition) * 1000;
    previousPosition = position;
    previousPart = player.part.id;
    renderProgress();
  }
  table.clock = visualClock;
  table.frozen = player.state !== 'playing' || exploring;
  if (toastUntil && visualClock >= toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  table.draw(visualClock);
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
let multiTouchGesture = false;

const spread = () => {
  const [a, b] = [...touches.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

canvas.addEventListener('pointerdown', (e) => {
  explore();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (touches.size === 2) { multiTouchGesture = true; dragging = null; pinch = spread(); return; }
  dragging = { x: e.clientX, y: e.clientY, moved: 0 };
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
    tip.innerHTML = `<b>${b.name}</b> <span>${dateOf(b)}</span>`;
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
  const wasPinch = multiTouchGesture;
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (!touches.size) multiTouchGesture = false;
  const wasDrag = dragging && dragging.moved > 5;
  dragging = null;
  canvas.classList.remove('is-dragging');
  if (wasDrag || wasPinch) return;
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  const b = table.battleAt(px, py);
  if (b) { pause(); selectBattle(b.id, true); return; }
  const i = table.regionAt(px, py);
  if (i >= 0) { pause(); hideCaption(); showRegion(i); }
});

for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, (e) => {
  touches.delete(e.pointerId); pinch = null; dragging = null;
  if (!touches.size) multiTouchGesture = false;
  canvas.classList.remove('is-dragging');
});
canvas.addEventListener('pointerleave', () => { table.hover = null; table.dirty = true; tip.hidden = true; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  explore();
  const r = canvas.getBoundingClientRect();
  // 触控板一次轻扫连发数十个 wheel，故按位移大小取指数并夹住单次幅度
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 16;
  else if (e.deltaMode === 2) d *= 400;
  d = Math.max(-64, Math.min(64, d));
  table.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0018));
  $('hint').classList.add('is-hidden');
}, { passive: false });

$('btnFit').addEventListener('click', () => { explore(); table.fit(); });
$('btnZoomIn').addEventListener('click', () => { explore(); table.zoomAt(table.css.w / 2, table.css.h / 2, 1.3); });
$('btnZoomOut').addEventListener('click', () => { explore(); table.zoomAt(table.css.w / 2, table.css.h / 2, 1 / 1.3); });

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
  if (e.defaultPrevented || e.target.closest('.ruler, a, button, input, select, textarea, [contenteditable]')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
});

new ResizeObserver(() => { table.resize(); restoreCamera(); }).observe(stage);
const chromeObserver = new ResizeObserver(() => {
  const height = document.querySelector('.rail').offsetHeight + document.querySelector('.ruler-wrap').offsetHeight;
  document.documentElement.style.setProperty('--player-chrome', `${height}px`);
});
chromeObserver.observe(document.querySelector('.rail'));
chromeObserver.observe(document.querySelector('.ruler-wrap'));

/* ── 启程 ─────────────────────────────────────── */

if (document.fonts) document.fonts.load('700 24px "Sandtable Serif"').catch(() => {});

// 触屏上没有滚轮
if (window.matchMedia?.('(pointer: coarse)').matches) {
  $('hint').textContent = '双指缩放 · 拖动移图 · 点朱砂十字看战事';
}

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
renderTransport();
requestAnimationFrame(frame);
