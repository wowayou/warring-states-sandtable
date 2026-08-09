// 沙盘本体：起伏、水系、疆域镶嵌、兵棋与行军推演，全部画在一张 canvas 上。

import {
  project, projectAll, bounds, voronoi, buildAdjacency,
  pointInPolygon, smooth, resample, warpRing, fbm, scanlineMask,
} from './geo.js';
import { OUTLINE, REGIONS, RIVERS, MOUNTAINS, WALLS, PASSES } from './atlas.js';
import { STATES, BATTLES, ownerAt, capitalsAt } from './history.js';

const SERIF = '"Sandtable Serif","Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC","Noto Serif SC",serif';
const SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

const PALETTE = {
  void: '#06090a',
  sea: '#06101a',
  seaDeep: '#030709',
  seaLine: 'rgba(150,190,210,0.07)',
  land: '#423d33',     // 中性石色：底子不带绿，列国的颜色才不糊
  shadow: '#100f08',
  light: '#867f66',
  bronze: '#c9a227',
  cinnabar: '#c8352b',
  bone: '#e8e2d2',
};

const COAST_FROM = 7;   // 鸭绿江口
const COAST_TO = 36;    // 北部湾
const GRID = 680;       // 高程场分辨率
const SAMPLE = 300;     // 陆地采样分辨率
const RIDGE_WEIGHT = { 阴山: 0.85, 燕山: 0.8, 太行: 1.05, 秦岭: 1.25, 崤函: 0.75, 大别: 0.7, 巫山: 1.0, 泰岱: 0.65, 武夷: 0.75, 岷山: 1.3 };
const CAM_MS = 900;      // 镜头推移时长
const KM_PER_UNIT = 1.112; // 一个盘面单位约当的公里数（一度纬距 = 100 单位）

