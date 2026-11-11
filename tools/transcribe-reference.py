"""Bounded local transcript screening; no voice generation or identity verdict."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
import argparse, json, signal, subprocess
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
from huggingface_hub.constants import HF_HUB_CACHE

def expire(*_): raise TimeoutError('Reference transcript check exceeded 180 seconds')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file', type=Path)
    ap.add_argument('--model', choices=['small', 'turbo'], default='turbo')
    args = ap.parse_args()
    signal.signal(signal.SIGALRM, expire); signal.alarm(180)
    cache = Path(HF_HUB_CACHE) / ('models--Systran--faster-whisper-small' if args.model == 'small'
        else 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo')
    model = WhisperModel(str(cache / 'snapshots' / (cache / 'refs/main').read_text().strip()),
        device='cpu', compute_type='int8', cpu_threads=3, num_workers=1)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(args.file), '-ac', '1', '-ar', '16000',
        '-f', 'f32le', '-'], capture_output=True, check=True, timeout=20).stdout
    waveform = np.frombuffer(pcm, np.float32)
    if len(waveform) > 45 * 16000: raise ValueError('Reference check limited to 45 seconds')
    segments, _ = model.transcribe(waveform, language='zh', word_timestamps=True,
        condition_on_previous_text=False, beam_size=3)
    rows = [{'start': s.start, 'end': s.end, 'text': s.text,
        'words': [{'start': w.start, 'end': w.end, 'text': w.word} for w in (s.words or [])]} for s in segments]
    args.file.with_suffix(f'.{args.model}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n')
    for row in rows: print(row['start'], row['end'], row['text'], flush=True)
    signal.alarm(0)

if __name__ == '__main__': main()
