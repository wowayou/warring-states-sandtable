import { ACTS, EVENTS, BATTLES, CHANGES, START, END, dateOf } from './history.js';

// Stable content IDs identify recordings; display text always comes from history.
export const SCENES = [
  ...Array.from({ length: END - START + 1 }, (_, i) => START + i)
    .filter((year) => !EVENTS.some((e) => e.year === year) && !ACTS.some((a) => a.from === year))
    .map((year) => {
      const change = CHANGES.find((c) => c.year === year);
      return { id: `year-${-year}`, year, kind: 'travel', title: change?.note || '',
        parts: [{ id: `year-${-year}`, silent: true, duration: change ? 1.25 : .11, text: change?.note || '' }] };
    }),
  ...ACTS.map((a) => ({
    id: `act-${a.roman}`, kind: 'act', year: a.from, title: a.title, act: a,
    parts: [{ id: `act-${a.roman}`, text: `第${a.no}幕，${a.title}。${a.thesis}` }],
  })),
  ...EVENTS.map((e) => {
    if (!e.battle) return {
      id: e.id, kind: 'event', year: e.year, title: e.title, at: e.at, event: e,
      parts: [{ id: e.id, text: `${dateOf(e)}，${e.title}。${e.text}` }],
    };
    const b = BATTLES.find((x) => x.id === e.battle);
    return {
      id: `battle-${b.id}`, kind: 'battle', year: b.year, title: b.name, at: b.at, event: e, battle: b,
      parts: [
        { id: `battle-${b.id}-intro`, text: `${dateOf(b)}，${b.name}。`, step: -1 },
        ...b.steps.map((text, i) => ({ id: `battle-${b.id}-step-${i + 1}`, text, step: i })),
      ],
    };
  }),
].sort((a, b) => a.year - b.year || Number(b.kind === 'act') - Number(a.kind === 'act'));

export const TOUR = SCENES.filter((s) => s.year >= START && s.year <= END);

export function tourFrom(year) {
  return TOUR.filter((s) => s.year >= year).map((s) => s.id);
}

export function captionAt(recording, time) {
  const lines = recording?.sentences || [];
  return lines.find((s) => time >= s.start && time < s.end)?.text
    || [...lines].reverse().find((s) => time >= s.start)?.text || lines[0]?.text;
}
