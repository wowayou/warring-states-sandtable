"""One approved local style audition: bounded public download, no API inference."""
import argparse, hashlib, json, shutil, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--model', choices=['style', 'reference'], default='style')
parser.add_argument('--weight-origin', choices=['huggingface', 'modelscope'], default='huggingface')
args = parser.parse_args()
META = ROOT / 'docs' / ('qwen-style-model.json' if args.model == 'style' else 'qwen-reference-model.json')
data = json.loads(META.read_text())
MODEL = data['id']
REVISION = data['sha']
DOWNLOAD_LIMIT = 4_600_000_000 if args.model == 'style' else 1_900_000_000
OUT = ROOT / 'work/models' / MODEL.split('/')[-1] / REVISION
started = time.monotonic()
downloaded = 0
def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''): h.update(block)
    return h.hexdigest()

for item in data['siblings']:
    name = item['rfilename']
    if name.startswith('.'): continue
    size = item['size']
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    sha = item.get('lfs', {}).get('sha256')
    if target.exists() and target.stat().st_size == size:
        if not sha or digest(target) == sha: continue
    cached = Path('/home/forbackup/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/85e237c12c027371202489a0ec509ded67b5e4b5') / name
    if sha and cached.exists() and cached.stat().st_size == size and digest(cached) == sha:
        shutil.copyfile(cached, target)
        print(f'{name}: reused identical cached weights', flush=True)
        continue
    remaining = int(900 - (time.monotonic() - started))
    if remaining <= 0: raise TimeoutError('15-minute download limit reached')
    if downloaded + size > DOWNLOAD_LIMIT: raise RuntimeError('Approved download size limit exceeded')
    temp = target.with_suffix(target.suffix + '.partial')
    url = f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}'
    if args.weight_origin == 'modelscope' and name.endswith('.safetensors'):
        # ModelScope serves the same official Qwen repository. Accept only the
        # exact SHA-256 pinned in our versioned manifest, never a silent version change.
        url = f'https://modelscope.cn/models/{MODEL}/resolve/master/{name}'
    if size > 1_000_000_000:
        prefix = temp.stat().st_size if temp.exists() else 0
        chunks = []
        chunk_size = max(1, (size - prefix + 3) // 4)
        for i, start in enumerate(range(prefix, size, chunk_size)):
            end = min(size - 1, start + chunk_size - 1)
            chunks.append((start, end, temp.with_name(temp.name + f'.part{i}')))
        def fetch(chunk):
            start, end, path = chunk
            present = path.stat().st_size if path.exists() else 0
            if present > end-start+1: raise ValueError('Existing range exceeds expected size')
            if present == end-start+1: return
            resume = start + present
            tail = path.with_suffix(path.suffix + '.tail')
            headers = path.with_suffix(path.suffix + '.headers')
            subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--connect-timeout', '20',
                '--max-time', str(remaining), '--range', f'{resume}-{end}', '--max-filesize', str(end-resume+1),
                '--dump-header', str(headers), '--output', str(tail), url], check=True, timeout=remaining + 5)
            if tail.stat().st_size != end-resume+1 or f'bytes {resume}-{end}/{size}' not in headers.read_text():
                raise ValueError('Range response does not match requested bytes')
            with path.open('ab') as dest, tail.open('rb') as src: shutil.copyfileobj(src, dest, 4 * 1024 * 1024)
            tail.unlink()
            print(f'{name}: verified bytes {start}..{end}', flush=True)
        with ThreadPoolExecutor(max_workers=4) as executor: list(executor.map(fetch, chunks))
        with temp.open('ab') as out:
            for _, _, path in chunks:
                with path.open('rb') as src: shutil.copyfileobj(src, out, 4 * 1024 * 1024)
                path.unlink()
    else:
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--connect-timeout', '20',
            '--max-time', str(remaining), '--max-filesize', str(max(size, 65536)), '--output', str(temp), url], check=True, timeout=remaining + 5)
    if temp.stat().st_size != size: raise ValueError(f'{name}: size mismatch')
    if sha and digest(temp) != sha: raise ValueError(f'{name}: SHA-256 mismatch')
    temp.replace(target)
    downloaded += size
    print(f'{name}: {size} bytes verified', flush=True)
print(f'Model ready: {OUT}; downloaded {downloaded} bytes', flush=True)
