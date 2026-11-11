"""Bounded, offline Qwen generation. Only this local tool needs Python/CUDA.

Each sentence: <=180s, no automatic retry. Entire run: <=2h, concurrency=1.
Use --only ID --seed 2 for one explicit quality retry. No cloud fallback.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import argparse, hashlib, json, re, signal, subprocess, time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[1]
GAP = .22

def expire(_signum, _frame):
    raise TimeoutError('Local generation time limit reached; completed cache is preserved')

def split_text(text):
    # Keep parentheses / alternative datings. Split long sentences at pauses.
    clauses = re.findall(r'[^。！？；，]+[。！？；，]?', text)
    result, current = [], ''
    for part in clauses:
        if current and len(current + part) > 42:
            result.append(current); current = ''
        current += part
        if current[-1:] in '。！？；':
            result.append(current); current = ''
    if current: result.append(current)
    return result

from pronunciation import spoken

def trim_level(audio, sr):
    a = np.asarray(audio, dtype=np.float32)
    if not len(a) or not np.isfinite(a).all(): raise ValueError('Invalid generated audio')
    env = np.convolve(np.abs(a), np.ones(int(sr * .01)) / int(sr * .01), mode='same')
    active = np.flatnonzero(env > 10 ** (-42 / 20))
    if not len(active): raise ValueError('Silent generated audio')
    a = a[max(0, active[0] - int(.06 * sr)):min(len(a), active[-1] + int(.08 * sr))]
    a *= 10 ** (-20 / 20) / (np.sqrt(np.mean(a ** 2)) + 1e-9)
    a *= min(1, 10 ** (-2 / 20) / max(np.max(np.abs(a)), 1e-9))
    return a

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--seed', type=int, default=None, choices=[1, 2])
    ap.add_argument('--device', choices=['cuda:0', 'cpu'], default='cuda:0')
    ap.add_argument('--budget-seconds', type=int, default=7200)
    ap.add_argument('--check', action='store_true', help='check current text, readings and audio cache without synthesis')
    args = ap.parse_args()
    if args.seed is not None and not args.only: ap.error('--seed requires an explicit --only selection')
    if not 1 <= args.budget_seconds <= 7200: ap.error('--budget-seconds must be within 1..7200')
    cfg = json.loads((ROOT / 'work/voice-input.json').read_text())
    from huggingface_hub import snapshot_download
    model_path = snapshot_download(cfg['model'], local_files_only=True)
    manifest_path = ROOT / 'work/voice-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    chosen = set(args.only.split(',')) if args.only else set(cfg['lines'])
    if chosen - cfg['lines'].keys(): raise ValueError('Unknown narration ID')
    out = ROOT / 'assets/voice'; out.mkdir(parents=True, exist_ok=True)
    raw = ROOT / 'work/voice'; raw.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    signal.signal(signal.SIGALRM, expire)
    started = time.monotonic()
    model = None
    stale = []
    for lid, line in cfg['lines'].items():
        if lid not in chosen: continue
        spans_text = split_text(line['text'])
        tts_text = [spoken(t) for t in spans_text]
        prev = manifest.get(lid, {})
        seed = args.seed if args.seed is not None else prev.get('seed', 1)
        key = hashlib.sha256(json.dumps([cfg['model'], Path(model_path).name, cfg['speaker'], cfg['instruct'],
              line['text'], tts_text, seed, GAP, 'pipeline-v1'], ensure_ascii=False).encode()).hexdigest()
        if prev.get('hash') == key and (ROOT / prev['file']).exists():
            if hashlib.sha256((ROOT / prev['file']).read_bytes()).hexdigest() == prev.get('sha256'): continue
        if args.check:
            stale.append(lid)
            continue
        remaining = args.budget_seconds - (time.monotonic() - started)
        if remaining <= 0: raise TimeoutError('Configured batch time limit reached')
        signal.alarm(max(1, min(180, int(remaining))))
        if model is None:
            model_config = json.loads((Path(model_path) / 'config.json').read_text())
            if cfg.get('instruct') and model_config.get('tts_model_size') == '0b6':
                raise RuntimeError('Qwen 0.6B ignores style instructions. Explicitly remove the instruction for legacy synthesis, or use a verified controllable model; do not silently claim style control.')
            from qwen_tts import Qwen3TTSModel
            if args.device.startswith('cuda') and not torch.cuda.is_available():
                raise RuntimeError('CUDA unavailable; no implicit CPU/cloud fallback')
            model = Qwen3TTSModel.from_pretrained(model_path, device_map=args.device,
                dtype=torch.bfloat16 if args.device.startswith('cuda') else torch.float32,
                attn_implementation='sdpa', local_files_only=True)
            print(f'Model loaded on {args.device}', flush=True)
        chunks, spans, cur = [], [], 0.
        for i, (display, tts) in enumerate(zip(spans_text, tts_text)):
            remaining = args.budget_seconds - (time.monotonic() - started)
            if remaining <= 0: raise TimeoutError('Configured batch time limit reached')
            signal.alarm(max(1, min(180, int(remaining))))
            torch.manual_seed(seed * 1000 + i)
            wavs, sr = model.generate_custom_voice(text=tts, language='Chinese',
                speaker=cfg['speaker'], instruct=cfg['instruct'], max_new_tokens=2048)
            a = trim_level(wavs[0], sr)
            if len(a) / sr > max(20, len(display) * 1.2): raise ValueError(f'{lid}: suspiciously long audio')
            if chunks: chunks.append(np.zeros(round(sr * GAP), np.float32)); cur += GAP
            spans.append({'text': display, 'start': round(cur, 4), 'end': round(cur + len(a) / sr, 4)})
            chunks.append(a); cur += len(a) / sr
        signal.alarm(0)
        wav = raw / f'{lid}.wav'
        sf.write(wav, np.concatenate(chunks), sr, subtype='PCM_16')
        target = out / f'{lid}-{key[:12]}.mp3'
        encoded = target.with_name(target.stem + '.tmp.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ac', '1',
            '-codec:a', 'libmp3lame', '-b:a', '64k', str(encoded)], check=True, timeout=30)
        encoded.replace(target)
        manifest[lid] = {'file': str(target.relative_to(ROOT)), 'duration': round(cur, 4),
            'sentences': spans, 'text': line['text'], 'hash': key,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'seed': seed}
        data = json.dumps(manifest, ensure_ascii=False, indent=2)
        manifest_temp = manifest_path.with_suffix('.tmp')
        manifest_temp.write_text(data + '\n')
        manifest_temp.replace(manifest_path)
        generated = ROOT / 'src/narration-data.js'
        temp = generated.with_suffix('.tmp')
        temp.write_text('// Generated locally; see tools/voice-gen.py.\nexport const NARRATION = ' + data + ';\n')
        temp.replace(generated)
        print(f'{lid}: {cur:.2f}s, {len(spans)} sentences; elapsed {time.monotonic()-started:.0f}s', flush=True)
    if args.check:
        print(json.dumps({'staleOrMissing': stale, 'checked': len(chosen)}, ensure_ascii=False))
        if stale: raise SystemExit(1)
    else:
        print('Requested recordings complete', flush=True)

if __name__ == '__main__': main()
