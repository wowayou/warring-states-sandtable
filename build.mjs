// Inline application code / manifest; package recordings beside HTML for file://.
import { readFile, writeFile, mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
import { verifyVoice } from './tools/verify-voice.mjs';
import { buildSharingPages, readPronunciationNotes } from './tools/build-sharing-pages.mjs';
import { verifyVoiceOptions } from './tools/verify-voice-options.mjs';
import { writeBuildInfo, verifyDist } from './tools/verify-dist.mjs';
import { Script } from 'node:vm';

const root = new URL('./', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const ORDER = ['src/geo.js', 'src/atlas.js', 'src/history.js', 'src/narration.js', 'src/narration-data.js', 'src/storyboard.js', 'src/player.js', 'src/sound.js', 'src/table.js', 'src/app.js'];
const checkCodeOnly = process.argv.includes('--check-code');
const localReview = process.argv.includes('--local-review');
const outputDirectory = new URL(localReview ? 'work/multi-voice/preview/' : 'dist/', root);
const outputLabel = localReview ? 'work/multi-voice/preview' : 'dist';
const voiceReport = checkCodeOnly ? null : await verifyVoice();
// Validate before touching the approved dist directory. Pending samples only
// enter a separate, explicitly labelled local draft; they never pass CI.
if (!checkCodeOnly) {
  await verifyVoiceOptions({ localReview });
  await readPronunciationNotes();
}

function strip(code) {
  return code
    .replace(/^import\s+[\s\S]*?from\s+'[^']+';[ \t]*$/gm, '')
    .replace(/^export\s+(const|let|function|class)\b/gm, '$1')
    .replace(/^export\s*\{[^}]*\};[ \t]*$/gm, '')
    .trim();
}

const font = await readFile(new URL('assets/display.woff2', root));
const css = (await read('src/style.css')).replace(
  'url("../assets/display.woff2") format("woff2")',
  `url(data:font/woff2;base64,${font.toString('base64')}) format("woff2")`
);
const js = (await Promise.all(ORDER.map(read))).map(strip).join('\n\n');
const html = await read('index.html');

const bodyOnly = html
  .replace(/[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*/, '')
  .replace(/\s*<script[\s\S]*?<\/script>/g, '')
  .trim();

const title = '戰國沙盤 · 先秦形勢演變';
const icon = html.match(/<link rel="icon"[^>]*>/)?.[0] ?? '';
const description = html.match(/<meta name="description"[^>]*>/)?.[0] ?? '';

const standalone = `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
${description}
${icon}
<style>
${css}
</style>
</head>
<body>
${bodyOnly}
<script type="module">
${js}
</script>
</body>
</html>
`;

const artifact = `<title>${title}</title>
<style>
${css}
</style>
${bodyOnly}
<script type="module">
${js}
</script>
`;

// 各模块本有独立作用域，拼成单文件后顶层重名会静默相撞——构建时挡下
const seen = new Map();
for (const m of js.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
  if (seen.has(m[1])) throw new Error(`顶层标识符重复：${m[1]}（拼接后会相撞，请改名或抽为共用模块）`);
  seen.set(m[1], true);
}
new Script(js, { filename: 'sandtable-bundle.js' });
if (checkCodeOnly) {
  console.log('Bundled JavaScript syntax and top-level names checked; audio not checked, no outputs written.');
  process.exit(0);
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(new URL('assets/voice/', outputDirectory), { recursive: true });
const bundledNames = new Set(voiceReport.files.map(({ file }) => file.split('/').at(-1)));
for (const name of await readdir(new URL('assets/voice/', outputDirectory))) {
  if (/^[a-z0-9-]+-[a-f0-9]{12}\.mp3$/i.test(name) && !bundledNames.has(name))
    await unlink(new URL(`assets/voice/${name}`, outputDirectory));
}
await copyFile(new URL('LICENSE', root), new URL('LICENSE', outputDirectory));
await copyFile(new URL('assets/OFL.txt', root), new URL('assets/OFL.txt', outputDirectory));
for (const { file } of voiceReport.files) await copyFile(new URL(file, root), new URL(file, outputDirectory));
await writeFile(new URL('index.html', outputDirectory), standalone);
await writeFile(new URL('artifact.html', outputDirectory), artifact);
const sharingReport = await buildSharingPages({ localReview, directory: outputDirectory });
await writeBuildInfo(voiceReport, sharingReport, { directory: outputDirectory, localReview });
await verifyDist(outputDirectory, { localReview });
console.log(`${outputLabel}/index.html      ${(standalone.length / 1024).toFixed(0)} KB`);
console.log(`${outputLabel}/artifact.html   ${(artifact.length / 1024).toFixed(0)} KB`);
console.log(`Audio: ${voiceReport.count} clips, ${(voiceReport.bytes / 1024 / 1024).toFixed(1)} MiB (keep assets/voice beside HTML)`);
console.log(`Voice options: ${sharingReport.sampleCount} short samples; ${sharingReport.reviewCount} disclosed pronunciation notes; file allowlist verified.`);
if (localReview) console.log(`LOCAL DRAFT ONLY: ${sharingReport.pendingContentReviewCount} samples still require human content review; approved dist and release ZIP unchanged.`);
