import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { NARRATION } from '../src/narration-data.js';
import { verifyVoiceOptions } from './verify-voice-options.mjs';

const root = new URL('../', import.meta.url);
const distribution = new URL('dist/', root);
const digest = (data) => createHash('sha256').update(data).digest('hex');
export const MAX_DIST_BYTES = 25 * 1024 * 1024;

export function validateDistributionFiles(files, allowed) {
  const found = new Set(files.map((file) => file.path));
  if (found.size !== files.length || found.size !== allowed.size || [...found].some((file) => !allowed.has(file)))
    throw new Error('Distribution differs from the explicit public file allowlist');
  const bytes = files.reduce((sum, file) => {
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw new Error(`Empty or invalid public file: ${file.path}`);
    return sum + file.bytes;
  }, 0);
  if (bytes > MAX_DIST_BYTES) throw new Error('Distribution exceeds the 25 MiB release bound');
  return bytes;
}

export async function scanDistribution(directory = distribution, prefix = '') {
  const files = [];
  for (const name of await readdir(directory)) {
    const url = new URL(name, directory);
    const stat = await lstat(url);
    if (stat.isSymbolicLink()) throw new Error(`No symlinks in public distribution: ${prefix}${name}`);
    if (stat.isDirectory()) files.push(...await scanDistribution(new URL(`${name}/`, directory), `${prefix}${name}/`));
    else if (stat.isFile()) files.push({ path: `${prefix}${name}`, bytes: stat.size });
    else throw new Error(`Unsupported public file type: ${prefix}${name}`);
  }
  return files;
}

export async function writeBuildInfo(voice, sharing, { directory = distribution, localReview = false } = {}) {
  let sourceRevision = null, sourceIsDirty = null;
  const gitOptions = { cwd: root, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], gitOptions).trim();
    sourceIsDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], gitOptions).trim());
  } catch { /* An unpacked local source can still build; do not invent a commit ID. */ }
  const info = {
    format: 'warring-states-build-v1', sourceRevision, sourceIsDirty,
    publicationStatus: localReview ? 'local-review-only' : 'validated-distribution',
    defaultVoiceProfile: 'accepted-reference-v1', mainAudioCount: voice.count,
    mainAudioSeconds: voice.duration, sampleCount: sharing.sampleCount,
    pronunciationReviewCount: sharing.reviewCount,
    mainIndexSha256: digest(await readFile(new URL('index.html', directory))),
    voiceOptionsManifestSha256: digest(await readFile(new URL('assets/voice-options/manifest.json', directory))),
    sharingPageSha256: {
      voices: digest(await readFile(new URL('voices/index.html', directory))),
      review: digest(await readFile(new URL('review/index.html', directory))),
    },
  };
  await writeFile(new URL('build-info.json', directory), JSON.stringify(info, null, 2) + '\n');
  return info;
}

export async function verifyDist(directory = distribution, { localReview = false } = {}) {
  if (localReview && directory.href !== new URL('work/multi-voice/preview/', root).href)
    throw new Error('Pending samples are only permitted in the dedicated local review directory, never the public dist');
  const manifest = await verifyVoiceOptions({ localReview });
  const main = Object.values(NARRATION);
  const allowed = new Set(['index.html', 'artifact.html', 'LICENSE', 'assets/OFL.txt', 'voices/index.html',
    'review/index.html', 'assets/voice-options/manifest.json', 'build-info.json',
    ...main.map((clip) => clip.file), ...manifest.clips.map((clip) => clip.file)]);
  const files = await scanDistribution(directory);
  const bytes = validateDistributionFiles(files, allowed);
  for (const clip of [...main, ...manifest.clips]) {
    if (digest(await readFile(new URL(clip.file, directory))) !== clip.sha256)
      throw new Error(`Stale audio in public distribution: ${clip.file}`);
  }
  for (const file of ['LICENSE', 'assets/OFL.txt']) {
    if (digest(await readFile(new URL(file, directory))) !== digest(await readFile(new URL(file, root))))
      throw new Error(`Stale public notice: ${file}`);
  }
  const manifestSource = localReview ? 'work/voice-palette/preview-manifest.json' : 'assets/voice-options/manifest.json';
  if (digest(await readFile(new URL('assets/voice-options/manifest.json', directory))) !== digest(await readFile(new URL(manifestSource, root))))
    throw new Error('Stale bundled voice-options manifest');
  const html = await readFile(new URL('index.html', directory), 'utf8');
  if (!html.includes('AI合成讲解') || !html.includes('id="btnVoiceOptions"') || !html.includes('id="btnVoiceReview"'))
    throw new Error('Required AI disclosure or audition/review entry missing');
  const info = JSON.parse(await readFile(new URL('build-info.json', directory), 'utf8'));
  if (info.format !== 'warring-states-build-v1' || info.mainAudioCount !== main.length
      || info.publicationStatus !== (localReview ? 'local-review-only' : 'validated-distribution')
      || !(info.sourceRevision === null || /^[a-f0-9]{40}$/.test(info.sourceRevision))
      || !(info.sourceIsDirty === null || typeof info.sourceIsDirty === 'boolean')
      || main.some((clip) => clip.voiceProfile !== info.defaultVoiceProfile)
      || info.sampleCount !== manifest.clips.length || info.pronunciationReviewCount !== 8
      || info.mainIndexSha256 !== digest(Buffer.from(html))
      || info.sharingPageSha256?.voices !== digest(await readFile(new URL('voices/index.html', directory)))
      || info.sharingPageSha256?.review !== digest(await readFile(new URL('review/index.html', directory)))
      || info.voiceOptionsManifestSha256 !== digest(await readFile(new URL('assets/voice-options/manifest.json', directory))))
    throw new Error('Public build information differs from the bundled resources');
  return { fileCount: files.length, bytes, audioCount: main.length, sampleCount: manifest.clips.length,
    reviewCount: info.pronunciationReviewCount, sourceRevision: info.sourceRevision, sourceIsDirty: info.sourceIsDirty,
    localReview, pendingContentReviewCount: manifest.clips.filter((clip) => clip.check.needsContentReview).length };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const localReview = process.argv.includes('--local-review');
  console.log(JSON.stringify(await verifyDist(localReview ? new URL('work/multi-voice/preview/', root) : distribution, { localReview })));
}
