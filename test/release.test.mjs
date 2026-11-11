import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSampleMetadata, verifyVoiceOptions } from '../tools/verify-voice-options.mjs';
import { readPronunciationNotes } from '../tools/build-sharing-pages.mjs';
import { validateDistributionFiles, scanDistribution, MAX_DIST_BYTES } from '../tools/verify-dist.mjs';

function samples() {
  const text = '春秋的霸主秩序散了。';
  return {
    format: 'warring-states-voice-samples-v1', scope: 'audition-only', text,
    model: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', modelRevision: '0c0e3051f131929182e2c023b9537f8b1c68adfe',
    clips: ['vivian', 'aiden', 'ryan'].map((id) => ({
      id, speaker: id, label: id, text, duration: 4, sha256: 'a'.repeat(64),
      file: `assets/voice-options/${id}-${'a'.repeat(12)}.mp3`, subjectiveStyleAccepted: false,
      readingReview: { method: 'two-asr-tone-reading-comparison-v2-orthography', sha256: 'a'.repeat(64),
        expectedTonePinyin: ['jin4', 'qi2', 'qing1'], initialTonePinyin: ['jin4', 'qi2', 'qing1'],
        independentTonePinyin: ['jin4', 'qi2', 'qing1'], toneReadingMatch: true,
        humanListeningPerformed: false, notAcousticToneProof: true },
      check: { sha256: 'a'.repeat(64), decodedSeconds: 4, peak: .5, tailSilenceSeconds: .1,
        phoneticSimilarity: 1, asr: text, needsContentReview: false },
    })),
  };
}

test('voice options are distinct, screened samples rather than claimed full voices', () => {
  assert.equal(validateSampleMetadata(samples()).clips.length, 3);
  for (const mutate of [
    (x) => { x.scope = 'full-narration'; },
    (x) => { x.clips[0].subjectiveStyleAccepted = true; },
    (x) => { x.clips[1] = x.clips[0]; },
    (x) => { x.clips[0].text += '不同文稿'; },
    (x) => { x.modelRevision = 'latest'; },
  ]) {
    const input = samples(); mutate(input);
    assert.throws(() => validateSampleMetadata(input));
  }
});

test('unsafe sample paths and stale screening hashes are refused', () => {
  const path = samples(); path.clips[0].file = '../work/reference/selected.wav';
  assert.throws(() => validateSampleMetadata(path), /unsafe/);
  const hash = samples(); hash.clips[0].check.sha256 = 'b'.repeat(64);
  assert.throws(() => validateSampleMetadata(hash), /screening/);
});

test('pending tone disagreements can only enter an explicitly labelled local review', () => {
  const input = samples();
  input.clips[0].check.needsContentReview = true;
  input.clips[0].readingReview.initialTonePinyin[2] = 'qing3';
  input.clips[0].readingReview.toneReadingMatch = false;
  assert.throws(() => validateSampleMetadata(input), /screening/);
  assert.throws(() => validateSampleMetadata(input, { localReview: true }), /screening/);
  input.clips[0].pendingReviewReason = '卿和请的声调仍有识别分歧，待人工听审。';
  assert.equal(validateSampleMetadata(input, { localReview: true }).clips.length, 3);
  input.clips[0].check.needsContentReview = false;
  assert.throws(() => validateSampleMetadata(input), /reading review/);
});

test('audio duration, silence and content failures cannot become published samples', () => {
  for (const mutate of [
    (x) => { x.clips[0].duration = 21; },
    (x) => { x.clips[0].check.decodedSeconds = 6; },
    (x) => { x.clips[0].check.peak = Infinity; },
    (x) => { x.clips[0].check.tailSilenceSeconds = 1.1; },
    (x) => { x.clips[0].check.phoneticSimilarity = .89; },
    (x) => { x.clips[0].check.needsContentReview = true; },
  ]) {
    const input = samples(); mutate(input);
    assert.throws(() => validateSampleMetadata(input), /screening/);
  }
});

test('distribution requires exactly the public allowlist and a size bound', () => {
  const allowed = new Set(['index.html', 'assets/voice/current.mp3']);
  const files = [{ path: 'index.html', bytes: 10 }, { path: 'assets/voice/current.mp3', bytes: 20 }];
  assert.equal(validateDistributionFiles(files, allowed), 30);
  assert.throws(() => validateDistributionFiles(files.slice(1), allowed), /allowlist/);
  assert.throws(() => validateDistributionFiles([...files, { path: 'work/secret.json', bytes: 1 }], allowed), /allowlist/);
  assert.throws(() => validateDistributionFiles([...files, files[0]], allowed), /allowlist/);
  assert.throws(() => validateDistributionFiles([{ ...files[0], bytes: 0 }, files[1]], allowed), /Empty/);
  assert.throws(() => validateDistributionFiles([{ ...files[0], bytes: MAX_DIST_BYTES }, files[1]], allowed), /25 MiB/);
});

test('public distribution scanner rejects symlinks instead of following local work', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'sandtable-release-test-'));
  try {
    await writeFile(join(folder, 'index.html'), 'example');
    await symlink(join(folder, 'index.html'), join(folder, 'reference.wav'));
    await assert.rejects(scanDistribution(pathToFileURL(folder + '/')), /symlinks/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('the current eight public pronunciation notes match the actual narration', async () => {
  assert.equal((await readPronunciationNotes()).length, 8);
});

test('all shipped alternative audio matches its screened checksum', async () => {
  const manifest = await verifyVoiceOptions();
  assert.ok(manifest.clips.length >= 3 && manifest.clips.length <= 5);
  assert.equal(manifest.scope, 'audition-only');
});
