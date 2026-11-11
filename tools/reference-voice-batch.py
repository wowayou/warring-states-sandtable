"""Stage a bounded full narration pass using the user's accepted reference.

No network, one GPU worker, <=180 seconds/attempt, <=2 attempts/chunk.
--plan performs no inference. Generated files stay staged until activation.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import argparse, fcntl, hashlib, json, re, signal, subprocess, time
from pathlib import Path
from pronunciation import spoken

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'work/reference-voice'
GAP = .22
BASE_SEED = 1606
PIPELINE = 'reference-paragraph-v1'

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)

def chunks_for(text):
    # Combine complete short phrases where possible, keeping their context.
    # Preserve every display character while bounding the actual spoken length.
    parts = re.findall(r'[^。！？；，]+[。！？；，]?', text)
    chunks, current = [], ''
    for part in parts:
        if current and len(spoken(current + part)) > 48:
            chunks.append(current); current = ''
        current += part
        if len(spoken(current)) >= 28 and current[-1:] in '。！？；':
            chunks.append(current); current = ''
    if current: chunks.append(current)
    if ''.join(chunks) != text: raise ValueError('Narration splitting changed the display text')
    if any(len(spoken(chunk)) > 80 for chunk in chunks): raise ValueError('A phrase is too long; split it at a meaningful pause')
    return chunks

def identity(cfg, reference, text, reading_override=None):
    return hashlib.sha256(json.dumps([PIPELINE, cfg['model'], cfg['revision'], reference['sha256'],
        reference['text'], text, spoken(text) if reading_override is None else reading_override,
        BASE_SEED, GAP, .9], ensure_ascii=False).encode()).hexdigest()

def reading_override(cfg, key, index=None):
    values = cfg.get('readingOverrides', {}).get(key)
    return values if index is None else (values or {}).get(str(index))

def attempt_count(attempts, key, index):
    return sum(count for name, count in attempts.items() if name.startswith(f'{key}:{index}:'))

def expire(*_): raise TimeoutError('Local narration time limit reached; completed cache preserved')

def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--plan', action='store_true')
    mode.add_argument('--generate', action='store_true')
    mode.add_argument('--check', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--budget-seconds', type=int, default=7200)
    ap.add_argument('--retry-chunks', default='', help='explicit content-review retry, comma-separated clip-id:index; existing attempt caps apply')
    args = ap.parse_args()
    if not 1 <= args.budget_seconds <= 7200: ap.error('Budget must be 1..7200 seconds')
    cfg = json.loads((ROOT / 'work/reference-voice-input.json').read_text())
    overrides_path = STAGE / 'reading-overrides.json'
    if overrides_path.exists(): cfg['readingOverrides'] = json.loads(overrides_path.read_text())
    reference_path = ROOT / cfg['reference']
    reference = json.loads(reference_path.read_text())
    ref_audio = reference_path.parent / reference['file']
    if sha(ref_audio) != cfg['referenceSha256'] or cfg['referenceSha256'] != reference['sha256']:
        raise ValueError('The accepted reference changed')
    all_ids = list(cfg['lines'])
    chosen = set(args.only.split(',')) if args.only else set(all_ids)
    if chosen - set(all_ids): raise ValueError('Unknown clip IDs')
    chunk_lists = {key: chunks_for(cfg['lines'][key]['text']) for key in all_ids}
    for key, values in cfg.get('readingOverrides', {}).items():
        if key not in chunk_lists: raise ValueError('Unknown reading override clip')
        for index, value in values.items():
            if not index.isdigit() or int(index) >= len(chunk_lists[key]) or not isinstance(value, str) or not value.strip():
                raise ValueError('Invalid reviewed pronunciation override')
    retry_chunks = []
    if args.retry_chunks:
        if not args.generate or not args.only: ap.error('--retry-chunks requires --generate and explicit --only clips')
        for value in args.retry_chunks.split(','):
            key, index = value.rsplit(':', 1); index = int(index)
            if key not in chosen or not 0 <= index < len(chunk_lists[key]): raise ValueError('Invalid chunk retry selection')
            retry_chunks.append((key, index))
    plan = {'model': cfg['model'], 'revision': cfg['revision'], 'referenceSha256': reference['sha256'],
        'parts': len(all_ids), 'chunks': sum(len(v) for v in chunk_lists.values()),
        'spokenCharacters': sum(len(spoken(c)) for v in chunk_lists.values() for c in v),
        'maxChunkCharacters': max(len(spoken(c)) for v in chunk_lists.values() for c in v),
        'concurrency': 1, 'maxAttemptsPerChunk': 2, 'maxAttemptSeconds': 180,
        'maxRunSeconds': args.budget_seconds, 'pipeline': PIPELINE,
        'productionFilesChanged': False}
    save(STAGE / 'plan.json', plan)
    if args.plan:
        print(json.dumps(plan, ensure_ascii=False)); return
    manifest_path = STAGE / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    pending = []
    for key in all_ids:
        if key not in chosen: continue
        text = cfg['lines'][key]['text']
        fingerprint = identity(cfg, reference, text, reading_override(cfg, key))
        entry = manifest.get(key, {})
        path = ROOT / entry.get('file', 'missing')
        if key in {part for part, _ in retry_chunks} or entry.get('hash') != fingerprint or not path.is_file() or sha(path) != entry.get('sha256'):
            pending.append(key)
    if args.check:
        print(json.dumps({'checked': len(chosen), 'missingOrStale': pending}, ensure_ascii=False))
        if pending: raise SystemExit(1)
        return
    if not pending:
        print('Selected narration clips already cached'); return

    STAGE.mkdir(parents=True, exist_ok=True)
    with (STAGE / 'generation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if retry_chunks:
            attempts = json.loads((STAGE / 'attempts.json').read_text())
            for key, index in retry_chunks:
                if attempt_count(attempts, key, index) >= 2:
                    raise RuntimeError(f'{key}/{index}: no remaining authorized attempt')
            archive = STAGE / 'reviewed-takes'; archive.mkdir(exist_ok=True)
            for key, index in retry_chunks:
                for path in (STAGE / 'chunks').glob(f'{key}-{index}-*'):
                    if path.suffix in ['.wav', '.json']: path.replace(archive / path.name)
                manifest.pop(key, None)
            save(manifest_path, manifest)
        budget_path = STAGE / 'budget.json'
        budget = json.loads(budget_path.read_text()) if budget_path.exists() else {'limitSeconds': 7200, 'chargedSeconds': 0, 'runs': []}
        remaining = budget['limitSeconds'] - budget['chargedSeconds']
        allowance = min(args.budget_seconds, remaining)
        if allowance < 1: raise RuntimeError('Cumulative authorized generation budget exhausted')
        run = {'reservedSeconds': allowance, 'status': 'reserved'}
        budget['runs'].append(run)
        budget['chargedSeconds'] += allowance
        save(budget_path, budget)
        started = time.monotonic()
        try:
            generate_pending(cfg, reference, ref_audio, chunk_lists, all_ids, pending, manifest,
                manifest_path, allowance, started)
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            spent = min(allowance, time.monotonic() - started)
            run.update({'status': 'finished', 'spentSeconds': round(spent, 3)})
            budget['chargedSeconds'] = round(budget['chargedSeconds'] - allowance + spent, 3)
            save(budget_path, budget)


def generate_pending(cfg, reference, ref_audio, chunk_lists, all_ids, pending, manifest,
                     manifest_path, budget_seconds, started):
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    if not torch.cuda.is_available(): raise RuntimeError('CUDA unavailable; no implicit fallback')
    model_path = ROOT / 'work/models' / cfg['model'].split('/')[-1] / cfg['revision']
    signal.signal(signal.SIGALRM, expire)
    def arm():
        left = budget_seconds - (time.monotonic() - started)
        if left <= 0: raise TimeoutError('Batch limit reached; completed cache preserved')
        signal.setitimer(signal.ITIMER_REAL, min(180, left))
    arm(); torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(str(model_path), device_map='cuda:0', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True)
    if model.model.tts_model_type != 'base': raise ValueError('Wrong model type for accepted voice')
    waveform, sample_rate = sf.read(ref_audio, dtype='float32')
    prompt = model.create_voice_clone_prompt(ref_audio=(waveform, sample_rate), ref_text=reference['text'])
    original_generate = model.model.generate
    def bounded_generation(**kwargs):
        result = original_generate(**kwargs)
        if any(int(code.shape[0]) >= kwargs['max_new_tokens']-1 for code in result[0]):
            raise ValueError('Generation reached token limit')
        return result
    model.model.generate = bounded_generation
    attempts_path = STAGE / 'attempts.json'
    attempts = json.loads(attempts_path.read_text()) if attempts_path.exists() else {}
    chunk_dir = STAGE / 'chunks'; chunk_dir.mkdir(parents=True, exist_ok=True)
    audio_dir = STAGE / 'audio'; audio_dir.mkdir(exist_ok=True)
    for key in pending:
        text = cfg['lines'][key]['text']
        fingerprint = identity(cfg, reference, text, reading_override(cfg, key))
        arrays, cues, duration = [], [], 0.
        for index, display in enumerate(chunk_lists[key]):
            override = reading_override(cfg, key, index)
            chunk_hash = identity(cfg, reference, display, override)
            wav_path = chunk_dir / f'{key}-{index}-{chunk_hash[:12]}.wav'
            meta_path = wav_path.with_suffix('.json')
            chunk_key = f'{key}:{index}:{chunk_hash}'
            valid = False
            if wav_path.exists() and meta_path.exists():
                meta = json.loads(meta_path.read_text())
                valid = meta.get('sha256') == sha(wav_path)
            if valid:
                samples, sr = sf.read(wav_path, dtype='float32')
            else:
                while True:
                    attempt = attempt_count(attempts, key, index)
                    if attempt >= 2: raise RuntimeError(f'{key}/{index}: two attempts exhausted')
                    attempts[chunk_key] = attempts.get(chunk_key, 0) + 1; save(attempts_path, attempts)
                    arm(); torch.manual_seed(BASE_SEED + attempt)
                    try:
                        wavs, sr = model.generate_voice_clone(text=override or spoken(display), language='Chinese',
                            voice_clone_prompt=prompt, non_streaming_mode=True, temperature=.9,
                            max_new_tokens=min(480, max(240, len(spoken(display)) * 8)))
                        samples = np.asarray(wavs[0], dtype=np.float32)
                        if not len(samples) or not np.isfinite(samples).all(): raise ValueError('Invalid waveform')
                        envelope = np.convolve(np.abs(samples), np.ones(int(sr*.01))/int(sr*.01), mode='same')
                        active = np.flatnonzero(envelope > 10**(-42/20))
                        if not len(active): raise ValueError('Silent waveform')
                        trailing = (len(samples) - active[-1]) / sr
                        if trailing > 2: raise ValueError('Unexpected long silent tail')
                        samples = samples[max(0, active[0]-int(.06*sr)):min(len(samples), active[-1]+int(.1*sr))]
                        seconds = len(samples)/sr
                        if not max(.3, len(spoken(display))/15) < seconds < max(15, len(spoken(display))*.8):
                            raise ValueError('Suspicious speaking duration')
                        sf.write(wav_path, samples, sr, subtype='PCM_16')
                        save(meta_path, {'sha256': sha(wav_path), 'text': display, 'spokenText': override or spoken(display), 'attempt': attempt + 1})
                        break
                    except (TimeoutError, ValueError) as error:
                        print(f'{key}/{index}: attempt {attempt+1} failed: {error}', flush=True)
                        if attempt + 1 >= 2: raise
            if arrays: arrays.append(np.zeros(round(sr * GAP), np.float32)); duration += GAP
            cues.append({'text': display, 'start': round(duration, 4), 'end': round(duration + len(samples)/sr, 4)})
            arrays.append(samples); duration += len(samples)/sr
        arm()
        paragraph = STAGE / f'{key}.wav'; sf.write(paragraph, np.concatenate(arrays), sr, subtype='PCM_16')
        target = audio_dir / f'{key}-{fingerprint[:12]}.mp3'
        temporary = target.with_suffix('.tmp.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(paragraph), '-af', 'loudnorm=I=-20:TP=-2:LRA=7',
            '-ar', '24000', '-ac', '1', '-b:a', '64k', '-metadata', 'title=AI合成历史讲解',
            '-metadata', f'comment={cfg["disclosure"]}', str(temporary)], check=True, timeout=30)
        temporary.replace(target)
        manifest[key] = {'file': str(target.relative_to(ROOT)), 'duration': round(duration, 4),
            'sentences': cues, 'text': text, 'hash': fingerprint, 'sha256': sha(target),
            'voiceProfile': 'accepted-reference-v1', 'referenceSha256': reference['sha256'],
            'modelRevision': cfg['revision'], 'disclosure': cfg['disclosure'],
            **({'readingOverrides': reading_override(cfg, key)} if reading_override(cfg, key) else {})}
        save(manifest_path, manifest)
        print(f'{key}: {duration:.2f}s, {len(cues)} chunks; {len(manifest)}/{len(all_ids)} cached, elapsed {time.monotonic()-started:.0f}s', flush=True)
    signal.setitimer(signal.ITIMER_REAL, 0)
    print('Selected narration staged; production manifest not changed', flush=True)

if __name__ == '__main__': main()
