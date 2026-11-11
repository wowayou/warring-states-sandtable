import { REGIONS } from './atlas.js';
import { CAPITALS, STATES, START, END, ownerAt } from './history.js';

// Geography comes from the existing atlas. A cue changes at an actual sentence
// boundary; it never advances the historical year or invents territorial change.
const WIDE_SHOT = { key: 'overview', label: '中原形势', lon: 113.1, lat: 35.5, wide: true };
const GEOGRAPHIC_AREAS = [
  { key: 'zhongyuan', label: '中原', lon: 113.8, lat: 35.2, wide: true },
  { key: 'sanjin', label: '三晋', lon: 112.8, lat: 36.8, wide: true },
  { key: 'bashu', label: '巴蜀', lon: 105.2, lat: 30.6, wide: true },
  { key: 'shandong', label: '山东诸国', lon: 115.8, lat: 35.5, wide: true },
  { key: 'jiangnan', label: '江南', lon: 116.8, lat: 30.0, wide: true },
];

function nearestRegion(lon, lat) {
  let nearest = REGIONS[0], distance = Infinity;
  for (const r of REGIONS) {
    const d = (r.lon - lon) ** 2 + (r.lat - lat) ** 2;
    if (d < distance) { distance = d; nearest = r; }
  }
  return nearest.id;
}

export function geographyIn(text, year) {
  const candidates = [
    ...GEOGRAPHIC_AREAS,
    ...REGIONS.flatMap((r) => r.name.split('·').filter((name) => name.length > 1)
      .map((label) => ({ key: r.id, label, lon: r.lon, lat: r.lat, regions: [r.id] }))),
    ...CAPITALS.filter((c) => c.name.length > 1).map((c) => ({
      key: `capital-${c.name}`, label: c.name, lon: c.lon, lat: c.lat,
      regions: [nearestRegion(c.lon, c.lat)],
    })),
  ];
  const matches = [];
  for (const place of candidates) {
    const at = text.indexOf(place.label);
    if (at >= 0) matches.push({ ...place, at });
  }
  // Prefer the longest spelling at a given location; avoid duplicate city /
  // region entries such as 临淄 and the state 齐 inside a person's name.
  matches.sort((a, b) => a.at - b.at || b.label.length - a.label.length);
  const selected = [];
  for (const m of matches) {
    if (selected.some((p) => p.at <= m.at && p.at + p.label.length > m.at)) continue;
    if (!selected.some((p) => p.key === m.key)) selected.push(m);
  }
  const owner = ownerAt(Math.max(START, Math.min(END, year)));
  for (const [id, state] of Object.entries(STATES)) {
    if (state.tribe) continue;
    let at = text.indexOf(state.name);
    if (at < 0) continue;
    if (selected.some((p) => p.at <= at && p.at + p.label.length > at)) continue;
    if (state.name === '楚' && text.slice(at - 1, at + 1) === '子楚') continue;
    if (state.name === '韩' && text.slice(at, at + 2) === '韩非') continue;
    const regions = REGIONS.filter((r) => owner[r.id] === id);
    if (!regions.length) continue;
    const capital = CAPITALS.find((c) => c.state === id && c.from <= year && year < c.to);
    const anchor = capital || regions.reduce((best, r) => r.weight > best.weight ? r : best);
    selected.push({ key: id, label: state.name, lon: anchor.lon, lat: anchor.lat,
      regions: regions.map((r) => r.id), state: id, at });
  }
  return selected.sort((a, b) => a.at - b.at).slice(0, 3);
}

export function makeStoryboard(scene, recording) {
  if (!scene || scene.kind === 'battle' || scene.kind === 'travel' || !recording) return [];
  const fallback = scene.at
    ? [{ key: scene.id, label: scene.title, lon: scene.at[0], lat: scene.at[1],
      regions: [nearestRegion(...scene.at)] }]
    : geographyIn(scene.title, scene.year);
  let previous = fallback.length ? fallback : [WIDE_SHOT];
  return recording.sentences.map((sentence, i, all) => {
    const places = geographyIn(sentence.text, scene.year);
    const targets = places.length ? places : previous;
    const cue = { start: sentence.start, end: all[i + 1]?.start ?? recording.duration,
      text: sentence.text, targets, from: i ? previous : [WIDE_SHOT], index: i };
    previous = targets;
    return cue;
  });
}

export function storyboardAt(cues, time) {
  if (!cues.length) return null;
  const cue = [...cues].reverse().find((c) => time >= c.start) || cues[0];
  const duration = Math.max(.01, cue.end - cue.start);
  return { ...cue, elapsed: Math.max(0, Math.min(duration, time - cue.start)), duration };
}
