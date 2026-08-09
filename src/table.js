// 沙盘本体：起伏、水系、疆域镶嵌、兵棋与行军推演，全部画在一张 canvas 上。

import {
  project, projectAll, bounds, voronoi, buildAdjacency,
  pointInPolygon, smooth, resample,
} from './geo.js';
import { OUTLINE, REGIONS, RIVERS, MOUNTAINS, WALLS, PASSES } from './atlas.js';
import { STATES, BATTLES, ownerAt, capitalsAt } from './history.js';

const SERIF = '"Sandtable Serif","Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC","Noto Serif SC",serif';
const SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

const PALETTE = {
  void: '#080b0c',
  sea: '#0d1418',
  seaLine: 'rgba(201,162,39,0.09)',
  land: '#2c3129',
  shadow: '#0f120c',
  light: '#525c47',
  bronze: '#c9a227',
  cinnabar: '#c8352b',
  bone: '#e8e2d2',
};

const COAST_FROM = 7;   // 鸭绿江口
const COAST_TO = 36;    // 北部湾
const GRID = 300;       // 高程场分辨率
const SAMPLE = 260;     // 陆地采样分辨率
const KM_PER_UNIT = 1.112; // 一个盘面单位约当的公里数（一度纬距 = 100 单位）

export class SandTable {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.year = -475;
    this.owner = ownerAt(this.year);
    this.prevOwner = this.owner;
    this.morph = 1;
    this.layers = { relief: true, rivers: true, walls: true, passes: true, battles: true, labels: true };
    this.playback = null;
    this.hover = null;
    this.selected = null;
    this.view = { scale: 1, x: 0, y: 0 };
    this.build();
  }

  build() {
    this.outline = projectAll(OUTLINE);
    this.bbox = bounds(this.outline);
    this.coast = this.outline.slice(COAST_FROM, COAST_TO + 1);
    this.rim = [...this.outline.slice(COAST_TO), ...this.outline.slice(0, COAST_FROM + 1)];
    this.seaPoly = projectAll([
      ...OUTLINE.slice(COAST_FROM, COAST_TO + 1),
      [107.0, 17.0], [135.0, 17.0], [135.0, 45.0], [126.6, 44.4],
    ]);

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
    this.index = new Map(REGIONS.map((r, i) => [r.id, i]));

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
    for (let gy = 0; gy < h; gy++) {
      const py = b.y0 + (gy + 0.5) * stepY;
      for (let gx = 0; gx < w; gx++) {
        const px = b.x0 + (gx + 0.5) * stepX;
        if (!pointInPolygon(px, py, this.outline)) continue;
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

  // 用山脉骨架烙出高程，再作斜光晕渲——沙盘的起伏由此而来
  buildRelief() {
    const b = this.bbox;
    const w = GRID;
    const h = Math.round((GRID * b.h) / b.w);
    const height = new Float32Array(w * h);
    const sx = w / b.w;
    const sy = h / b.h;

    const stamp = (pt, amp) => {
      const gx = Math.round((pt.x - b.x0) * sx);
      const gy = Math.round((pt.y - b.y0) * sy);
      if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
      height[gy * w + gx] += amp;
    };
    const amps = { 阴山: 1.1, 燕山: 1.0, 太行: 1.4, 秦岭: 1.7, 崤函: 1.1, 大别: 0.9, 巫山: 1.4, 泰岱: 0.9, 武夷: 1.0, 岷山: 1.9 };
    for (const m of this.mountains) {
      const dense = resample(m.pts, Math.max(30, m.pts.length * 3));
      for (const p of dense) stamp(p, amps[m.name] ?? 1);
    }
    // 西境高原：自西向东递降，使关中、河洛坐落于阶梯之上
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const t = 1 - gx / w;
        height[gy * w + gx] += 0.34 * t * t;
      }
    }
    let seed = 20250809;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 1400; i++) {
      height[Math.floor(rnd() * h) * w + Math.floor(rnd() * w)] += 0.22;
    }

    blur(height, w, h, 2);
    blur(height, w, h, 5);
    blur(height, w, h, 9);

    let peak = 0;
    for (const v of height) if (v > peak) peak = v;

    const img = new ImageData(w, h);
    const land = hex(PALETTE.land);
    const dark = hex(PALETTE.shadow);
    const lit = hex(PALETTE.light);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const i = gy * w + gx;
        const o = i * 4;
        const px = b.x0 + (gx + 0.5) / sx;
        const py = b.y0 + (gy + 0.5) / sy;
        if (!pointInPolygon(px, py, this.outline)) { img.data[o + 3] = 0; continue; }
        const hl = height[clampIdx(gx - 1, w) + gy * w];
        const hr = height[clampIdx(gx + 1, w) + gy * w];
        const hu = height[gx + clampRow(gy - 1, h) * w];
        const hd = height[gx + clampRow(gy + 1, h) * w];
        const nx = ((hl - hr) / peak) * 46;
        const ny = ((hu - hd) / peak) * 46;
        let s = (nx * 0.6 + ny * 0.6 + 1) / 2;
        s = Math.max(0, Math.min(1, s));
        const elev = Math.min(1, (height[i] / peak) * 1.3);
        const base = [
          land[0] + (lit[0] - land[0]) * elev * 0.62,
          land[1] + (lit[1] - land[1]) * elev * 0.62,
          land[2] + (lit[2] - land[2]) * elev * 0.62,
        ];
        const k = Math.max(-1, Math.min(1, (s - 0.5) * 2.3));
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
    const pad = 22;
    const s = Math.min((this.css.w - pad * 2) / this.bbox.w, (this.css.h - pad * 2) / this.bbox.h);
    this.base = s;
    this.view.scale = 1;
    this.view.x = (this.css.w - this.bbox.w * s) / 2 - this.bbox.x0 * s;
    this.view.y = (this.css.h - this.bbox.h * s) / 2 - this.bbox.y0 * s;
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
    this.prevOwner = animate && moved.length ? this.owner : next;
    this.owner = next;
    this.morph = animate && moved.length ? 0 : 1;
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

  play(battle) {
    const n = battle.marchers.length;
    this.playback = {
      battle, t: 0, step: 0, start: performance.now(),
      per: 1250, tail: 1900, total: n * 1250 + 1900,
    };
    const pts = [battle.at, ...battle.marchers.flatMap((m) => m.pts)];
    this.flyTo(boundsOf(pts));
  }

  stop() { this.playback = null; }

  // 推演毕，镜头退回全景，否则接下来的年份都困在战场里
  flyHome() {
    if (!this.css) return;
    const s = this.base;
    this.cam = {
      from: { ...this.view },
      to: {
        scale: 1,
        x: (this.css.w - this.bbox.w * s) / 2 - this.bbox.x0 * s,
        y: (this.css.h - this.bbox.h * s) / 2 - this.bbox.y0 * s,
      },
      start: performance.now(),
      dur: 750,
    };
  }

  // 推演时把镜头压到战场上，否则行军只是几根短线
  flyTo(box, now = performance.now()) {
    const w = Math.max(box.x1 - box.x0, 1);
    const h = Math.max(box.y1 - box.y0, 1);
    const want = Math.min((this.css.w * 0.5) / w, (this.css.h * 0.54) / h) / this.base;
    const scale = Math.max(1.1, Math.min(5, want));
    const s = this.base * scale;
    this.cam = {
      from: { ...this.view },
      to: {
        scale,
        x: this.css.w / 2 - ((box.x0 + box.x1) / 2) * s,
        y: this.css.h * 0.43 - ((box.y0 + box.y1) / 2) * s,
      },
      start: now,
      dur: 700,
    };
  }

  draw(now) {
    const ctx = this.ctx;
    if (!this.css) return;
    if (this.morph < 1) this.morph = Math.min(1, this.morph + 0.05);
    if (this.cam) {
      const k = ease(Math.min(1, (now - this.cam.start) / this.cam.dur));
      const { from, to } = this.cam;
      this.view.scale = from.scale + (to.scale - from.scale) * k;
      this.view.x = from.x + (to.x - from.x) * k;
      this.view.y = from.y + (to.y - from.y) * k;
      if (k >= 1) this.cam = null;
    }
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.css.w, this.css.h);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, this.css.w, this.css.h);

    this.drawSea(ctx);

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

    this.drawTerritory(ctx);

    if (this.layers.relief) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.62;
      ctx.drawImage(this.relief, org.x, org.y, this.bbox.w * s, this.bbox.h * s);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawRidges(ctx);
    if (this.layers.rivers) this.drawRivers(ctx);
    this.drawBorders(ctx);
    this.drawFlash(ctx, now);
    if (this.layers.walls) this.drawWalls(ctx);
    this.drawHover(ctx);
    ctx.restore();

    this.drawRim(ctx);
    this.drawCoast(ctx);
    if (this.layers.passes) this.drawPasses(ctx);
    this.drawCapitals(ctx);
    if (this.layers.labels) this.drawNames(ctx);
    if (this.layers.battles) this.drawBattles(ctx, now);
    if (this.playback) this.drawPlayback(ctx, now);

    this.drawPlate(ctx);
    this.drawCompass(ctx);
    this.drawScale(ctx);
    if (!this.playback && this.css.w > 560) this.drawLegend(ctx);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(this.grain, 'repeat');
    ctx.fillRect(0, 0, this.css.w, this.css.h);
    ctx.globalAlpha = 1;
    ctx.restore();
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
    this.path(ctx, this.seaPoly);
    ctx.fillStyle = PALETTE.sea;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = PALETTE.seaLine;
    ctx.lineWidth = 1;
    const step = Math.max(10, 13 * this.view.scale);
    for (let y = -this.css.h; y < this.css.h * 2; y += step) {
      ctx.beginPath();
      ctx.moveTo(-40, y);
      ctx.lineTo(this.css.w + 40, y + this.css.w * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  fillFor(i) {
    const id = REGIONS[i].id;
    const now = STATES[this.owner[id]];
    const was = STATES[this.prevOwner[id]] || now;
    if (this.morph >= 1 || now === was) return now.color;
    return mix(was.color, now.color, ease(this.morph));
  }

  drawTerritory(ctx) {
    for (let i = 0; i < this.cells.length; i++) {
      if (!this.cells[i].length || !this.landArea[i]) continue;
      const st = STATES[this.owner[REGIONS[i].id]];
      this.path(ctx, this.cells[i]);
      // 化外之地压暗后退，列国之土才浮得起来
      ctx.fillStyle = st.tribe ? mix(this.fillFor(i), '#0a0d0b', 0.62) : this.fillFor(i);
      ctx.globalAlpha = st.tribe ? 0.78 : 0.62;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (st.tribe) {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(232,226,210,0.075)';
        ctx.lineWidth = 1;
        const bb = boundsOf(this.cells[i].map((p) => this.toScreen(p)));
        for (let x = bb.x0 - bb.h; x < bb.x1 + bb.h; x += 8) {
          ctx.beginPath();
          ctx.moveTo(x, bb.y0);
          ctx.lineTo(x + bb.h, bb.y1);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgba(9,12,10,0.32)';
    ctx.lineWidth = 0.6;
    for (const cell of this.cells) {
      if (!cell.length) continue;
      this.path(ctx, cell);
      ctx.stroke();
    }
  }

  drawBorders(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (!cell.length) continue;
      const mine = this.owner[REGIONS[i].id];
      for (let j = 0; j < cell.length; j++) {
        const nb = this.adjacency[i][j];
        if (nb < 0 || nb < i) continue;
        if (this.owner[REGIONS[nb].id] === mine) continue;
        const a = this.toScreen(cell[j]);
        const b = this.toScreen(cell[(j + 1) % cell.length]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(6,8,7,0.65)';
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.strokeStyle = (STATES[mine].ink || '#96a096') + 'cc';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }
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

  drawRidges(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const m of this.mountains) {
      const pts = m.pts.map((p) => this.toScreen(p));
      for (let i = 1; i < pts.length; i += 2) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 2) continue;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const size = 3.4 + 2.6 * Math.min(2, this.view.scale);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + nx * size, a.y + ny * size);
        ctx.strokeStyle = 'rgba(232,226,205,0.20)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - nx * size * 0.85, a.y - ny * size * 0.85);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }
    ctx.restore();
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
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(STATES[st].name, p.x, p.y);
      ctx.fillStyle = 'rgba(242,238,228,0.92)';
      ctx.fillText(STATES[st].name, p.x, p.y);
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
      if (sel || active) {
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
    const cell = this.cells[this.hover];
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

    ctx.strokeStyle = 'rgba(201,162,39,0.16)';
    for (let x = m; x < w - m; x += 40) {
      const major = Math.round((x - m) / 40) % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, m + 1);
      ctx.lineTo(x + 0.5, m + (major ? 8 : 4));
      ctx.moveTo(x + 0.5, h - m - 1);
      ctx.lineTo(x + 0.5, h - m - (major ? 8 : 4));
      ctx.stroke();
    }
    for (let y = m; y < h - m; y += 40) {
      const major = Math.round((y - m) / 40) % 5 === 0;
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
    const x = 22;
    const y = this.css.h - 44;
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
    ctx.fillStyle = 'rgba(8,11,12,0.74)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(201,162,39,0.24)';
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
