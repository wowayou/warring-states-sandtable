import test from 'node:test';
import assert from 'node:assert/strict';
import { geographyIn, makeStoryboard, storyboardAt } from '../src/storyboard.js';
import { SCENES } from '../src/narration.js';
import { NARRATION } from '../src/narration-data.js';

test('ordinary narration and chapter openings have timed visual cues', () => {
  for (const s of SCENES.filter((s) => ['act', 'event'].includes(s.kind))) {
    const recording = NARRATION[s.parts[0].id];
    const cues = makeStoryboard(s, recording);
    assert.equal(cues.length, recording.sentences.length, s.id);
    for (const cue of cues) {
      assert.ok(cue.end > cue.start);
      assert.ok(cue.targets.length > 0 && cue.targets.length <= 3);
      assert.ok(cue.targets.every((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat)));
    }
  }
});

test('opening follows Jin, Qi, Wu and Yue instead of keeping an unchanged overview', () => {
  const scene = SCENES.find((s) => s.id === 'act-I');
  const cues = makeStoryboard(scene, NARRATION['act-I']);
  const keys = new Set(cues.flatMap((c) => c.targets.map((p) => p.key)));
  assert.ok(keys.has('jin')); assert.ok(keys.has('qi')); assert.ok(keys.has('yue')); assert.ok(keys.has('wuguo'));
});

test('location mentions use real atlas positions and do not confuse Han Fei with Han', () => {
  assert.deepEqual(geographyIn('韩非入秦', -233).map((p) => p.label), ['秦']);
  const p = geographyIn('魏徙都大梁', -361);
  assert.ok(p.some((p) => p.label === '大梁' && Math.abs(p.lon - 114.35) < .1));
});

test('backward seeks deterministically restore the correct sentence and camera cue', () => {
  const scene = SCENES.find((s) => s.id === 'act-I');
  const cues = makeStoryboard(scene, NARRATION['act-I']);
  const before = storyboardAt(cues, .8);
  const later = storyboardAt(cues, cues.at(-1).start + .3);
  assert.notDeepEqual(before.targets, later.targets);
  assert.deepEqual(storyboardAt(cues, .8), before);
  assert.equal(storyboardAt(cues, cues[1].start).index, 1);
});
