"""One bounded reference-conditioned audition, explicitly labelled synthetic.

Requires a locally prepared reference.json and cached Base weights; no network
access, no paid services, no automatic retry or full narration replacement.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import hashlib, json, signal, subprocess, time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/revision-4'
MODEL_NAME = 'Qwen3-TTS-12Hz-0.6B-Base'
REVISION = '5d83992436eae1d760afd27aff78a71d676296fc'
TEXT = '公元前二百六十年，秦赵两军对峙长平。廉颇坚守不出，战局一时难分胜负。'
TTS_TEXT = '公元前二百六十年，秦赵两军对峙长平。廉颇坚守不出，战局一时难分胜负。'

def expire(*_): raise TimeoutError('Reference audition reached its local inference time limit')

def main():
    signal.signal(signal.SIGALRM, expire); signal.alarm(580)
    started = time.monotonic()
    config_path = OUT / 'reference/reference.json'
    if not config_path.exists(): raise RuntimeError('A sourced reference clip and checked transcript are required first')
    ref = json.loads(config_path.read_text())
    if not ref.get('text', '').strip() or not ref.get('source', '').strip():
        raise ValueError('Reference transcript and source provenance are required')
    path = config_path.parent / ref['file']
    if hashlib.sha256(path.read_bytes()).hexdigest() != ref['sha256']:
        raise ValueError('Reference audio changed after preparation')
    waveform, sr = sf.read(path, dtype='float32')
    if waveform.ndim != 1 or not np.isfinite(waveform).all(): raise ValueError('Expected finite mono reference audio')
    if not 3 <= len(waveform) / sr <= 20: raise ValueError('Reference must be 3–20 seconds')
    model_path = ROOT / 'work/models' / MODEL_NAME / REVISION
    if not (model_path / 'model.safetensors').exists(): raise RuntimeError('Approved Base model has not been cached')
    if (OUT / 'attempt.json').exists(): raise RuntimeError('One-shot audition already attempted; no automatic retry')
    if not torch.cuda.is_available(): raise RuntimeError('Local GPU unavailable; no cloud fallback')
    (OUT / 'attempt.json').write_text(json.dumps({'model': MODEL_NAME, 'revision': REVISION,
        'referenceSha256': ref['sha256'], 'text': TEXT, 'maxAudioSeconds': 20, 'maxInferenceSeconds': 600}, ensure_ascii=False, indent=2)+'\n')
    torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(str(model_path), device_map='cuda:0', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True)
    if model.model.tts_model_type != 'base': raise RuntimeError('Reference conditioning requires a Base model')
    original_generate = model.model.generate
    def bounded_generation(**kwargs):
        result = original_generate(**kwargs)
        if any(int(codes.shape[0]) >= kwargs['max_new_tokens']-1 for codes in result[0]):
            raise RuntimeError('Sample hit length limit; do not publish incomplete narration')
        return result
    model.model.generate = bounded_generation
    torch.manual_seed(1606)
    wavs, output_sr = model.generate_voice_clone(text=TTS_TEXT, language='Chinese',
        ref_audio=(waveform, sr), ref_text=ref['text'], x_vector_only_mode=False,
        non_streaming_mode=True, temperature=.9, max_new_tokens=240)
    audio = np.asarray(wavs[0], dtype=np.float32)
    duration = len(audio) / output_sr
    if not np.isfinite(audio).all() or not 3 <= duration <= 20 or np.max(np.abs(audio)) < .001:
        raise ValueError('Sample outside requested duration or invalid audio')
    raw = OUT / 'reference-audition-raw.wav'
    sf.write(raw, audio, output_sr, subtype='PCM_16')
    target = OUT / 'reference-audition.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', 'loudnorm=I=-20:TP=-2:LRA=7',
        '-ar', '24000', '-ac', '1', '-b:a', '96k',
        '-metadata', 'title=AI合成试听（非单田芳原录音）',
        '-metadata', 'comment=本地参考声线实验；新文稿由AI合成，相似度待试听确认。', str(target)], check=True, timeout=20)
    report = {'model': MODEL_NAME, 'revision': REVISION, 'text': TEXT, 'file': target.name,
        'duration': round(duration, 3), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'reference': ref, 'elapsedSeconds': round(time.monotonic()-started, 2),
        'disclosure': 'AI合成新文稿；不是单田芳先生的原始录音。',
        'likenessAccepted': False, 'productionNarrationReplaced': False}
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False), flush=True)
    signal.alarm(0)

if __name__ == '__main__': main()
