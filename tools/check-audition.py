"""Read-only local screening for the two replacement-voice samples.

Screens content, decoding and unexpected silence; does not assess style.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
import argparse, difflib, hashlib, json, re, signal, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/asr-deps'))
import numpy as np
from faster_whisper import WhisperModel
from huggingface_hub.constants import HF_HUB_CACHE
from pypinyin import lazy_pinyin
from pronunciation import spoken, cn

def expire(*_): raise TimeoutError('Audition screening exceeded 240 seconds')

def phonetic(text):
    text = re.sub(r'\d{1,3}', lambda match: cn(int(match[0])), text)
    return lazy_pinyin(re.sub(r'[^\u3400-\u9fff]', '', text))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reference', action='store_true', help='check the single reference-conditioned sample')
    args = ap.parse_args()
    signal.signal(signal.SIGALRM, expire); signal.alarm(240)
    folder = ROOT / ('work/revision-4' if args.reference else 'work/revision-3/voices')
    report = json.loads((folder / 'report.json').read_text())
    if args.reference: report = {'clips': [{'id': 'reference', **report}]}
    if len(report['clips']) != (1 if args.reference else 2): raise ValueError('Unexpected number of voice samples')
    cache = Path(HF_HUB_CACHE) / 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo'
    model = WhisperModel(str(cache / 'snapshots' / (cache / 'refs/main').read_text().strip()),
        device='cpu', compute_type='int8', cpu_threads=3, num_workers=1)
    checks = []
    for clip in report['clips']:
        path = folder / clip['file']
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '16000',
            '-f', 'f32le', '-'], capture_output=True, check=True, timeout=20).stdout
        audio = np.frombuffer(pcm, np.float32)
        if not np.isfinite(audio).all(): raise ValueError('Invalid decoded audio')
        duration = len(audio) / 16000
        if not 1 < duration <= (20 if args.reference else 30) or abs(duration - clip['duration']) > .06:
            raise ValueError('Duration outside sample bounds')
        envelope = np.sqrt(np.mean(audio[:len(audio)//320*320].reshape(-1, 320) ** 2, axis=1))
        speech = np.flatnonzero(envelope > 10 ** (-42/20))
        if not len(speech): raise ValueError('Sample is silent')
        tail = float(max(0, duration - (speech[-1]+1)*.02))
        segments, _ = model.transcribe(audio, language='zh', condition_on_previous_text=False, beam_size=3)
        segments = list(segments)
        heard = ''.join(s.text for s in segments)
        expected = phonetic(spoken(clip['text']))
        actual = phonetic(heard)
        score = difflib.SequenceMatcher(None, expected, actual, autojunk=False).ratio()
        checks.append({'id': clip['id'], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'decodedSeconds': round(duration, 3), 'peak': float(np.max(np.abs(audio))),
            'tailSilenceSeconds': round(tail, 3), 'text': clip['text'], 'asr': heard,
            'phoneticSimilarity': round(score, 4), 'needsContentReview': bool(score < .9 or tail > 1),
            'subjectiveStyleAccepted': False})
        (folder / 'checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps(checks[-1], ensure_ascii=False), flush=True)
    signal.alarm(0)

if __name__ == '__main__': main()
