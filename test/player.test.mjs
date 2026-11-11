import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackController } from '../src/player.js';
import { SCENES, TOUR, tourFrom, captionAt } from '../src/narration.js';
import { BATTLES, EVENTS, START, END } from '../src/history.js';

class FakeAudio extends EventTarget {
  currentTime = 0; readyState = 0; paused = true; seeking = false; src = '';
  load() {}
  play() { this.paused = false; return this.promise || Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ''; this.readyState = 0; this.currentTime = 0; }
  getAttribute() { return this.src; }
  fire(name) { this.dispatchEvent(new Event(name)); }
  ready() { this.readyState = 4; this.fire('loadedmetadata'); this.fire('playing'); }
}

function fixture(options = {}) {
  let now = 0;
  const audio = new FakeAudio();
  let created = 0;
  const scenes = [{ id: 'a', parts: [{ id: 'a1', text: '甲' }, { id: 'a2', text: '乙' }] },
    { id: 'b', parts: [{ id: 'b1', text: '丙' }] }];
  const recordings = Object.fromEntries(scenes.flatMap((s) => s.parts).map((p) => [p.id,
    { text: p.text, file: `${p.id}.mp3`, duration: 10, sentences: [{ text: p.text, start: 0, end: 10 }] }]));
  const player = new PlaybackController({ scenes, recordings, audioFactory: () => created++ ? new FakeAudio() : audio,
    now: () => now, ...options });
  return { player, audio, advanceClock: (ms) => { now += ms; } };
}

test('audio clock freezes with pause and buffering; resume keeps offset', (t) => {
  const { player: p, audio: a } = fixture(); t.after(() => p.destroy());
  p.load(['a', 'b']); a.ready(); a.currentTime = 3.25;
  assert.equal(p.position, 3.25);
  p.pause(); a.currentTime = 7;
  assert.equal(p.position, 3.25);
  p.resume(); assert.equal(a.currentTime, 3.25); a.fire('playing');
  a.currentTime = 4; a.fire('waiting'); a.currentTime = 5;
  assert.equal(p.position, 4); assert.equal(p.state, 'buffering');
  a.fire('playing'); assert.equal(p.position, 5);
});

test('silent playback uses the same duration, supports speed, seek, and end', (t) => {
  const { player: p, advanceClock } = fixture(); t.after(() => p.destroy());
  p.setVoice(false); p.load(['a', 'b']); advanceClock(3000);
  p.setRate(2); advanceClock(2000); assert.equal(p.position, 7);
  p.pause(); advanceClock(5000); assert.equal(p.position, 7);
  p.seek(2); p.resume(); advanceClock(4000); p.tick();
  assert.equal(p.part.id, 'a2');
  advanceClock(5000); p.tick(); assert.equal(p.part.id, 'b1');
  advanceClock(5000); p.tick(); assert.equal(p.state, 'ended');
  assert.equal(p.position, 10);
});

test('switch to silent after an error preserves the frozen position', (t) => {
  const { player: p, audio: a, advanceClock } = fixture(); t.after(() => p.destroy());
  p.load(['a']); a.ready(); a.currentTime = 4.5; a.fire('error');
  assert.equal(p.state, 'error'); assert.equal(p.offset, 4.5);
  p.setVoice(false); advanceClock(1000); assert.equal(p.position, 5.5);
  p.setVoice(true); a.ready(); assert.equal(a.currentTime, 5.5);
});

test('late play rejection cannot fail a different clip or newer resume', async (t) => {
  const { player: p, audio: a } = fixture(); t.after(() => p.destroy());
  let rejectOld;
  a.promise = new Promise((_, reject) => { rejectOld = reject; });
  p.load(['a']);
  a.promise = Promise.resolve(); p.selectPart(1); a.ready();
  rejectOld(new Error('stale')); await Promise.resolve();
  assert.equal(p.state, 'playing'); assert.equal(p.part.id, 'a2');
  let rejectPause;
  p.pause(); a.promise = new Promise((_, reject) => { rejectPause = reject; }); p.resume();
  p.pause(); a.promise = Promise.resolve(); p.resume(); a.fire('playing');
  rejectPause(new Error('old resume')); await Promise.resolve();
  assert.equal(p.state, 'playing');
});

