import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { SCENES } from '../src/narration.js';
import { NARRATION } from '../src/narration-data.js';

export async function verifyVoice({ decode = false, recordings = NARRATION, staged = false } = {}) {
  const expected = SCENES.flatMap((s) => s.parts).filter((p) => !p.silent);
  const files = [];
  let duration = 0;
  let bytes = 0;
  for (const part of expected) {
    const item = recordings[part.id];
    if (!item || item.text !== part.text) throw new Error(`${part.id}: missing or stale recording`);
    const safePath = staged ? /^work\/reference-voice\/audio\/[a-z0-9-]+\.mp3$/i : /^assets\/voice\/[a-z0-9-]+\.mp3$/i;
    if (!safePath.test(item.file)) throw new Error(`${part.id}: invalid audio path`);
    if (staged && item.voiceProfile !== 'accepted-reference-v1') throw new Error(`${part.id}: wrong voice profile`);
    if (!Number.isFinite(item.duration) || item.duration <= 0) throw new Error(`${part.id}: invalid duration`);
    if (item.sentences.map((s) => s.text).join('') !== part.text) throw new Error(`${part.id}: captions differ from original text`);
    let end = 0;
    for (const s of item.sentences) {
      if (![s.start, s.end].every(Number.isFinite) || s.start < end || s.end <= s.start || s.end > item.duration + .001)
        throw new Error(`${part.id}: invalid sentence boundaries`);
      end = s.end;
    }
    if (Math.abs(end - item.duration) > .001) throw new Error(`${part.id}: incomplete final sentence`);
    const file = new URL(`../${item.file}`, import.meta.url);
    const data = await readFile(file);
    if (createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error(`${part.id}: audio checksum differs`);
    if (decode) {
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file.pathname, '-ac', '1', '-ar', '24000', '-f', 'f32le', '-'],
        { timeout: 30000, maxBuffer: 30 * 1024 * 1024 });
      const measured = pcm.length / 4 / 24000;
      if (Math.abs(measured - item.duration) > .05) throw new Error(`${part.id}: decoded duration mismatch ${measured}`);
      let peak = 0, energy = 0;
      for (let i = 0; i < pcm.length; i += 4) {
        const value = pcm.readFloatLE(i);
        if (!Number.isFinite(value)) throw new Error(`${part.id}: invalid samples`);
        peak = Math.max(peak, Math.abs(value)); energy += value * value;
      }
      if (peak > 1 || peak < .001 || energy / (pcm.length / 4) < 1e-7) throw new Error(`${part.id}: clipping or silent audio`);
    }
    duration += item.duration; bytes += data.length;
    files.push({ id: part.id, file: item.file, sha256: item.sha256, duration: item.duration });
  }
  const expectedIds = new Set(expected.map((p) => p.id));
  const extra = Object.keys(recordings).filter((id) => !expectedIds.has(id));
  if (extra.length) throw new Error(`Unexpected narration IDs: ${extra.join(', ')}`);
  return { count: files.length, duration: Math.round(duration * 100) / 100, bytes, decoded: decode, files };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const staged = process.argv.includes('--staged');
  const recordings = staged ? JSON.parse(await readFile(new URL('../work/reference-voice/manifest.json', import.meta.url), 'utf8')) : NARRATION;
  const report = await verifyVoice({ decode: true, recordings, staged });
  await mkdir(new URL('../work/', import.meta.url), { recursive: true });
  await writeFile(new URL(staged ? '../work/reference-voice/qa.json' : '../work/voice-qa.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ count: report.count, seconds: report.duration, bytes: report.bytes, decoded: report.decoded }));
}
