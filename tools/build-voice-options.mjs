import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = new URL('../work/revision-3/voices/', import.meta.url);
const report = JSON.parse(await readFile(new URL('report.json', out), 'utf8'));
const checks = JSON.parse(await readFile(new URL('checks.json', out), 'utf8'));
if (report.clips.length !== 2 || report.clips.reduce((n, c) => n + c.duration, 0) > 60)
  throw new Error('Unexpected sample count or length');
for (const clip of report.clips) {
  const data = await readFile(new URL(clip.file, out));
  const check = checks.find((c) => c.id === clip.id);
  if (!check || check.sha256 !== createHash('sha256').update(data).digest('hex') || check.needsContentReview)
    throw new Error(`${clip.id}: audio needs content review before sharing`);
}
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await writeFile(new URL('index.html', out), `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>战国沙盘 · 更换音色</title>
<style>body{margin:0;background:#101817;color:#e8e2d2;font:17px/1.75 system-ui,sans-serif}main{max-width:720px;margin:40px auto;padding:0 22px}
h1{font-size:27px;color:#eed9a0;margin-bottom:10px}h2{font-size:20px;color:#eed9a0;margin:0 0 8px}p{color:#b9c3b9}section{padding:25px 0;border-top:1px solid #465048}audio{display:block;width:100%;margin:15px 0 5px}small{color:#aab5ab}blockquote{margin:20px 0;padding-left:16px;border-left:2px solid #958048;color:#c5cbbf}a{color:#eed9a0}footer{border-top:1px solid #465048;padding:20px 0 35px;font-size:14px}</style>
</head><body><main><h1>换两种声线，再听同一段</h1><p>男声作为主候选，女声供对照。两条保留各自的原生音高与语速，只统一音量。</p>
${report.clips.map((clip, index) => `<section><h2>${index === 0 ? '男声 · Dylan' : '女声 · Serena'}</h2><small>${clip.duration.toFixed(1)}秒 · AI 合成</small><audio controls preload="metadata" src="${escape(clip.file)}"></audio><a href="${escape(clip.file)}" download>下载这条样音</a></section>`).join('')}
<blockquote>${escape(report.clips[0].text)}</blockquote>
<footer>这是新音色短样，整套讲解尚未替换。<br><a href="../../../dist/index.html">打开已修复镜头的沙盘</a></footer>
<script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause()})</script>
</main></body></html>`);
console.log(new URL('index.html', out).pathname);