export class SandTable {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.year = -475;
    this.owner = ownerAt(this.year);
    this.morph = 1;
    this.layers = { relief: true, rivers: true, walls: true, passes: true, battles: true, labels: true };
    this.playback = null;
    this.hover = null;
    this.selected = null;
    this.view = { scale: 1, x: 0, y: 0 };
    this.dirty = true;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.build();
  }

  build() {
    const raw = projectAll(OUTLINE);
    // 海岸加细皱：长直段一看就是手画不出来的
    const shore = warpRing(raw, true, { scale: 0.026, amp: 0.1, max: 11, steps: 5 });
    this.outline = shore.ring;
    this.bbox = bounds(this.outline);
    const at = (i) => shore.spans[i % shore.spans.length].start;
    this.coast = this.outline.slice(at(COAST_FROM), at(COAST_TO) + 1);
    this.rim = [...this.outline.slice(at(COAST_TO)), ...this.outline.slice(0, at(COAST_FROM) + 1)];
    this.focus = bounds(projectAll([[102.0, 42.7], [123.8, 25.4]]));
    this.seaPoly = [
      ...this.coast,
      ...projectAll([[107.0, 17.0], [135.0, 17.0], [135.0, 45.0], [126.6, 44.4]]),
    ];

    this.seeds = REGIONS.map((r) => ({ ...project([r.lon, r.lat]), region: r }));
    const pad = 60;
    const frame = [
      { x: this.bbox.x0 - pad, y: this.bbox.y0 - pad },
      { x: this.bbox.x1 + pad, y: this.bbox.y0 - pad },
      { x: this.bbox.x1 + pad, y: this.bbox.y1 + pad },
      { x: this.bbox.x0 - pad, y: this.bbox.y1 + pad },
    ];
    this.cells = voronoi(this.seeds, frame);
    this.adjacency = buildAdjacency(this.cells, this.seeds);
    // 郡界同样加扰；相邻两格共用的边由规范朝向保证严丝合缝
    const warped = this.cells.map((c) => (c.length
      ? warpRing(c, true, { scale: 0.015, amp: 0.15, max: 15, steps: 6 })
      : { ring: [], spans: [] }));
    this.shapes = warped.map((w) => w.ring);
    this.spans = warped.map((w) => w.spans);

    this.rivers = RIVERS.map((r) => ({ ...r, pts: smooth(projectAll(r.path), 0.5, 10), at: project(r.label) }));
    this.mountains = MOUNTAINS.map((m) => ({ ...m, pts: smooth(projectAll(m.path), 0.5, 10) }));
    this.walls = WALLS.map((w) => ({ ...w, pts: smooth(projectAll(w.path), 0.5, 8) }));
    this.passes = PASSES.map((p) => ({ ...p, at: project([p.lon, p.lat]) }));
    this.battles = BATTLES.map((b) => ({
      ...b,
      at: project(b.at),
      marchers: b.arrows.map((a) => ({ ...a, pts: smooth(projectAll(a.path), 0.5, 14) })),
    }));

    this.sampleLand();
    this.buildRelief();
    this.buildGrain();
    this.buildHatch();
  }

  edgePts(i, j) {
    const ring = this.shapes[i];
    const sp = this.spans[i][j];
    const out = [];
    for (let k = 0; k < sp.count; k++) out.push(ring[(sp.start + k) % ring.length]);
    return out;
  }

  // 只有落在海岸线以内的采样点才算疆土——国名与国力都据此计
  sampleLand() {
    const b = this.bbox;
    const w = SAMPLE;
    const h = Math.round((SAMPLE * b.h) / b.w);
    const cellOf = new Int16Array(w * h).fill(-1);
    const acc = REGIONS.map(() => ({ n: 0, x: 0, y: 0 }));
    const stepX = b.w / w;
    const stepY = b.h / h;
    const mask = scanlineMask(this.outline, w, h, b);
    for (let gy = 0; gy < h; gy++) {
      const py = b.y0 + (gy + 0.5) * stepY;
      for (let gx = 0; gx < w; gx++) {
        const px = b.x0 + (gx + 0.5) * stepX;
        if (!mask[gy * w + gx]) continue;
        let best = -1;
        let bd = Infinity;
        for (let k = 0; k < this.seeds.length; k++) {
          const d = (this.seeds[k].x - px) ** 2 + (this.seeds[k].y - py) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
        cellOf[gy * w + gx] = best;
        acc[best].n++;
        acc[best].x += px;
        acc[best].y += py;
      }
    }
    const unit = stepX * stepY;
    this.landArea = acc.map((a) => a.n * unit);
    this.landCentroid = acc.map((a, i) => (a.n ? { x: a.x / a.n, y: a.y / a.n } : this.seeds[i]));
    this.sample = { cellOf, w, h, stepX, stepY, x0: b.x0, y0: b.y0 };
  }

  // 用山脉骨架烙出高程，再作斜光晕渲——沙盘的起伏由此而来。
  // 脊线按宽度铺开并取最大值，山才是长条而非团块；再叠细噪声，平原亦有沙痕。
  buildRelief() {
    const b = this.bbox;
    const w = GRID;
    const h = Math.round((GRID * b.h) / b.w);
    const height = new Float32Array(w * h);
    const sx = w / b.w;
    const sy = h / b.h;

    const ridge = (p, amp, rad) => {
      const gx = (p.x - b.x0) * sx;
      const gy = (p.y - b.y0) * sy;
      const r = Math.ceil(rad);
      for (let dy = -r; dy <= r; dy++) {
        const Y = Math.round(gy + dy);
        if (Y < 0 || Y >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const X = Math.round(gx + dx);
          if (X < 0 || X >= w) continue;
          const d = Math.hypot(dx, dy) / rad;
          if (d > 1) continue;
          const f = Math.cos((d * Math.PI) / 2) ** 2;
          const i = Y * w + X;
          const v = amp * f;
          if (v > height[i]) height[i] = v;
        }
      }
    };

    for (const m of this.mountains) {
      const k = RIDGE_WEIGHT[m.name] ?? 1;
      const dense = resample(m.pts, Math.max(60, m.pts.length * 4));
      dense.forEach((p, i) => {
        // 沿脊起伏，免得整条山脉是一根等高的棍子
        const wave = 0.72 + 0.28 * fbm(i * 0.22, k * 7.3);
        ridge(p, (0.34 + 0.24 * k) * wave, 6 + 5 * k);
      });
    }

    blur(height, w, h, 4);
    blur(height, w, h, 2);

    // 细纹：山处粗砺，平地亦有起伏，免得像刷了一片漆
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const x = gx / w;
        const y = gy / h;
        const rough = 0.35 + 0.9 * Math.min(1, height[i]);
        height[i] += (fbm(x * 42, y * 42) * 0.085 + fbm(x * 130, y * 130) * 0.035) * rough;
      }
    }
    blur(height, w, h, 1);

    let peak = 0;
    for (const v of height) if (v > peak) peak = v;

    const mask = scanlineMask(this.outline, w, h, b);
    const img = new ImageData(w, h);
    const land = hex(PALETTE.land);
    const dark = hex(PALETTE.shadow);
    const lit = hex(PALETTE.light);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const o = i * 4;
        if (!mask[i]) { img.data[o + 3] = 0; continue; }
        const hl = height[clampIdx(gx - 1, w) + gy * w];
        const hr = height[clampIdx(gx + 1, w) + gy * w];
        const hu = height[gx + clampRow(gy - 1, h) * w];
        const hd = height[gx + clampRow(gy + 1, h) * w];
        const nx = ((hl - hr) / peak) * 20;
        const ny = ((hu - hd) / peak) * 20;
        let sh = (nx * 0.6 + ny * 0.6 + 1) / 2;
        sh = Math.max(0, Math.min(1, sh));
        const elev = Math.min(1, (height[i] / peak) * 1.4);
        const base = [
          land[0] + (lit[0] - land[0]) * elev * 0.3,
          land[1] + (lit[1] - land[1]) * elev * 0.3,
          land[2] + (lit[2] - land[2]) * elev * 0.3,
        ];
        const k = Math.max(-1, Math.min(1, (sh - 0.5) * 1.7));
        for (let c = 0; c < 3; c++) {
          const target = k >= 0 ? lit[c] : dark[c];
          img.data[o + c] = Math.round(base[c] + (target - base[c]) * Math.abs(k));
        }
        img.data[o + 3] = 255;
      }
    }
    this.relief = offscreen(w, h);
    this.relief.getContext('2d').putImageData(img, 0, 0);
  }

  buildHatch() {
    const n = 7;
    const c = offscreen(n, n);
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(232,226,210,0.16)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-n, n); g.lineTo(n, -n);
    g.moveTo(0, n * 2); g.lineTo(n * 2, 0);
    g.stroke();
    this.hatch = c;
  }

  buildGrain() {
    const n = 160;
    const c = offscreen(n, n);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n);
    let seed = 7717;
    for (let i = 0; i < n * n; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      const v = (seed >>> 16) & 255;
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 245; img.data[i * 4 + 2] = 225;
      img.data[i * 4 + 3] = v > 228 ? 15 : v < 24 ? 13 : 0;
    }
    ctx.putImageData(img, 0, 0);
    this.grain = c;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.dpr = dpr;
    this.css = { w: rect.width, h: rect.height };
    this.fit();
  }

  fit() {
    if (!this.css) return;
    this.cam = null;
    this.driftAnchor = null;
    const pad = 20;
    const f = this.focus;
    // 宽而扁的窗口允许纵向略微裁去一点，否则盘子小、两侧全是空
    const s = Math.min((this.css.w - pad * 2) / f.w, ((this.css.h - pad * 2) / f.h) * 1.12);
    this.base = s;
    this.view.scale = 1;
    this.view.x = (this.css.w - f.w * s) / 2 - f.x0 * s;
    this.view.y = (this.css.h - f.h * s) / 2 - f.y0 * s;
  }

  toScreen(p) {
    const s = this.base * this.view.scale;
    return { x: p.x * s + this.view.x, y: p.y * s + this.view.y };
  }

  toWorld(px, py) {
    const s = this.base * this.view.scale;
    return { x: (px - this.view.x) / s, y: (py - this.view.y) / s };
  }

  zoomAt(px, py, factor) {
    this.cam = null;
    const before = this.toWorld(px, py);
    this.view.scale = Math.max(0.8, Math.min(7, this.view.scale * factor));
    const after = this.toWorld(px, py);
    const s = this.base * this.view.scale;
    this.view.x += (after.x - before.x) * s;
    this.view.y += (after.y - before.y) * s;
  }

  pan(dx, dy) {
    this.cam = null;
    this.view.x += dx;
    this.view.y += dy;
  }

  setYear(year, animate = true) {
    const next = ownerAt(year);
    const moved = [];
    REGIONS.forEach((r, i) => { if (next[r.id] !== this.owner[r.id]) moved.push(i); });
    this.owner = next;
    const still = !this.cam && !this.drifting;
    if (animate && still && moved.length && this.snapshotBoard()) { this.morph = 0; this.hasPrev = true; }
    else { this.morph = 1; this.hasPrev = false; }
    this.year = year;
    this.flash = animate && moved.length ? { idx: moved, start: performance.now() } : null;
    return moved;
  }

  regionAt(px, py) {
    const w = this.toWorld(px, py);
    if (!pointInPolygon(w.x, w.y, this.outline)) return -1;
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < this.seeds.length; k++) {
      const d = (this.seeds[k].x - w.x) ** 2 + (this.seeds[k].y - w.y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  battleAt(px, py) {
    let best = null;
    let bestD = 22;
    for (const b of this.battles) {
      if (b.year > this.year) continue;
      const s = this.toScreen(b.at);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  play(battle, per = 1250) {
    const n = battle.marchers.length;
    const pts = [battle.at, ...battle.marchers.flatMap((m) => m.pts)];
    this.flyTo(boundsOf(pts));
    // 等镜头落定再起兵，否则画面一边推近一边画箭头，看着晕
    const wait = this.cam ? CAM_MS + 120 : 0;
    this.playback = {
      battle, t: 0, step: 0, start: performance.now() + wait,
      per, tail: 1900, total: n * per + 1900,
    };
  }

  stop() { this.playback = null; }

  // 缓缓移向所讲之处，而非跳过去
  focusOn(lonlat, scale = 1.5, dur = 2400) {
    if (!this.css) return;
    const p = project(lonlat);
    const s = this.base * scale;
    const f = this.focus;
    const halfW = this.css.w / (2 * s);
    const halfH = this.css.h / (2 * s);
    const cx = f.w > halfW * 2
      ? Math.max(f.x0 + halfW, Math.min(f.x1 - halfW, p.x)) : (f.x0 + f.x1) / 2;
    const cy = f.h > halfH * 2
      ? Math.max(f.y0 + halfH, Math.min(f.y1 - halfH, p.y)) : (f.y0 + f.y1) / 2;
    this.cam = {
      from: { ...this.view },
      to: { scale, x: this.css.w / 2 - cx * s, y: this.css.h / 2 - cy * s },
      start: performance.now(),
      dur,
    };
    this.driftAnchor = null;
    if (this.reduced) { Object.assign(this.view, this.cam.to); this.cam = null; this.dirty = true; }
  }

  // 放映时镜头始终有极缓的呼吸与横移，静止的画面不像纪录片
  startDrift() { this.drifting = true; this.driftAnchor = null; }

  stopDrift() { this.drifting = false; this.driftAnchor = null; }

  applyDrift(now) {
    if (!this.drifting || this.cam || this.reduced || !this.css) return;
    if (!this.driftAnchor) {
      const c = this.toWorld(this.css.w / 2, this.css.h / 2);
      this.driftAnchor = { x: c.x, y: c.y, scale: this.view.scale, t0: now };
    }
    const a = this.driftAnchor;
    const t = (now - a.t0) / 1000;
    const scale = a.scale * (1 + 0.045 * Math.sin(t / 15 + 1.2));
    const s = this.base * scale;
    this.view.scale = scale;
    this.view.x = this.css.w / 2 - a.x * s + Math.sin(t / 19) * 24;
    this.view.y = this.css.h / 2 - a.y * s + Math.cos(t / 26) * 16;
  }

  // 推演毕，镜头退回全景，否则接下来的年份都困在战场里
  flyHome() {
    if (!this.css) return;
    const s = this.base;
    this.cam = {
      from: { ...this.view },
      to: {
        scale: 1,
        x: (this.css.w - this.focus.w * s) / 2 - this.focus.x0 * s,
        y: (this.css.h - this.focus.h * s) / 2 - this.focus.y0 * s,
      },
      start: performance.now(),
      dur: CAM_MS,
    };
    if (this.reduced) { Object.assign(this.view, this.cam.to); this.cam = null; this.dirty = true; }
  }

  // 推演时把镜头压到战场上，否则行军只是几根短线
  flyTo(box, now = performance.now()) {
    const w = Math.max(box.x1 - box.x0, 1);
    const h = Math.max(box.y1 - box.y0, 1);
    const want = Math.min((this.css.w * 0.46) / w, (this.css.h * 0.5) / h) / this.base;
    const scale = Math.max(1.15, Math.min(3.2, want));
    const s = this.base * scale;
    this.cam = {
      from: { ...this.view },
      to: {
        scale,
        x: this.css.w / 2 - ((box.x0 + box.x1) / 2) * s,
        y: this.css.h * 0.43 - ((box.y0 + box.y1) / 2) * s,
      },
      start: now,
      dur: CAM_MS,
    };
    if (this.reduced) { Object.assign(this.view, this.cam.to); this.cam = null; this.dirty = true; }
  }

  // 盘面本身只在「视角、年份、图层」变了才重绘，缓存下来；
  // 每帧只重画会动的那几层。此前逐帧全量重绘，是卡顿的根子。
  boardKey() {
    const v = this.view;
    const bits = Object.values(this.layers).map((b) => (b ? 1 : 0)).join('');
    return `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.scale.toFixed(4)},${this.year},${bits},${this.css.w}x${this.css.h}`;
  }

  // 海、投影、起伏只随视角变；拖动铜尺时视角不动，这层不必重算
  baseKey() {
    const v = this.view;
    return `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.scale.toFixed(4)},${this.layers.relief ? 1 : 0},${this.css.w}x${this.css.h}`;
  }

  renderBase() {
    if (!this.baseLayer || this.baseLayer.width !== this.canvas.width || this.baseLayer.height !== this.canvas.height) {
      this.baseLayer = offscreen(this.canvas.width, this.canvas.height);
      this.baseCtx = this.baseLayer.getContext('2d');
    }
    const ctx = this.baseCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.baseLayer.width, this.baseLayer.height);
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, this.css.w, this.css.h);
    this.drawSea(ctx);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetX = 9;
    ctx.shadowOffsetY = 13;
    this.path(ctx, this.outline);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    const s = this.base * this.view.scale;
    const org = this.toScreen({ x: this.bbox.x0, y: this.bbox.y0 });
    ctx.save();
    this.path(ctx, this.outline);
    ctx.clip();
    if (this.layers.relief) {
      ctx.drawImage(this.relief, org.x, org.y, this.bbox.w * s, this.bbox.h * s);
    } else {
      ctx.fillStyle = PALETTE.land;
      ctx.fillRect(0, 0, this.css.w, this.css.h);
    }
    ctx.restore();
    ctx.restore();
  }

  animating() {
    if (this.morph < 1 || this.cam || this.playback || this.flash || this.drifting) return true;
    if (this.cinema && !this.reduced) return true;
    if (this.reduced || !this.layers.battles) return false;
    if (this.selected) return true;
    return this.battles.some((b) => b.year <= this.year && this.year - b.year <= 6);
  }

  draw(now) {
    if (!this.css) return;
    if (this.morph < 1) {
      this.morph = Math.min(1, this.morph + 0.05);
      if (this.morph >= 1) this.hasPrev = false;
    }
    if (this.cam) {
      const k = ease(Math.min(1, (now - this.cam.start) / this.cam.dur));
      const { from, to } = this.cam;
      this.view.scale = from.scale + (to.scale - from.scale) * k;
      this.view.x = from.x + (to.x - from.x) * k;
      this.view.y = from.y + (to.y - from.y) * k;
      if (k >= 1) { this.cam = null; this.driftAnchor = null; }
    }
    this.applyDrift(now);

    const key = this.boardKey();
    const boardStale = key !== this.boardCacheKey;
    if (!boardStale && !this.dirty && !this.animating()) return;
    this.dirty = false;

    // 视角在缓动时，先缩放缓存那张，按节流重绘，免得逐帧全量重画
    const throttle = this.scrubbing ? 95 : this.drifting ? 380 : 0;
    const held = throttle > 0 && this.board && now - (this.lastBoardAt || 0) < throttle;
    const glide = this.board && this.boardView && (this.cam || (boardStale && held));
    if (boardStale && !this.cam && !held) {
      this.renderBoard();
      this.boardCacheKey = key;
      this.lastBoardAt = now;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.css.w, this.css.h);
    if (glide) {
      const k = this.view.scale / this.boardView.scale;
      ctx.save();
      ctx.translate(this.view.x - this.boardView.x * k, this.view.y - this.boardView.y * k);
      ctx.scale(k, k);
      ctx.drawImage(this.board, 0, 0, this.css.w, this.css.h);
      ctx.restore();
    } else {
      ctx.drawImage(this.board, 0, 0, this.css.w, this.css.h);
      if (this.morph < 1 && this.hasPrev) {
        ctx.globalAlpha = 1 - ease(this.morph);
        ctx.drawImage(this.boardPrev, 0, 0, this.css.w, this.css.h);
        ctx.globalAlpha = 1;
      }
    }

    ctx.save();
    this.path(ctx, this.outline);
    ctx.clip();
    this.drawFlash(ctx, now);
    this.drawHover(ctx);
    ctx.restore();

    if (this.layers.battles) this.drawBattles(ctx, now);
    if (this.playback) this.drawPlayback(ctx, now);

    if (!this.cinema) {
      this.drawPlate(ctx);
      this.drawCompass(ctx);
      if (!this.playback && this.css.w > 560) this.drawLegend(ctx);
    }
    this.drawScale(ctx);

    ctx.globalAlpha = this.cinema ? 0.42 : 0.3;
    ctx.fillStyle = this.grainPattern || (this.grainPattern = ctx.createPattern(this.grain, 'repeat'));
    if (this.cinema) {
      const gx = ((now / 40) | 0) % 160;
      const gy = ((now / 27) | 0) % 160;
      ctx.save();
      ctx.translate(-gx, -gy);
      ctx.fillRect(0, 0, this.css.w + 160, this.css.h + 160);
      ctx.restore();
    } else {
      ctx.fillRect(0, 0, this.css.w, this.css.h);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  renderBoard() {
    if (!this.board || this.board.width !== this.canvas.width || this.board.height !== this.canvas.height) {
      this.board = offscreen(this.canvas.width, this.canvas.height);
      this.boardCtx = this.board.getContext('2d');
      this.grainPattern = null;
      this.baseCacheKey = null;
    }
    const bKey = this.baseKey();
    if (bKey !== this.baseCacheKey) {
      this.renderBase();
      this.baseCacheKey = bKey;
    }

    this.boardView = { ...this.view };
    const ctx = this.boardCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.board.width, this.board.height);
    ctx.drawImage(this.baseLayer, 0, 0);
    ctx.scale(this.dpr, this.dpr);

    const s = this.base * this.view.scale;
    const org = this.toScreen({ x: this.bbox.x0, y: this.bbox.y0 });

    ctx.save();
    this.path(ctx, this.outline);
    ctx.clip();

    this.drawTerritory(ctx);

    if (this.layers.relief) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.relief, org.x, org.y, this.bbox.w * s, this.bbox.h * s);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // 沙盘只塑造诸夏；其外压暗，作盘面之余白
    if (this.tribePath) {
      ctx.fillStyle = 'rgba(6,10,12,0.5)';
      ctx.fill(this.tribePath);
    }

    this.drawBorders(ctx);
    if (this.layers.rivers) this.drawRivers(ctx);
    if (this.layers.walls) this.drawWalls(ctx);
    this.drawBevel(ctx);
    ctx.restore();

    this.drawRim(ctx);
    this.drawCoast(ctx);
    if (this.layers.passes) this.drawPasses(ctx);
    this.drawCapitals(ctx);
    if (this.layers.labels) this.drawNames(ctx);
    ctx.restore();
  }

  toPath(pts, close = true, into = null) {
    const p = into || new Path2D();
    for (let i = 0; i < pts.length; i++) {
      const q = this.toScreen(pts[i]);
      if (i === 0) p.moveTo(q.x, q.y); else p.lineTo(q.x, q.y);
    }
    if (close) p.closePath();
    return p;
  }

  path(ctx, pts, close = true) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = this.toScreen(pts[i]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    if (close) ctx.closePath();
  }

  drawSea(ctx) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, this.css.h);
    g.addColorStop(0, PALETTE.sea);
    g.addColorStop(1, PALETTE.seaDeep);
    this.path(ctx, this.seaPoly);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    // 近岸浅滩：一圈由亮转暗的水痕，陆地才浮得起来
    for (const [w, a] of [[26, 0.05], [15, 0.06], [7, 0.09]]) {
      this.path(ctx, this.coast, false);
      ctx.strokeStyle = `rgba(150,196,214,${a})`;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.seaLine;
    ctx.lineWidth = 1;
    const step = Math.max(11, 14 * this.view.scale);
    for (let y = -this.css.h; y < this.css.h * 2; y += step) {
      ctx.beginPath();
      ctx.moveTo(-40, y);
      ctx.lineTo(this.css.w + 40, y + this.css.w * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  fillFor(i) {
    return STATES[this.owner[REGIONS[i].id]].color;
  }

  snapshotBoard() {
    if (!this.board) return false;
    if (!this.boardPrev || this.boardPrev.width !== this.board.width || this.boardPrev.height !== this.board.height) {
      this.boardPrev = offscreen(this.board.width, this.board.height);
      this.boardPrevCtx = this.boardPrev.getContext('2d');
    }
    this.boardPrevCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.boardPrevCtx.clearRect(0, 0, this.boardPrev.width, this.boardPrev.height);
    this.boardPrevCtx.drawImage(this.board, 0, 0);
    return true;
  }

  drawTerritory(ctx) {
    const byColor = new Map();
    const tribes = new Path2D();
    const hairlines = new Path2D();
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.shapes[i];
      if (!cell.length) continue;
      this.toPath(cell, true, hairlines);
      if (!this.landArea[i]) continue;
      const st = STATES[this.owner[REGIONS[i].id]];
      const color = st.tribe ? mix(this.fillFor(i), '#0a1013', 0.55) : this.fillFor(i);
      let g = byColor.get(color);
      if (!g) { g = { path: new Path2D(), tribe: st.tribe }; byColor.set(color, g); }
      this.toPath(cell, true, g.path);
      if (st.tribe) this.toPath(cell, true, tribes);
    }
    for (const [color, g] of byColor) {
      ctx.fillStyle = color;
      ctx.globalAlpha = g.tribe ? 0.74 : 0.66;
      ctx.fill(g.path);
    }
    ctx.globalAlpha = 1;
    // 化外之地的斜纹改用图案填充，不再逐格裁剪画线
    ctx.fillStyle = this.hatchPattern || (this.hatchPattern = ctx.createPattern(this.hatch, 'repeat'));
    ctx.fill(tribes);
    this.tribePath = tribes;
    ctx.strokeStyle = 'rgba(9,12,10,0.32)';
    ctx.lineWidth = 0.6;
    ctx.stroke(hairlines);
  }

  drawBorders(ctx) {
    const backing = new Path2D();
    const byInk = new Map();
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (!cell.length) continue;
      const mine = this.owner[REGIONS[i].id];
      for (let j = 0; j < cell.length; j++) {
        const nb = this.adjacency[i][j];
        if (nb < 0 || nb < i) continue;
        if (this.owner[REGIONS[nb].id] === mine) continue;
        const pts = this.edgePts(i, j);
        const ink = (STATES[mine].ink || '#96a096') + 'cc';
        let p = byInk.get(ink);
        if (!p) { p = new Path2D(); byInk.set(ink, p); }
        this.toPath(pts, false, backing);
        this.toPath(pts, false, p);
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,8,7,0.65)';
    ctx.lineWidth = 3.2;
    ctx.stroke(backing);
    ctx.lineWidth = 1.3;
    for (const [ink, p] of byInk) {
      ctx.strokeStyle = ink;
      ctx.stroke(p);
    }
    ctx.restore();
  }

  // 岸缘倒角：西北受光、东南落影，一圈之内陆地就抬起来了
  drawBevel(ctx) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.translate(2, 2.5);
    this.path(ctx, this.outline);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.translate(-4, -5);
    this.path(ctx, this.outline);
    ctx.strokeStyle = 'rgba(255,244,214,0.13)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();
  }

  // 图幅西、北两侧非海岸，令其溶入盘外的暗处
  drawRim(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const layers = [[34, 0.95], [22, 0.7], [12, 0.5], [5, 0.35]];
    for (const [w, a] of layers) {
      this.path(ctx, this.rim, false);
      ctx.strokeStyle = `rgba(8,11,12,${a})`;
      ctx.lineWidth = w;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCoast(ctx) {
    this.path(ctx, this.coast, false);
    ctx.strokeStyle = 'rgba(201,162,39,0.5)';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  drawRivers(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of this.rivers) {
      this.path(ctx, r.pts, false);
      ctx.strokeStyle = 'rgba(5,9,11,0.6)';
      ctx.lineWidth = 3.8;
      ctx.stroke();
      this.path(ctx, r.pts, false);
      ctx.strokeStyle = 'rgba(122,180,196,0.75)';
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
    if (this.view.scale > 1.1) {
      ctx.font = `700 11px ${SERIF}`;
      ctx.fillStyle = 'rgba(150,200,212,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const r of this.rivers) {
        const p = this.toScreen(r.at);
        ctx.fillText(r.name, p.x, p.y);
      }
    }
    ctx.restore();
  }

  drawWalls(ctx) {
    ctx.save();
    ctx.setLineDash([7, 4]);
    for (const w of this.walls) {
      if (this.year < (WALL_BUILT[w.name] ?? -400)) continue;
      const owner = this.owner[nearestRegionId(this.seeds, w.pts[0])];
      this.path(ctx, w.pts, false);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      this.path(ctx, w.pts, false);
      ctx.strokeStyle = (STATES[owner]?.ink || '#cbbf9a') + 'e6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPasses(ctx) {
    ctx.save();
    for (const p of this.passes) {
      const s = this.toScreen(p.at);
      ctx.beginPath();
      ctx.moveTo(s.x - 4, s.y + 3);
      ctx.lineTo(s.x - 4, s.y - 2);
      ctx.lineTo(s.x, s.y - 5);
      ctx.lineTo(s.x + 4, s.y - 2);
      ctx.lineTo(s.x + 4, s.y + 3);
      ctx.strokeStyle = 'rgba(201,162,39,0.9)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      if (this.view.scale > 1.25) {
        ctx.font = `500 10px ${SANS}`;
        ctx.fillStyle = 'rgba(201,162,39,0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(p.name, s.x, s.y + 6);
      }
    }
    ctx.restore();
  }

  // 兵棋：都城为方座，座之高低即国力
  drawCapitals(ctx) {
    const power = this.power();
    for (const c of capitalsAt(this.year)) {
      const st = STATES[c.state];
      const p = this.toScreen(project([c.lon, c.lat]));
      const pw = power.get(c.state) || 0;
      const hgt = 6 + Math.min(18, pw * 0.6);
      const w = 10;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(2, 1.5, w * 0.85, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = st.color;
      ctx.fillRect(-w / 2, -hgt, w, hgt);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-w / 2, -hgt, w * 0.38, hgt);
      ctx.strokeStyle = 'rgba(232,226,210,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -hgt, w, hgt);
      ctx.fillStyle = PALETTE.bone;
      ctx.font = `700 ${Math.min(11, 5 + hgt * 0.4)}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.name, 0, -hgt / 2);
      ctx.restore();
      if (this.view.scale > 1.15) {
        ctx.font = `500 10px ${SANS}`;
        ctx.fillStyle = 'rgba(232,226,210,0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(c.name, p.x, p.y + 4);
      }
    }
  }

  drawNames(ctx) {
    const groups = new Map();
    for (let i = 0; i < REGIONS.length; i++) {
      const st = this.owner[REGIONS[i].id];
      if (STATES[st].tribe || !this.landArea[i]) continue;
      const g = groups.get(st) || { area: 0, n: 0, x: 0, y: 0, best: i, bestArea: 0 };
      g.area += this.landArea[i];
      g.n += this.landArea[i];
      g.x += this.landCentroid[i].x * this.landArea[i];
      g.y += this.landCentroid[i].y * this.landArea[i];
      if (this.landArea[i] > g.bestArea) { g.bestArea = this.landArea[i]; g.best = i; }
      groups.set(st, g);
    }
    const fade = 1 - Math.max(0, Math.min(1, (this.view.scale - 1.7) / 0.6));
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [st, g] of groups) {
      if (g.area < 9000) continue;
      let anchor = { x: g.x / g.n, y: g.y / g.n };
      if (this.cellOwnerAtWorld(anchor) !== st) anchor = this.landCentroid[g.best];
      const p = this.toScreen(anchor);
      const size = Math.max(15, Math.min(38, Math.sqrt(g.area) * 0.085)) * Math.min(1.6, this.view.scale ** 0.35);
      ctx.font = `700 ${size}px ${SERIF}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.1}px`;
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(STATES[st].name, p.x, p.y);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = size * 0.35;
      ctx.fillStyle = 'rgba(246,240,224,0.94)';
      ctx.fillText(STATES[st].name, p.x, p.y);
      ctx.shadowBlur = 0;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.restore();
  }

  cellOwnerAtWorld(pt) {
    const s = this.sample;
    const gx = Math.floor((pt.x - s.x0) / s.stepX);
    const gy = Math.floor((pt.y - s.y0) / s.stepY);
    if (gx < 0 || gy < 0 || gx >= s.w || gy >= s.h) return null;
    const i = s.cellOf[gy * s.w + gx];
    return i < 0 ? null : this.owner[REGIONS[i].id];
  }

  drawBattles(ctx, now) {
    ctx.save();
    for (const b of this.battles) {
      if (b.year > this.year) continue;
      const p = this.toScreen(b.at);
      const fresh = this.year - b.year;
      const active = fresh <= 6;
      const sel = this.selected === b.id;
      const r = sel ? 8 : 5.5;
      if ((sel || active) && !this.reduced) {
        const pulse = 1 + 0.4 * Math.sin(now / 320);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.9 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(200,53,43,${sel ? 0.5 : 0.26})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.globalAlpha = sel ? 1 : active ? 0.95 : 0.4;
      ctx.strokeStyle = PALETTE.cinnabar;
      ctx.lineWidth = sel ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const busy = this.playback && this.playback.battle.id === b.id;
      if (!busy && (sel || (active && this.view.scale > 1))) {
        ctx.font = `600 11.5px ${SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(b.name, p.x + r + 5, p.y - r - 2);
        ctx.fillStyle = 'rgba(244,182,172,0.98)';
        ctx.fillText(b.name, p.x + r + 5, p.y - r - 2);
      }
    }
    ctx.restore();
  }

  drawPlayback(ctx, now) {
    const pb = this.playback;
    const elapsed = now - pb.start;
    if (elapsed <= 0) return;
    pb.t = Math.min(1, elapsed / pb.total);
    pb.step = Math.min(pb.battle.marchers.length, Math.floor(elapsed / pb.per));
    const b = pb.battle;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    b.marchers.forEach((m, idx) => {
      const t = Math.max(0, Math.min(1, (elapsed - idx * pb.per) / pb.per));
      if (t <= 0) return;
      const live = idx === pb.step || pb.step >= b.marchers.length;
      const pts = m.pts.map((p) => this.toScreen(p));
      const seg = pts.slice(0, Math.max(2, Math.floor(pts.length * t)));
      const ink = STATES[m.state]?.ink || '#e8e2d2';
      ctx.beginPath();
      seg.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = live ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.32)';
      ctx.lineWidth = live ? 6.5 : 4.2;
      ctx.stroke();
      ctx.beginPath();
      seg.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = live ? ink : dim(ink, 0.62);
      ctx.lineWidth = live ? 3 : 2.2;
      ctx.stroke();
      const head = seg[seg.length - 1];
      const prev = seg[Math.max(0, seg.length - 4)];
      const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(ang);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-4, 5.5);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-4, -5.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (m.label) {
        ctx.font = `700 12px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(m.label, head.x, head.y - 9);
        ctx.fillStyle = ink;
        ctx.fillText(m.label, head.x, head.y - 9);
      }
    });
    const tailStart = (pb.total - pb.tail) / pb.total;
    if (pb.t > tailStart) {
      const p = this.toScreen(b.at);
      const k = (pb.t - tailStart) / (1 - tailStart);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + 34 * k, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,53,43,${0.75 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFlash(ctx, now) {
    if (!this.flash) return;
    const k = (now - this.flash.start) / 1800;
    if (k >= 1) { this.flash = null; return; }
    ctx.save();
    ctx.lineJoin = 'round';
    const a = (1 - k) * (0.55 + 0.45 * Math.sin(now / 90));
    for (const i of this.flash.idx) {
      const cell = this.cells[i];
      if (!cell || !cell.length) continue;
      this.path(ctx, cell);
      ctx.strokeStyle = `rgba(240,232,205,${a})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      this.path(ctx, cell);
      ctx.fillStyle = `rgba(240,232,205,${a * 0.12})`;
      ctx.fill();
    }
    ctx.restore();
  }

  drawHover(ctx) {
    if (this.hover == null || this.hover < 0) return;
    const cell = this.shapes[this.hover];
    if (!cell || !cell.length) return;
    ctx.save();
    this.path(ctx, cell);
    ctx.fillStyle = 'rgba(232,226,210,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,226,210,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 盘缘：刻度、角标、方位、比例、图例——沙盘的框本身也是读图的工具
  drawPlate(ctx) {
    const m = 9;
    const w = this.css.w;
    const h = this.css.h;
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,39,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(m + 0.5, m + 0.5, w - m * 2 - 1, h - m * 2 - 1);

    ctx.strokeStyle = 'rgba(201,162,39,0.11)';
    for (let x = m; x < w - m; x += 56) {
      const major = Math.round((x - m) / 56) % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, m + 1);
      ctx.lineTo(x + 0.5, m + (major ? 8 : 4));
      ctx.moveTo(x + 0.5, h - m - 1);
      ctx.lineTo(x + 0.5, h - m - (major ? 8 : 4));
      ctx.stroke();
    }
    for (let y = m; y < h - m; y += 56) {
      const major = Math.round((y - m) / 56) % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(m + 1, y + 0.5);
      ctx.lineTo(m + (major ? 8 : 4), y + 0.5);
      ctx.moveTo(w - m - 1, y + 0.5);
      ctx.lineTo(w - m - (major ? 8 : 4), y + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(201,162,39,0.6)';
    ctx.lineWidth = 1.6;
    const L = 16;
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCompass(ctx) {
    const x = this.css.w - 34;
    const y = 44;
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,39,0.65)';
    ctx.fillStyle = 'rgba(201,162,39,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 13);
    ctx.lineTo(x, y - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x - 4, y - 3);
    ctx.lineTo(x + 4, y - 3);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 12px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('北', x, y + 16);
    ctx.restore();
  }

  drawScale(ctx) {
    const pxPerKm = (this.base * this.view.scale) / KM_PER_UNIT;
    const steps = [50, 100, 200, 300, 500, 1000, 2000];
    let km = steps[steps.length - 1];
    for (const c of steps) { if (c * pxPerKm >= 70 && c * pxPerKm <= 170) { km = c; break; } }
    const len = km * pxPerKm;
    // 放映时字幕占着左下角，比例尺让到右边
    const x = this.cinema ? this.css.w - 26 - len : 22;
    const y = this.css.h - (this.cinema ? 26 : 44);
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,39,0.8)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x + len, y - 4);
    ctx.moveTo(x + len / 2, y);
    ctx.lineTo(x + len / 2, y - 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,226,210,0.62)';
    ctx.font = `500 10.5px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${km} 公里 · 约 ${Math.round(km / 0.4158 / 10) * 10} 秦里`, x, y + 4);
    ctx.restore();
  }

  drawLegend(ctx) {
    const rows = ['都城·兵棋', '关塞', '长城', '战事', '化外之地'];
    const x = 24;
    const y = 26;
    const w = 106;
    const h = 20 + rows.length * 17;
    ctx.save();
    ctx.fillStyle = 'rgba(7,10,11,0.68)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(201,162,39,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = 'rgba(201,162,39,0.75)';
    ctx.font = `700 10px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('圖 例', x + 9, y + 11);

    ctx.font = `500 10.5px ${SANS}`;
    const gx = x + 9;
    rows.forEach((label, i) => {
      const cy = y + 28 + i * 17;
      ctx.save();
      if (i === 0) {
        ctx.fillStyle = '#8e5aa0';
        ctx.fillRect(gx, cy - 6, 6, 10);
        ctx.strokeStyle = 'rgba(232,226,210,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(gx + 0.5, cy - 5.5, 5, 9);
      } else if (i === 1) {
        ctx.strokeStyle = 'rgba(201,162,39,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(gx, cy + 3);
        ctx.lineTo(gx, cy - 1);
        ctx.lineTo(gx + 3.5, cy - 4);
        ctx.lineTo(gx + 7, cy - 1);
        ctx.lineTo(gx + 7, cy + 3);
        ctx.stroke();
      } else if (i === 2) {
        ctx.strokeStyle = '#c6bb98';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(gx - 1, cy);
        ctx.lineTo(gx + 9, cy);
        ctx.stroke();
      } else if (i === 3) {
        ctx.strokeStyle = PALETTE.cinnabar;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(gx, cy - 4);
        ctx.lineTo(gx + 8, cy + 4);
        ctx.moveTo(gx + 8, cy - 4);
        ctx.lineTo(gx, cy + 4);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#2c3029';
        ctx.fillRect(gx, cy - 5, 9, 10);
        ctx.strokeStyle = 'rgba(232,226,210,0.3)';
        ctx.lineWidth = 1;
        for (let k = -8; k < 10; k += 4) {
          ctx.beginPath();
          ctx.moveTo(gx + k, cy + 5);
          ctx.lineTo(gx + k + 10, cy - 5);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(232,226,210,0.6)';
      ctx.fillText(label, gx + 16, cy);
    });
    ctx.restore();
  }

  power() {
    const m = new Map();
    for (const r of REGIONS) {
      const st = this.owner[r.id];
      if (STATES[st].tribe) continue;
      m.set(st, (m.get(st) || 0) + r.weight);
    }
    return m;
  }
}

const WALL_BUILT = {
  赵北长城: -300, 燕北长城: -300, 秦昭王长城: -272,
  齐长城: -400, 楚方城: -475, 魏河西长城: -358,
};

function nearestRegionId(seeds, pt) {
  let best = seeds[0];
  let bd = Infinity;
  for (const s of seeds) {
    const d = (s.x - pt.x) ** 2 + (s.y - pt.y) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best.region.id;
}

function boundsOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, h: y1 - y0 };
}

function blur(arr, w, h, r) {
  const tmp = new Float32Array(arr.length);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += arr[y * w + clampIdx(x, w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / (2 * r + 1);
      sum += arr[y * w + clampIdx(x + r + 1, w)] - arr[y * w + clampIdx(x - r, w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clampRow(y, h) * w + x];
    for (let y = 0; y < h; y++) {
      arr[y * w + x] = sum / (2 * r + 1);
      sum += tmp[clampRow(y + r + 1, h) * w + x] - tmp[clampRow(y - r, h) * w + x];
    }
  }
}

const clampIdx = (i, w) => (i < 0 ? 0 : i >= w ? w - 1 : i);
const clampRow = (i, h) => (i < 0 ? 0 : i >= h ? h - 1 : i);

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hex(s) {
  if (s[0] !== '#') return s.match(/\d+/g).slice(0, 3).map(Number);
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

function mix(a, b, t) {
  const x = hex(a);
  const y = hex(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function dim(color, k) {
  const c = hex(color);
  return `rgba(${c[0]},${c[1]},${c[2]},${k})`;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
