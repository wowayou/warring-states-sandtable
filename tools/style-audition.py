"""Approved audition only: two clips, <=60s audio, <=600s local inference.

The 1.7B talker uses NF4 on the local GPU; the audio decoder stays full precision
on CPU to fit a 4GB GPU. This script never updates production voice files.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import argparse, json, signal, subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/style-deps'))
import numpy as np
import soundfile as sf
import torch
from transformers import BitsAndBytesConfig
from qwen_tts import Qwen3TTSModel
from qwen_tts.inference.qwen3_tts_tokenizer import Qwen3TTSTokenizer
from pronunciation import spoken

REVISION = '0c0e3051f131929182e2c023b9537f8b1c68adfe'
MODEL = ROOT / 'work/models/Qwen3-TTS-12Hz-1.7B-CustomVoice' / REVISION
OUT = ROOT / 'work/revision-2/audition'
INSTRUCTION = ('中文历史纪录片的专业男声旁白，沉稳的男中音，中低音区，厚实清晰。'
    '平静、客观、克制地陈述历史，连续叙述，语速舒缓而均匀。'
    '少重音，音高变化小，句尾自然下降，段落之间自然停顿。'
    '不要角色表演，不要激动、惊讶、愤怒、悲哭，不要忽然拔高嗓音，不要广告式抑扬顿挫。')

def expired(_signum, _frame): raise TimeoutError('Approved 10-minute local audition limit reached')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--budget-seconds', type=int, default=600)
    ap.add_argument('--palette', choices=['uncle-fu', 'alternative-voices'], default='uncle-fu')
    ap.add_argument('--short', action='store_true', help='one bounded shorter-text recovery for alternative voices')
    args = ap.parse_args()
    if not 20 <= args.budget_seconds <= 600: ap.error('audition budget must be 20..600 seconds')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(args.budget_seconds - 10)
    started = time.monotonic()
    out = OUT if args.palette == 'uncle-fu' else ROOT / 'work/revision-3/voices'
    instruction = INSTRUCTION if args.palette == 'uncle-fu' else (
        '用标准普通话作平实的历史解说。语速适中均匀，声线自然，情绪中性，停顿轻，句尾平稳落下。')
    out.mkdir(parents=True, exist_ok=True)
    if args.short and args.palette != 'alternative-voices': ap.error('--short is only for alternative voices')
    attempt = out / ('attempt-short.json' if args.short else 'attempt.json')
    if attempt.exists() or (out / 'report.json').exists(): raise RuntimeError('Audition already attempted; do not silently repeat generation')
    attempt.write_text(json.dumps({'model': str(MODEL), 'palette': args.palette, 'short': args.short,
        'instruction': instruction, 'limitSeconds': args.budget_seconds}, ensure_ascii=False, indent=2))
    if not torch.cuda.is_available(): raise RuntimeError('Local GPU unavailable; no cloud fallback')
    torch.set_num_threads(4)
    # Keep the codec in full precision. A separate wrapper is necessary because
    # upstream otherwise forwards the talker's quantization settings to it.
    load_codec = Qwen3TTSTokenizer.from_pretrained.__func__
    def cpu_codec(cls, path, **kwargs):
        kwargs.pop('quantization_config', None)
        kwargs['device_map'] = 'cpu'
        kwargs['dtype'] = torch.float32
        return load_codec(cls, path, **kwargs)
    Qwen3TTSTokenizer.from_pretrained = classmethod(cpu_codec)
    model = Qwen3TTSModel.from_pretrained(str(MODEL), device_map='cuda:0', dtype=torch.bfloat16,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
            bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16,
            llm_int8_skip_modules=['codec_head', 'lm_head']),
        attn_implementation='sdpa', local_files_only=True)
    assert model.model.tts_model_size == '1b7', 'Style instructions require the controllable model'
    print(f'Loaded controllable 1.7B, {torch.cuda.memory_allocated()/1e9:.2f}GB GPU allocated', flush=True)
    lines = json.loads((ROOT / 'work/voice-input.json').read_text())['lines']
    pieces = [
        ('opening', '开场', 'Uncle_Fu', lines['act-I']['text']),
        ('battle', '长平之战', 'Uncle_Fu', '。'.join(lines[f'battle-changping-{suffix}']['text'].rstrip('。')
            for suffix in ['intro', 'step-1', 'step-2', 'step-3', 'step-4']) + '。'),
    ]
    if args.palette == 'alternative-voices':
        text = lines['act-I']['text']
        if args.short: text = '春秋的霸主秩序散了。三家分晋、田氏专齐，卿大夫取代诸侯成为主角。'
        pieces = [('dylan', 'Dylan · 男声', 'Dylan', text),
                  ('serena', 'Serena · 女声', 'Serena', text)]
    report = {'model': 'Qwen3-TTS-12Hz-1.7B-CustomVoice', 'revision': REVISION,
        'palette': args.palette, 'instruction': instruction,
        'quantization': 'NF4 talker / float32 CPU codec',
        'postProcessing': 'paragraph loudness normalization only; no pitch or tempo changes', 'clips': []}
    generate = model.model.generate
    def with_verified_style(**kwargs):
        instructions = kwargs.get('instruct_ids')
        assert instructions and all(x is not None and x.numel() > 0 for x in instructions), 'Style instruction was discarded'
        report['styleInstructionTokens'] = [int(x.numel()) for x in instructions]
        result = generate(**kwargs)
        lengths = [int(codes.shape[0]) for codes in result[0]]
        if any(n >= kwargs['max_new_tokens'] - 1 for n in lengths):
            raise RuntimeError('Generation reached its token limit; do not publish a truncated or silent-tail result as complete narration')
        return result
    model.model.generate = with_verified_style
    total = 0
    for i, (key, title, speaker, text) in enumerate(pieces):
        torch.manual_seed(1205 + i)
        natural = args.palette == 'alternative-voices'
        audio, sr = model.generate_custom_voice(text=spoken(text), language='Chinese', speaker=speaker,
            instruct=instruction, temperature=.9 if args.short else .65 if natural else .45,
            top_p=1.0 if args.short else .9 if natural else .8, top_k=50 if args.short else 40 if natural else 30,
            subtalker_temperature=.9 if args.short else .8 if natural else .5,
            subtalker_top_p=1.0 if args.short else .95 if natural else .85, max_new_tokens=300 if args.short else 360)
        a = np.asarray(audio[0], dtype=np.float32)
        if not np.isfinite(a).all() or np.max(np.abs(a)) < .001: raise ValueError('Invalid sample')
        duration = len(a) / sr
        if duration > 30 or duration < len(text) / 12: raise ValueError('Unexpected sample duration; no automatic retry')
        total += duration
        if total > 60: raise RuntimeError('Approved audio length limit exceeded')
        raw = out / f'{key}-raw.wav'
        sf.write(raw, a, sr, subtype='PCM_16')
        target = out / f'{key}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af',
            'loudnorm=I=-20:TP=-2:LRA=7', '-ar', '24000', '-ac', '1', '-b:a', '96k', str(target)],
            check=True, timeout=20)
        report['clips'].append({'id': key, 'title': title, 'speaker': speaker,
            'text': text, 'file': target.name, 'duration': round(duration, 3)})
        report['elapsedSeconds'] = round(time.monotonic() - started, 2)
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(f'{key}: {duration:.2f}s audio, total elapsed {time.monotonic()-started:.0f}s', flush=True)
    signal.alarm(0)
    print('Two local audition clips completed; production audio unchanged.', flush=True)

if __name__ == '__main__': main()
