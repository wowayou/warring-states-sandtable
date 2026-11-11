// Activate only a complete, decoded, content-screened batch of the accepted voice.
import { readFile, writeFile, copyFile, mkdir, rename } from 'node:fs/promises';
import { verifyVoice } from './verify-voice.mjs';

const root = new URL('../', import.meta.url);
const stage = new URL('work/reference-voice/', root);
const readJSON = async (path) => JSON.parse(await readFile(path, 'utf8'));
const recordings = await readJSON(new URL('manifest.json', stage));
const cfg = await readJSON(new URL('work/reference-voice-input.json', root));
const qa = await readJSON(new URL('qa.json', stage));
const review = await readJSON(new URL('phonetic-review.json', stage));
const verified = await verifyVoice({ recordings, staged: true });
if (!qa.decoded || qa.count !== verified.count) throw new Error('Complete decoded audio QA required');
const warnings = [];
for (const item of verified.files) {
  const entry = recordings[item.id];
  if (entry.referenceSha256 !== cfg.referenceSha256 || entry.modelRevision !== cfg.revision)
    throw new Error(`${item.id}: does not use the accepted reference / model`);
  if (entry.captionAlignmentSha256 !== item.sha256) throw new Error(`${item.id}: current sentence alignment missing`);
  if (!qa.files.some((checked) => checked.id === item.id && checked.sha256 === item.sha256))
    throw new Error(`${item.id}: current audio has not been decoded`);
  if (review[item.id]?.sha256 !== item.sha256) throw new Error(`${item.id}: current transcription screening missing`);
  if (review[item.id].review) warnings.push(item.id);
}
if (warnings.length) {
  const resolution = await readJSON(new URL('content-review.json', stage));
  for (const id of warnings) {
    if (resolution[id]?.sha256 !== recordings[id].sha256 || !resolution[id].reason || resolution[id].blocking !== false)
      throw new Error(`${id}: transcription discrepancy requires an explicit, current review record`);
  }
}
if (!process.argv.includes('--activate')) {
  console.log(JSON.stringify({ ready: true, count: verified.count, seconds: verified.duration, reviewNotes: warnings }));
  process.exit(0);
}
const backup = new URL('previous-version/', stage);
await mkdir(backup, { recursive: true });
for (const [source, name] of [
  ['src/narration-data.js', 'narration-data.js'], ['work/voice-manifest.json', 'voice-manifest.json'],
  ['dist/index.html', 'index.html'], ['release/warring-states-sandtable-offline.zip', 'offline.zip'],
]) {
  try { await copyFile(new URL(source, root), new URL(name, backup), 1); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const production = {};
for (const [id, item] of Object.entries(recordings)) {
  const file = `assets/voice/${item.file.split('/').at(-1)}`;
  await copyFile(new URL(item.file, root), new URL(file, root));
  production[id] = { ...item, file };
}
const data = JSON.stringify(production, null, 2) + '\n';
await writeFile(new URL('work/voice-manifest.json.tmp', root), data);
await writeFile(new URL('src/narration-data.js.tmp', root), '// Generated locally; accepted reference voice.\nexport const NARRATION = ' + data.trim() + ';\n');
await rename(new URL('work/voice-manifest.json.tmp', root), new URL('work/voice-manifest.json', root));
await rename(new URL('src/narration-data.js.tmp', root), new URL('src/narration-data.js', root));
await writeFile(new URL('activation.json', stage), JSON.stringify({ count: verified.count, seconds: verified.duration,
  voiceProfile: 'accepted-reference-v1', referenceSha256: cfg.referenceSha256, reviewNotes: warnings,
  disclosure: cfg.disclosure, backup: 'work/reference-voice/previous-version/' }, null, 2) + '\n');
console.log('Complete accepted-voice batch activated; previous version retained. Rebuild and validate the offline package.');
