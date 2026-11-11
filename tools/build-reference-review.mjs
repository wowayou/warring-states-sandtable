import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const stage = new URL('work/reference-voice/', root);
const notes = JSON.parse(await readFile(new URL('content-review.json', stage), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', stage), 'utf8'));
const out = new URL('release/reference-voice-review/', root);
await mkdir(out, { recursive: true });
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rows = [];
for (const [id, note] of Object.entries(notes)) {
  const entry = manifest[id];
  const audio = await readFile(new URL(entry.file, root));
  if (createHash('sha256').update(audio).digest('hex') !== note.sha256) throw new Error(`${id}: stale review note`);
  const filename = `${id}.mp3`;
  await copyFile(new URL(entry.file, root), new URL(filename, out));
  rows.push(`<section><h2>${esc(note.term)} <small>${esc(note.expectedReading)}</small></h2><p>${esc(note.text)}</p>
  <audio controls preload="metadata" src="${filename}"></audio><details><summary>为何列入听审</summary><p>${esc(note.reason)}</p></details></section>`);
}
await writeFile(new URL('index.html', out), `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>战国沙盘 · 读音复核</title>
<style>body{margin:0;background:#101817;color:#e8e2d2;font:16px/1.8 system-ui,sans-serif}main{max-width:760px;margin:36px auto;padding:0 22px}h1,h2{color:#ead5a0}h1{font-size:26px}h2{font-size:20px}small{font-size:13px;color:#bbc1af}section{border-top:1px solid #455244;padding:16px 0}audio{width:100%}summary{cursor:pointer;color:#b9ab84}p{color:#c7cec0}a{color:#ead5a0}</style></head><body><main>
<h1>读音复核 · ${rows.length}处</h1><p>以下片段使用已选定的AI参考声线，非本人原录音。自动识别对这些人名地名仍有分歧，请结合原文和读音试听；列出疑点不等于确认音频读错。</p>
${rows.join('\n')}<p><a href="../../dist/index.html">返回沙盘</a></p></main>
<script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(a!==b)b.pause()})</script></body></html>`);
console.log(new URL('index.html', out).pathname);
