import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const revision = '0c0e3051f131929182e2c023b9537f8b1c68adfe';

export function validateSampleMetadata(manifest, { localReview = false } = {}) {
  if (manifest.format !== 'warring-states-voice-samples-v1' || manifest.scope !== 'audition-only')
    throw new Error('Voice options must be explicitly labelled as samples, not full narration');
  if (manifest.model !== 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice' || manifest.modelRevision !== revision)
    throw new Error('Unexpected sample model or revision');
  if (!manifest.text || !Array.isArray(manifest.clips) || manifest.clips.length < 3 || manifest.clips.length > 5)
    throw new Error('Expected three to five alternative voice samples');
  const ids = new Set();
  for (const clip of manifest.clips) {
    if (!/^[a-z]+$/.test(clip.id) || ids.has(clip.id)) throw new Error('Duplicate or invalid sample ID');
    ids.add(clip.id);
    if (!clip.speaker || !clip.label || clip.text !== manifest.text) throw new Error(`${clip.id}: sample text or label differs`);
    if (!/^[a-f0-9]{64}$/.test(clip.sha256)
        || clip.file !== `assets/voice-options/${clip.id}-${clip.sha256.slice(0, 12)}.mp3`)
      throw new Error(`${clip.id}: unsafe sample path or checksum`);
    const check = clip.check;
    if (!Number.isFinite(clip.duration) || clip.duration <= 1 || clip.duration > 20
        || !check || check.sha256 !== clip.sha256 || typeof check.needsContentReview !== 'boolean'
        || (check.needsContentReview && (!localReview || !clip.pendingReviewReason))
        || !Number.isFinite(check.decodedSeconds) || Math.abs(check.decodedSeconds - clip.duration) > .06
        || !Number.isFinite(check.peak) || check.peak < .001 || check.peak > 1
        || !Number.isFinite(check.tailSilenceSeconds) || check.tailSilenceSeconds < 0 || check.tailSilenceSeconds > 1
        || !Number.isFinite(check.phoneticSimilarity) || check.phoneticSimilarity < .9 || check.phoneticSimilarity > 1
        || !check.asr)
      throw new Error(`${clip.id}: missing, stale or failed audio/content screening`);
    const reading = clip.readingReview;
    const tonesMatch = reading && Array.isArray(reading.expectedTonePinyin) && reading.expectedTonePinyin.length > 0
      && JSON.stringify(reading.expectedTonePinyin) === JSON.stringify(reading.initialTonePinyin)
      && JSON.stringify(reading.expectedTonePinyin) === JSON.stringify(reading.independentTonePinyin);
    if (!reading || reading.method !== 'two-asr-tone-reading-comparison-v2-orthography'
        || reading.sha256 !== clip.sha256 || reading.toneReadingMatch !== Boolean(tonesMatch)
        || check.needsContentReview !== !reading.toneReadingMatch || reading.humanListeningPerformed !== false
        || reading.notAcousticToneProof !== true)
      throw new Error(`${clip.id}: missing or inconsistent reading review; never hide tone disagreements`);
    if (clip.subjectiveStyleAccepted !== false) throw new Error(`${clip.id}: do not claim unconfirmed style acceptance`);
  }
  return manifest;
}

export async function verifyVoiceOptions({ localReview = false } = {}) {
  const manifestPath = localReview ? 'work/voice-palette/preview-manifest.json' : 'assets/voice-options/manifest.json';
  const manifest = validateSampleMetadata(JSON.parse(await readFile(new URL(manifestPath, root), 'utf8')), { localReview });
  let bytes = 0;
  for (const clip of manifest.clips) {
    const data = await readFile(new URL(clip.file, root));
    if (createHash('sha256').update(data).digest('hex') !== clip.sha256)
      throw new Error(`${clip.id}: sample audio checksum differs`);
    bytes += data.length;
  }
  return { ...manifest, bytes };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await verifyVoiceOptions({ localReview: process.argv.includes('--local-review') });
  console.log(JSON.stringify({ count: report.clips.length,
    seconds: Number(report.clips.reduce((sum, clip) => sum + clip.duration, 0).toFixed(3)),
    bytes: report.bytes, scope: report.scope, pendingContentReview: report.clips.filter((clip) => clip.check.needsContentReview).map((clip) => clip.id),
    subjectiveStyleAccepted: false }));
}
