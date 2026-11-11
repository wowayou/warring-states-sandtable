import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SCENES } from '../src/narration.js';

const lines = SCENES.flatMap((s) => s.parts).filter((p) => !p.silent);
if (new Set(lines.map((p) => p.id)).size !== lines.length) throw new Error('Duplicate narration IDs');
await mkdir(new URL('../work/', import.meta.url), { recursive: true });
const referenceMode = process.argv.includes('--reference');
const referenceConfig = referenceMode ? JSON.parse(await readFile(new URL('../work/revision-4/reference/reference.json', import.meta.url), 'utf8')) : null;
const output = referenceMode ? '../work/reference-voice-input.json' : '../work/voice-input.json';
await writeFile(new URL(output, import.meta.url), JSON.stringify({
  ...(referenceMode ? {
    model: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
    revision: '5d83992436eae1d760afd27aff78a71d676296fc',
    reference: 'work/revision-4/reference/reference.json',
    referenceSha256: referenceConfig.sha256,
    disclosure: 'AI合成历史讲解，非单田芳先生的原始录音。',
  } : {
  model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', speaker: 'Uncle_Fu',
  instruct: '用沉稳、克制、清晰的普通话讲述战国历史，语速适中，避免戏剧化喊叫。',
  }),
  lines: Object.fromEntries(lines.map((p) => [p.id, { text: p.text }])),
}, null, 2) + '\n');
console.log(`${SCENES.length} scenes, ${lines.length} audio parts prepared (${referenceMode ? 'accepted reference voice' : 'legacy voice'})`);
