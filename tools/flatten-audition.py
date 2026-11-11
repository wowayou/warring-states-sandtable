"""Rework one existing sample on CPU; no TTS calls or new voice identity.

Flatten the slow phrase contour while retaining faster Mandarin tone movement.
Acoustic measurements describe the processing, not subjective voice quality.
"""
import json, signal, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/audio-control-deps'))
import numpy as np
import soundfile as sf
import pyworld
from scipy.ndimage import gaussian_filter1d

def expire(*_): raise TimeoutError('CPU sample processing exceeded 180 seconds')

def main():
    signal.signal(signal.SIGALRM, expire); signal.alarm(180)
    folder = ROOT / 'work/revision-2/audition'
    raw, sr = sf.read(folder / 'opening-raw.wav', dtype='float64')
    if raw.ndim != 1: raise ValueError('Expected mono source')
    f0, times = pyworld.harvest(raw, sr, f0_floor=65, f0_ceil=400, frame_period=5)
    f0 = pyworld.stonemask(raw, f0, times, sr)
    voiced = f0 > 0
    if voiced.sum() < 100: raise ValueError('Too little voiced speech for reliable processing')
    indices = np.arange(len(f0))
    logf0 = np.interp(indices, indices[voiced], np.log2(f0[voiced]))
    slow = gaussian_filter1d(logf0, sigma=.60 / .005)
    center = np.median(logf0[voiced])
    # Most sentence-level rises disappear. Local tonal direction is retained;
    # do not flatten all voiced frames to one frequency, which harms Chinese.
    fast = logf0 - slow
    controlled = center - 1 / 12 + .12 * (slow - center) + .82 * fast
    controlled = np.clip(controlled, center - 5 / 12, center + 4 / 12)
    revised = np.zeros_like(f0)
    revised[voiced] = np.exp2(controlled[voiced])
    spectrum = pyworld.cheaptrick(raw, f0, times, sr)
    aperiodicity = pyworld.d4c(raw, f0, times, sr)
    resynth = pyworld.synthesize(revised, spectrum, aperiodicity, sr, frame_period=5)
    if not np.isfinite(resynth).all(): raise ValueError('Nonfinite processed waveform')
    peak = np.max(np.abs(resynth))
    if peak > .85: resynth *= .85 / peak
    intermediate = folder / 'opening-controlled.wav'
    sf.write(intermediate, resynth, sr, subtype='PCM_16')
    output = folder / 'opening-controlled.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(intermediate), '-af',
        'acompressor=threshold=0.10:ratio=2.5:attack=40:release=240:makeup=1,atempo=0.96,loudnorm=I=-20:TP=-2:LRA=5',
        '-ar', '24000', '-ac', '1', '-b:a', '96k', str(output)], check=True, timeout=20)
    spread = lambda x: float((np.percentile(x, 90) - np.percentile(x, 10)) * 12)
    duration = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1', str(output)], capture_output=True, text=True, check=True, timeout=10).stdout)
    report = {'source': 'opening-raw.wav', 'file': output.name, 'duration': duration,
        'method': 'WORLD resynthesis; phrase contour gain0.12, local tone residual gain0.82, median shift-1semitone; compression and tempo0.96',
        'inputPhraseRangeSemitones': round(spread(slow[voiced]), 3),
        'targetPhraseRangeSemitones': round(spread(.12 * slow[voiced]), 3),
        'inputTotalPitchRangeSemitones': round(spread(logf0[voiced]), 3),
        'targetTotalPitchRangeSemitones': round(spread(controlled[voiced]), 3),
        'subjectiveAcceptance': 'pending user listening',
        'risk': 'Signal processing may change timbre; preserving pitch direction does not prove Mandarin tone accuracy.'}
    (folder / 'controlled-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False), flush=True)
    signal.alarm(0)

if __name__ == '__main__': main()
