import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { NARRATION } from '../src/narration-data.js';
import { verifyVoiceOptions } from './verify-voice-options.mjs';

const root = new URL('../', import.meta.url);
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const pageStyle = `:root{color-scheme:dark;--bone:#e8e2d2;--muted:#b4beb3;--bronze:#ead5a0;--edge:#455244}
*{box-sizing:border-box}body{margin:0;background:#101817;color:var(--bone);font:16px/1.8 system-ui,sans-serif}
main{max-width:900px;margin:32px auto;padding:0 22px}nav{display:flex;flex-wrap:wrap;gap:8px 24px;margin-bottom:22px}
a{color:var(--bronze);text-underline-offset:4px}nav a,.download{display:inline-flex;align-items:center;min-height:44px}
h1,h2{color:var(--bronze);line-height:1.5}h1{font-size:27px;margin:0 0 12px}h2{font-size:20px;margin:0 0 8px}
p{margin:10px 0;color:var(--muted)}small{font-size:13px;color:var(--muted)}blockquote{margin:20px 0;padding:12px 18px;border-left:2px solid #958048;color:var(--bone)}
.current{padding:22px 0;border-top:1px solid var(--edge);border-bottom:1px solid var(--edge)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.voice-card{min-width:0;padding:22px 0;border-bottom:1px solid var(--edge)}.audition{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin:10px 0 0;padding:8px 14px;border:1px solid #776e42;background:#1b211b;color:var(--bronze);font:inherit;cursor:pointer}.audition[aria-pressed="true"]{background:#363324}.audition:focus-visible{outline:2px solid var(--bronze);outline-offset:4px}audio{display:block;width:100%;margin:14px 0 0}audio:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--bronze);outline-offset:5px}
.tag{display:inline-block;margin-bottom:12px;padding:3px 9px;border:1px solid #776e42;font-size:12px;color:var(--bronze)}.error{color:#f0b4a4}
.review section{padding:20px 0;border-top:1px solid var(--edge)}summary{cursor:pointer;color:var(--bronze);min-height:44px;display:list-item;padding:8px 0}details p{margin:0 0 12px}.review-warning{padding:12px 16px;border:1px solid #8b7050;color:#ead5a0;background:#211e17}
footer{padding:24px 0 36px;font-size:13px}[hidden]{display:none!important}@media(max-width:600px){main{margin:20px auto;padding:0 18px}.grid{grid-template-columns:1fr}h1{font-size:24px}}`;
const mediaScript = `const tracks=[...document.querySelectorAll('audio')];let wanted=null,generation=0;
const buttonFor=audio=>audio.parentElement.querySelector('.audition');
const showError=audio=>{const error=audio.parentElement.querySelector('.error');if(error)error.hidden=false};
for(const audio of tracks){const button=buttonFor(audio);
button.addEventListener('click',()=>{if(!audio.paused){if(wanted===audio){wanted=null;generation++}audio.pause();return}
const run=++generation;wanted=audio;for(const other of tracks)if(other!==audio)other.pause();
if(audio.getAttribute('src')!==audio.dataset.src||audio.error){audio.src=audio.dataset.src;audio.load()}
// Assign the source and call play() inside the user's gesture. preload=none
// alone does not prevent WebKit from downloading every candidate on startup.
audio.play().catch(error=>{if(error.name==='AbortError')return;if(run===generation&&wanted===audio){audio.pause();showError(audio)}})});
audio.addEventListener('play',()=>{if(audio.paused)return;if(wanted!==audio){wanted=audio;generation++}
for(const other of tracks)if(other!==audio)other.pause();button.textContent='暂停试听';button.setAttribute('aria-pressed','true')});
const paused=()=>{button.textContent=audio.ended?'重听这条':audio.currentTime>0?'继续试听':'试听这条';button.setAttribute('aria-pressed','false')};
audio.addEventListener('pause',paused);audio.addEventListener('ended',paused);audio.addEventListener('emptied',paused);audio.addEventListener('error',()=>showError(audio))}
const pauseAll=()=>{generation++;wanted=null;for(const audio of tracks)audio.pause()};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll()});
window.addEventListener('pagehide',()=>{pauseAll();for(const audio of tracks){audio.removeAttribute('src');audio.load()}});`;
function documentPage(title, content, bodyClass = '') {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${pageStyle}</style></head>
<body class="${bodyClass}"><main>${content}</main><script>${mediaScript}</script></body></html>\n`;
}
function player(file, label) {
  return `<button class="audition" type="button" aria-pressed="false" aria-label="试听${escapeHtml(label)}">试听这条</button>
<audio controls preload="none" data-src="../${escapeHtml(file)}" aria-label="${escapeHtml(label)}"></audio>
<p class="error" role="alert" hidden>音频无法加载。请检查网络，或完整解压离线包后重试；不会自动切换其他声音。</p>`;
}

export async function readPronunciationNotes() {
  const notes = JSON.parse(await readFile(new URL('docs/pronunciation-review.json', root), 'utf8'));
  if (!Array.isArray(notes) || notes.length !== 8) throw new Error('The eight disclosed pronunciation notes must be preserved');
  const ids = new Set();
  for (const note of notes) {
    const recording = NARRATION[note.id];
    if (ids.has(note.id) || !recording || note.sha256 !== recording.sha256 || note.text !== recording.text
        || !note.term || !note.expectedReading || !note.reason)
      throw new Error(`${note.id}: stale or incomplete public pronunciation note`);
    ids.add(note.id);
  }
  return notes;
}

export async function buildSharingPages({ localReview = false, directory = new URL('dist/', root) } = {}) {
  if (localReview && directory.href !== new URL('work/multi-voice/preview/', root).href)
    throw new Error('Unapproved voice samples may only be built in the dedicated local preview directory');
  const manifest = await verifyVoiceOptions({ localReview });
  const notes = await readPronunciationNotes();
  const pending = manifest.clips.filter((clip) => clip.check.needsContentReview);
  const current = NARRATION['act-I'];
  const gallery = documentPage('战国沙盘 · 配音试听', `<nav aria-label="页面导航"><a href="../index.html">返回沙盘</a><a href="../review/index.html">8处读音听审说明</a></nav>
<h1>保留当前配音，再听几种声线</h1><p>沙盘仍使用你已认可的参考声线，整套204段没有再次更换。以下备选仅为短样，尚未应用到完整讲解。</p>
${localReview ? `<p class="review-warning" role="status">本地试听草稿 · ${pending.length}种声线仍有转写／读音分歧，待人工听审；本版未推送或部署。自动转写不是发音正确或错误的判决。</p>` : ''}
<section class="current"><span class="tag">当前默认 · 完整讲解已保留</span><h2>参考声线 · 第一幕开场</h2><small>${current.duration.toFixed(2)}秒 · AI合成讲解，非本人原录音</small>
${player(current.file, '当前参考声线的第一幕开场')}<details><summary>这条开场的完整原文</summary><p>${escapeHtml(current.text)}</p></details></section>
<h2 style="margin-top:28px">${manifest.clips.length}种备选短样</h2><p>下面各声线朗读同一段文字，保留原生音高与语速，只统一响度。名字是模型预设，不代表真人为本沙盘录音。</p>
<blockquote>${escapeHtml(manifest.text)}</blockquote><div class="grid">
${manifest.clips.map((clip) => `<section class="voice-card"><span class="tag">备选短样 · 未应用整套</span><h2>${escapeHtml(clip.label)}</h2><small>${clip.duration.toFixed(2)}秒 · AI合成</small>
${player(clip.file, `${clip.label}短样`)}${clip.check.needsContentReview ? `<details><summary>待人工听审 · 查看识别分歧</summary><p>${escapeHtml(clip.pendingReviewReason)}</p></details>` : '<small>自动筛查暂无明显分歧，尚未人工认可音色。</small>'}<a class="download" href="../${escapeHtml(clip.file)}" download>下载这条样音</a></section>`).join('\n')}</div>
<footer>短样已做本地解码、时长、静音尾与转写筛查；${pending.length ? `${pending.length}条内容疑点保留听审，未作为验收通过的正式配音。` : ''}这些检查不代表已获人工音色认可。试听会暂停上一条，不会替换沙盘的主声线。<br>所有音频均为AI合成；参考声线不是单田芳先生的原始录音。</footer>`);
  const review = documentPage('战国沙盘 · 读音复核', `<nav aria-label="页面导航"><a href="../index.html">返回沙盘</a><a href="../voices/index.html">配音试听</a></nav>
<h1>读音复核 · ${notes.length}处</h1><p>以下片段使用当前AI参考声线，非本人原录音。自动识别仍有分歧，请结合原文和读音听审；列出疑点不等于确认音频读错，也不表示已人工验收。</p>
${notes.map((note) => `<section><h2>${escapeHtml(note.term)} <small>${escapeHtml(note.expectedReading)}</small></h2><p>${escapeHtml(note.text)}</p>
${player(NARRATION[note.id].file, `${note.term}读音复核`)}<details><summary>为何列入听审</summary><p>${escapeHtml(note.reason)}</p></details></section>`).join('\n')}`, 'review');
  for (const target of localReview ? [directory] : [root, directory]) {
    for (const [name, html] of [['voices', gallery], ['review', review]]) {
      await mkdir(new URL(`${name}/`, target), { recursive: true });
      await writeFile(new URL(`${name}/index.html`, target), html);
    }
  }
  await mkdir(new URL('assets/voice-options/', directory), { recursive: true });
  await copyFile(new URL(localReview ? 'work/voice-palette/preview-manifest.json' : 'assets/voice-options/manifest.json', root),
    new URL('assets/voice-options/manifest.json', directory));
  for (const file of manifest.clips.map((clip) => clip.file))
    await copyFile(new URL(file, root), new URL(file, directory));
  return { sampleCount: manifest.clips.length, sampleBytes: manifest.bytes, reviewCount: notes.length,
    pendingContentReviewCount: pending.length, localReview };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  console.log(JSON.stringify(await buildSharingPages()));
