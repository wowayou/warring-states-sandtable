// 把分散的模块摊成一张自足的 HTML，供离线打开或发布之用。
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const ORDER = ['src/geo.js', 'src/atlas.js', 'src/history.js', 'src/sound.js', 'src/table.js', 'src/app.js'];

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

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/index.html', root), standalone);
await writeFile(new URL('dist/artifact.html', root), artifact);
console.log(`dist/index.html      ${(standalone.length / 1024).toFixed(0)} KB`);
console.log(`dist/artifact.html   ${(artifact.length / 1024).toFixed(0)} KB`);
