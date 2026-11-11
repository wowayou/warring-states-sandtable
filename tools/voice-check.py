"""Offline ASR screening only; not proof of pronunciation or human listening.

One CPU worker, cached Whisper small, <=180s/clip and <=30min/run.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
import argparse, difflib, json, re, signal, subprocess, time
import numpy as np
from pathlib import Path
from faster_whisper import WhisperModel
from huggingface_hub.constants import HF_HUB_CACHE

ROOT = Path(__file__).resolve().parents[1]
def timeout(_signum, _frame): raise TimeoutError('ASR screening time limit reached')
def norm(text): return re.sub(r'[^\w]', '', text.lower())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--model', choices=['small', 'turbo'], default='small')
    ap.add_argument('--staged', action='store_true')
    ap.add_argument('--budget-seconds', type=int, default=1800)
    args = ap.parse_args()
    if not 1 <= args.budget_seconds <= 1800: ap.error('Budget must be 1..1800 seconds')
    directory = ROOT / ('work/reference-voice' if args.staged else 'work')
    manifest = json.loads((directory / ('manifest.json' if args.staged else 'voice-manifest.json')).read_text())
    target = directory / f'asr-{args.model}-report.json'
    report = json.loads(target.read_text()) if target.exists() else {}
    only = set(args.only.split(',')) if args.only else set(manifest)
    if only - manifest.keys(): raise ValueError('Unknown or not-yet-generated narration ID')
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(180)
    cache = Path(HF_HUB_CACHE) / ('models--Systran--faster-whisper-small' if args.model == 'small'
        else 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo')
    model_dir = cache / 'snapshots' / (cache / 'refs/main').read_text().strip()
    model = WhisperModel(str(model_dir),
        device='cpu', compute_type='int8', cpu_threads=4, num_workers=1)
    start = time.monotonic()
    processed = 0
    for lid, item in manifest.items():
        if lid not in only or report.get(lid, {}).get('sha256') == item['sha256']: continue
        remaining = args.budget_seconds - (time.monotonic() - start)
        if remaining <= 0: raise TimeoutError('Thirty-minute screening limit reached')
        signal.alarm(max(1, min(180, int(remaining))))
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ROOT / item['file']), '-ac', '1',
            '-ar', '16000', '-f', 'f32le', '-'], check=True, capture_output=True, timeout=30).stdout
        segments, _ = model.transcribe(np.frombuffer(pcm, np.float32), language='zh', beam_size=3,
            initial_prompt='战国历史。', word_timestamps=True, condition_on_previous_text=False)
        segments = list(segments)
        heard = ''.join(s.text for s in segments)
        score = difflib.SequenceMatcher(None, norm(item['text']), norm(heard), autojunk=False).ratio()
        report[lid] = {'model': args.model, 'text': item['text'], 'asr': heard, 'similarity': round(score, 4),
            'sha256': item['sha256'], 'review': score < .72,
            'segments': [{'text': s.text, 'start': s.start, 'end': s.end} for s in segments],
            'words': [{'text': w.word, 'start': w.start, 'end': w.end} for s in segments for w in (s.words or [])]}
        signal.alarm(0)
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(target)
        processed += 1
        print(f'{lid}: similarity={score:.3f} {heard}', flush=True)
    valid = {k:v for k,v in report.items() if k in manifest and v['sha256'] == manifest[k]['sha256']}
    print(f'Processed this run: {processed}; current audio reports: {len(valid)}; '
          f'low similarity (review hints, not proven errors): {[k for k,v in valid.items() if v["review"]]}', flush=True)

if __name__ == '__main__': main()
