"""Package the verified offline directory; never label partial audio complete."""
import hashlib, json, subprocess, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
subprocess.run(['node', 'tools/verify-voice-options.mjs'], cwd=ROOT, check=True, timeout=10)
subprocess.run(['node', 'tools/verify-voice.mjs'], cwd=ROOT, check=True, timeout=300)
subprocess.run(['node', 'build.mjs'], cwd=ROOT, check=True, timeout=90)
qa = json.loads((ROOT / 'work/voice-qa.json').read_text())
info = json.loads((ROOT / 'dist/build-info.json').read_text())
if info['defaultVoiceProfile'] != 'accepted-reference-v1':
    raise RuntimeError('Unexpected default voice; review package disclosures before publishing')
voice_note = '配音为AI参考声线合成，非单田芳先生的原始录音。'
out = ROOT / 'release'; out.mkdir(exist_ok=True)
target = out / 'warring-states-sandtable-offline.zip'
pending = out / 'warring-states-sandtable-offline.tmp.zip'
with zipfile.ZipFile(pending, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    # build.mjs has verified an exact public file allowlist and a 25 MiB bound.
    for path in sorted((ROOT / 'dist').rglob('*')):
        if path.is_file() and path.name != 'artifact.html':
            z.write(path, f'warring-states-sandtable/{path.relative_to(ROOT / "dist")}')
    for name in ['VOICE.md', 'QA.md', 'pronunciation-review.json', 'qwen-reference-model.json', 'qwen-style-model.json']:
        z.write(ROOT / 'docs' / name, f'warring-states-sandtable/docs/{name}')
    z.write(ROOT / 'work/voice-qa.json', 'warring-states-sandtable/QA.json')
    z.writestr('warring-states-sandtable/打开说明.txt',
        '请先解压整个文件夹，再双击 index.html。保留 assets、voices、review 文件夹。\n'
        '首次打开不会自动出声，点击推演开始。' + voice_note + '\n'
        '断网可用。暂停、进度拖动、倍速和战役步骤共用播放进度。\n'
        '查看地图时暂停，点返回讲解可回到原进度。疆域为概貌示意。\n'
        f'voices/index.html 提供{info["sampleCount"]}种备选声线短样，不是整套替换配音。\n'
        '8处人名地名存在自动识别分歧，可打开 review/index.html 逐条听审。\n'
        '配音来源、许可和验收边界见 docs/VOICE.md、docs/QA.md。\n')
    for entry in qa['files']:
        path = ROOT / 'dist' / entry['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise RuntimeError(f'Stale bundled audio: {path.name}')
pending.replace(target)
print(f'{target}: {target.stat().st_size} bytes; sha256={hashlib.sha256(target.read_bytes()).hexdigest()}')
