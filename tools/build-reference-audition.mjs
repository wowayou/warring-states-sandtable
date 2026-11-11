import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = new URL('../work/revision-4/', import.meta.url);
const report = JSON.parse(await readFile(new URL('report.json', out), 'utf8'));
const checks = JSON.parse(await readFile(new URL('checks.json', out), 'utf8'));
const bytes = await readFile(new URL(report.file, out));
if (checks.length !== 1 || checks[0].needsContentReview || checks[0].sha256 !== createHash('sha256').update(bytes).digest('hex'))
  throw new Error('Sample content / decoding verification must pass first');
if (report.duration > 20 || report.productionNarrationReplaced) throw new Error('Invalid audition scope');
const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const start = report.reference.sourceStartSeconds;
const end = report.reference.sourceEndSeconds;
await writeFile(new URL('index.html', out), `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>战国沙盘 · AI声线试听</title>
<style>body{margin:0;background:#101817;color:#e8e2d2;font:17px/1.8 system-ui,sans-serif}main{max-width:760px;margin:40px auto;padding:0 22px}
h1{font-size:27px;color:#eed9a0;margin:14px 0}h2{font-size:20px;color:#eed9a0}p{color:#c0c8c0}.label{display:inline-block;color:#ead3a1;border:1px solid #8b764b;padding:3px 10px;font-size:13px}
audio{width:100%;margin:12px 0}blockquote{margin:24px 0;padding-left:16px;border-left:2px solid #947c45}details{margin:28px 0;border-top:1px solid #485347;padding-top:20px}summary{cursor:pointer;color:#c9b688}a{color:#eed9a0}small{color:#a8b3aa}footer{border-top:1px solid #485347;padding:22px 0 35px;font-size:14px}</style>
</head><body><main><span class="label">AI 合成 · 非本人录音</span><h1>参考单田芳声线的短样</h1>
<p>使用公开节目中的短录音作参考，让模型朗读下面的新文稿。是否接近本人声线，需要实际试听判断；这不是原始表演。</p>
<audio controls preload="metadata" src="${escape(report.file)}" aria-label="AI合成新文稿试听"></audio><a href="${escape(report.file)}" download="AI合成声线试听.mp3">下载 AI 试听（${report.duration.toFixed(1)}秒）</a>
<blockquote>${escape(report.text)}</blockquote>
<details><summary>参考片段与公开来源</summary><h2>原始节目片段 · ${report.reference.duration.toFixed(2)}秒</h2>
<audio controls preload="metadata" src="reference/${escape(report.reference.file)}" aria-label="央视节目中的原始参考片段"></audio>
<p><a href="${escape(report.reference.source)}" target="_blank" rel="noopener noreferrer">${escape(report.reference.sourceTitle)}</a><br>来源：${escape(report.reference.publisher)}；位置约 ${start.toFixed(2)}–${end.toFixed(2)}秒。官方简介标注表演者为单田芳。</p>
<small>原始片段仅用于本地参考对照；公开可访问不代表已取得商用授权。</small></details>
<footer>仅生成这一条短样，尚未替换整套沙盘配音。<br><a href="../../dist/index.html">打开沙盘</a></footer>
<script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause()})</script>
</main></body></html>`);
console.log(new URL('index.html', out).pathname);
