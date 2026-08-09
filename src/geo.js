// 投影与几何：把经纬度压成沙盘平面坐标，并用半平面裁剪求 Voronoi 分区。

export const PROJ = { lon0: 113, lat0: 33, k: 100, cos: Math.cos((33 * Math.PI) / 180) };

export function project([lon, lat]) {
  return {
    x: (lon - PROJ.lon0) * PROJ.cos * PROJ.k,
    y: -(lat - PROJ.lat0) * PROJ.k,
  };
}

export function projectAll(pts) {
  return pts.map(project);
}

export function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// 以 seed 为内侧，用 seed / other 的中垂线裁剪多边形（Sutherland–Hodgman）。
function clipBisector(poly, seed, other) {
  const dx = seed.x - other.x;
  const dy = seed.y - other.y;
  const c = (other.x * other.x + other.y * other.y - seed.x * seed.x - seed.y * seed.y) / 2;
  const f = (p) => p.x * dx + p.y * dy + c; // > 0 表示离 seed 更近
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export function voronoi(seeds, boundary) {
  return seeds.map((seed) => {
    let poly = boundary;
    for (const other of seeds) {
      if (other === seed) continue;
      poly = clipBisector(poly, seed, other);
      if (poly.length < 3) return [];
    }
    return dedupe(poly);
  });
}

function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-7) out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-7) out.pop();
  }
  return out;
}

// 每条边找出邻接单元；找不到的即海岸／图幅边界。
export function buildAdjacency(cells, seeds) {
  return cells.map((poly, i) => {
    const seed = seeds[i];
    return poly.map((a, j) => {
      const b = poly[(j + 1) % poly.length];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dSelf = Math.hypot(mx - seed.x, my - seed.y);
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < seeds.length; k++) {
        if (k === i) continue;
        const d = Math.hypot(mx - seeds[k].x, my - seeds[k].y);
        if (d < bestD) { bestD = d; best = k; }
      }
      return Math.abs(bestD - dSelf) < dSelf * 1e-6 ? best : -1;
    });
  });
}



export function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// 沿折线按比例取点，用于行军箭头的逐段推进。
export function resample(path, n) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    segs.push(d);
    total += d;
  }
  const out = [];
  for (let s = 0; s <= n; s++) {
    let want = (total * s) / n;
    let i = 0;
    while (i < segs.length && want > segs[i]) { want -= segs[i]; i++; }
    if (i >= segs.length) { out.push(path[path.length - 1]); continue; }
    const t = segs[i] === 0 ? 0 : want / segs[i];
    out.push({
      x: path[i].x + (path[i + 1].x - path[i].x) * t,
      y: path[i].y + (path[i + 1].y - path[i].y) * t,
    });
  }
  return out;
}

// 卡特姆–罗姆样条，山川与行军路线用它去掉折角。
export function smooth(points, tension = 0.5, steps = 12) {
  if (points.length < 3) return points.slice();
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t * 2 * tension +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t * 2 * tension +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// —— 让计算出来的边界像画出来的 ——
// 直接用 Voronoi 的直边，一眼就是算法。沿边加分形扰动即可读作疆界；
// 扰动量只取决于点的位置与边的规范朝向，故相邻两格共用的那条边不会裂开。

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 逐行求交填充，比逐点做内外判定快两个数量级
export function scanlineMask(poly, w, h, b) {
  const mask = new Uint8Array(w * h);
  const sx = w / b.w;
  const sy = h / b.h;
  const xs = [];
  for (let gy = 0; gy < h; gy++) {
    const py = b.y0 + (gy + 0.5) / sy;
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const c = poly[j];
      if ((a.y > py) !== (c.y > py)) xs.push(a.x + ((py - a.y) * (c.x - a.x)) / (c.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - b.x0) * sx - 0.5));
      const to = Math.min(w - 1, Math.floor((xs[k + 1] - b.x0) * sx - 0.5));
      for (let gx = from; gx <= to; gx++) mask[gy * w + gx] = 1;
    }
  }
  return mask;
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x, y) {
  let sum = 0;
  let amp = 1;
  let f = 1;
  for (let i = 0; i < 3; i++) {
    sum += valueNoise(x * f, y * f) * amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / 1.75;
}

// 规范朝向：两端点按 (x,y) 排序，使同一条边无论从哪一格看过去都得到同一串点
export function warpEdge(a, b, { scale = 0.012, amp = 0.14, max = 18, steps = 6 } = {}) {
  const flip = a.x > b.x || (a.x === b.x && a.y > b.y);
  const p = flip ? b : a;
  const q = flip ? a : b;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const w = Math.min(len * amp, max);
  const out = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = p.x + dx * t;
    const y = p.y + dy * t;
    const d = fbm(x * scale, y * scale) * w * Math.sin(Math.PI * t);
    out.push({ x: x + nx * d, y: y + ny * d });
  }
  return flip ? out.reverse() : out;
}

// 把一条闭合或开放折线整体加扰，返回加密后的点串与各原始边所占的区段
export function warpRing(pts, closed = true, opts) {
  const ring = [];
  const spans = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const start = ring.length;
    ring.push(a, ...warpEdge(a, b, opts));
    spans.push({ start, count: ring.length - start + 1 });
  }
  if (!closed) ring.push(pts[pts.length - 1]);
  return { ring, spans };
}