test('buffer timeout stops, never silently advances or changes voice', async (t) => {
  const { player: p } = fixture({ bufferTimeout: 15 }); t.after(() => p.destroy());
  p.load(['a']);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(p.state, 'error'); assert.equal(p.part.id, 'a1'); assert.equal(p.voice, true);
  assert.equal(p.audio.getAttribute('src'), '', 'timed-out requests are cancelled');
});

test('snapshot restores the exact queue, step and time after isolated listening', (t) => {
  const { player: p, audio: a } = fixture(); t.after(() => p.destroy());
  p.load(['a', 'b']); p.selectPart(1); a.ready(); a.currentTime = 6;
  const saved = p.snapshot();
  p.load(['b'], { mode: 'single' }); a.ready();
  p.restore(saved); a.ready();
  assert.equal(p.part.id, 'a2'); assert.equal(p.position, 6); assert.equal(p.mode, 'tour');
  assert.deepEqual(p.queue, ['a', 'b']);
});

test('missing or stale recording fails explicitly, including in silent mode', (t) => {
  const { player: p } = fixture(); t.after(() => p.destroy());
  p.recordings.a1.text = '旧稿'; p.setVoice(false); p.load(['a']);
  assert.equal(p.state, 'error'); assert.equal(p.position, 0);
});

test('resume at the end of a paused part advances instead of silently replaying it', (t) => {
  const ended = [];
  const { player: p } = fixture({ onSceneEnd: (s) => ended.push(s.id) }); t.after(() => p.destroy());
  p.setVoice(false); p.load(['a', 'b'], { autoplay: false });
  p.seek(10); p.resume(); assert.equal(p.part.id, 'a2');
  p.pause(); p.seek(10); p.resume(); assert.equal(p.part.id, 'b1');
  assert.deepEqual(ended, ['a']);
});

test('voice changes during exploration do not restart an interrupted error', (t) => {
  const { player: p, audio: a } = fixture(); t.after(() => p.destroy());
  p.load(['a']); a.fire('error');
  p.setVoice(false, { autoplay: false });
  assert.equal(p.state, 'paused'); assert.equal(p.position, 0);
});

test('all historical events and battle steps are represented, including boundary years', () => {
  const spoken = SCENES.filter((s) => s.kind !== 'travel');
  assert.equal(spoken.length, 107);
  assert.equal(spoken.flatMap((s) => s.parts).length, 204);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, SCENES.length);
  for (const e of EVENTS) assert.ok(SCENES.some((s) => s.event === e));
  for (const b of BATTLES) assert.equal(b.steps.length, b.arrows.length + 1, b.id);
  assert.ok(!TOUR.some((s) => s.year < START));
  assert.equal(tourFrom(START).filter((id) => SCENES.find((s) => s.id === id).year === START).length, 3);
  assert.equal(tourFrom(END).length, 3);
  assert.deepEqual(EVENTS.filter((e) => e.year === END).map((e) => e.title), ['灭齐·不战而下', '海内为郡县', '铸十二金人']);
  for (let y = START; y <= END; y++) assert.ok(TOUR.some((s) => s.year === y), `missing ${y}`);
});

test('caption selection uses sentence cues, including gaps and backward seeks', () => {
  const r = { sentences: [{ text: '甲', start: 0, end: 2 }, { text: '乙', start: 2.2, end: 4 }] };
  assert.equal(captionAt(r, 3), '乙'); assert.equal(captionAt(r, 2.1), '甲');
  assert.equal(captionAt(r, .1), '甲');
});
