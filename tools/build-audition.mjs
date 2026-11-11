import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { NARRATION } from '../src/narration-data.js';

const root = new URL('../', import.meta.url);
const out = new URL('work/revision-2/audition/', root);
const report = JSON.parse(await readFile(new URL('report.json', out), 'utf8'));
if (report.clips.length !== 2 || report.clips.reduce((n, c) => n + c.duration, 0) > 60)
  throw new Error('Expected two approved short audition clips');
await copyFile(new URL(NARRATION['act-I'].file, root), new URL('opening-original.mp3', out));
const battleParts = report.clips.find((c) => c.id === 'battle').sourceParts || ['intro', 'step-1', 'step-2', 'step-3', 'step-4'];
const oldBattle = battleParts.map((suffix) =>
  `file '${new URL(NARRATION[`battle-changping-${suffix}`].file, root).pathname}'`).join('\n');
await writeFile(new URL('original-battle.txt', out), oldBattle);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i',
  new URL('original-battle.txt', out).pathname, '-c', 'copy', new URL('battle-original.mp3', out).pathname], { timeout: 20_000 });
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await writeFile(new URL('index.html', out), `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>战国沙盘 · 纪录片旁白试听</title>
<style>body{margin:0;background:#101817;color:#e8e2d2;font:16px/1.7 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:35px 22px}
h1{font:600 28px/1.4 Georgia,serif;color:#eed9a0}h2{font-size:20px;color:#eed9a0;margin:0 0 15px}p{color:#bcc5bc}section{border-top:1px solid #435045;padding:26px 0}
.players{display:grid;grid-template-columns:1fr 1fr;gap:24px}audio{width:100%}label{display:block;margin-bottom:8px}a{color:#eed9a0}small{color:#a6b2a8}blockquote{margin:22px 0 0;padding:0 0 0 16px;border-left:2px solid #806b39;color:#bcc5bc}
@media(max-width:620px){.players{grid-template-columns:1fr;gap:18px}}</style></head><body><main>
<h1>战国沙盘 · 纪录片旁白试听</h1><p>目标：中低音、叙述平稳、句尾收束。先比较语气、连贯性与情绪是否合适；新声音尚未替换整套讲解。</p>
${report.limitations ? `<p>${escape(report.limitations)}</p>` : ''}
${report.clips.map((clip) => `<section><h2>${escape(clip.title)}</h2><div class="players"><div><label>原版</label><audio controls preload="metadata" src="${clip.id}-original.mp3"></audio></div><div><label>纪录片旁白候选 · ${clip.duration.toFixed(1)}秒</label><audio controls preload="metadata" src="${escape(clip.file)}"></audio></div></div><blockquote>${escape(clip.text)}</blockquote></section>`).join('\n')}
<p><a href="../../../dist/index.html">打开已修复镜头的沙盘</a></p><small>新样音为本地 Qwen 1.7B 生成的 AI 配音。本页用于音色与风格确认，不代表已完成真人听审。</small>
<script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause()})</script>
</main></body></html>`);
console.log(new URL('index.html', out).pathname);
let controlled;
try { controlled = JSON.parse(await readFile(new URL('controlled-report.json', out), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (controlled) {
  const text = report.clips.find((c) => c.id === 'opening').text;
  await writeFile(new URL('steady.html', out), `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>战国沙盘 · 收住语调的旁白短样</title>
  <style>body{margin:0;background:#101817;color:#e8e2d2;font:17px/1.8 system-ui,sans-serif}main{max-width:700px;margin:45px auto;padding:0 22px}h1{font-size:26px;color:#eed9a0}p{color:#c0c8c0}audio{display:block;width:100%;margin:20px 0}details{margin:32px 0;padding:16px 0;border-top:1px solid #485345}summary{cursor:pointer;color:#c3b384}blockquote{margin:30px 0;padding-left:17px;border-left:2px solid #a18c59}a{color:#eed9a0}small{color:#a8b3ab}</style></head><body><main>
  <h1>收住语调的旁白短样</h1><p>降低句子层面的抑扬顿挫，压平音量突变，保持连贯叙述。这是一条约22秒的开场短样，整套配音尚未替换。</p>
  <audio controls preload="metadata" src="${escape(controlled.file)}"></audio>
  <blockquote>${escape(text)}</blockquote>
  <details><summary>展开上一条候选作对照</summary><audio controls preload="metadata" src="opening.mp3"></audio></details>
  <p><a href="../../../dist/index.html">打开已修复镜头的沙盘</a></p>
  <small>本版本直接处理既有AI音频的音高和响度。声线是否自然、是否符合你要的旁白气质，仍需试听确认。</small>
  <script>for(const a of document.querySelectorAll('audio'))a.addEventListener('play',()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause()})</script>
  </main></body></html>`);
  const oldPage = await readFile(new URL('index.html', out), 'utf8');
  await writeFile(new URL('index.html', out), oldPage.replace('<h1>', '<p><a href="steady.html">打开最新的少起伏短样</a> · 本页为较早候选对照</p><h1>'));
  console.log(new URL('steady.html', out).pathname);
}
