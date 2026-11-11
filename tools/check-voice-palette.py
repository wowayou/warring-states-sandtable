"""Bounded, offline CPU screening of the three native voice-palette samples.

Uses the existing faster-whisper large-v3-turbo cache, with no expected-text
prompt. SHA, native decoding, duration, peak, silence tail and transcripts are
checked. ASR is not human listening, voice approval, or proof of correct tones.
"""
import argparse
import difflib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import sys
import time
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
spec = importlib.util.spec_from_file_location('voice_palette', ROOT / 'tools/voice-palette.py')
palette = importlib.util.module_from_spec(spec)
spec.loader.exec_module(palette)
STAGE = palette.STAGE
ASR_MODEL = 'mobiuslabsgmbh/faster-whisper-large-v3-turbo'
ASR_REVISION = '0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf'
ASR_PATH = Path.home() / '.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots' / ASR_REVISION
ASR_CONFIG = {'model': ASR_MODEL, 'revision': ASR_REVISION, 'device': 'cpu',
              'computeType': 'int8', 'cpuThreads': 3, 'numWorkers': 1,
              'language': 'zh', 'beamSize': 3, 'conditionOnPreviousText': False,
              'vadFilter': False, 'expectedTextPrompt': False,
              'phoneticSimilarityMinimum': palette.LIMITS['minPhoneticSimilarity'],
              'exactCharacterDifferencesRequireReview': True,
              'doesNotVerifyTonesOrSubjectiveVoiceQuality': True}


def normalize(text):
    return re.sub(r'[^\u3400-\u9fff0-9]', '', text)


def transcript_check(expected, heard, phonetic):
    """Separate exact characters from pinyin; never hide homophone differences."""
    a, b = normalize(expected), normalize(heard)
    characters = difflib.SequenceMatcher(None, a, b, autojunk=False)
    expected_pinyin, heard_pinyin = phonetic(expected), phonetic(heard)
    syllables = difflib.SequenceMatcher(None, expected_pinyin, heard_pinyin, autojunk=False)
    differences = [{'operation': op, 'expected': a[i:j], 'asr': b[k:l],
                    'expectedRange': [i, j], 'asrRange': [k, l]}
                   for op, i, j, k, l in characters.get_opcodes() if op != 'equal']
    phonetic_differences = [{'operation': op, 'expected': expected_pinyin[i:j], 'asr': heard_pinyin[k:l]}
                           for op, i, j, k, l in syllables.get_opcodes() if op != 'equal']
    score = syllables.ratio() if expected_pinyin and heard_pinyin else 0
    return {'asr': heard, 'normalizedExpected': a, 'normalizedAsr': b,
            'exactTextMatch': a == b and bool(b), 'textSimilarity': round(characters.ratio(), 4),
            'textDifferences': differences, 'expectedPinyin': expected_pinyin, 'asrPinyin': heard_pinyin,
            'phoneticSimilarity': round(score, 4), 'phoneticDifferences': phonetic_differences,
            'contentScreenPassed': bool(score >= palette.LIMITS['minPhoneticSimilarity']),
            'needsContentReview': bool(a != b or score < 1),
            'humanListeningPerformed': False, 'subjectiveStyleAccepted': False}


def pcm_metrics(pcm, sample_rate, np):
    if not len(pcm) or pcm.ndim != 1 or not np.isfinite(pcm).all():
        raise palette.Stopped('Invalid decoded PCM')
    duration = len(pcm) / sample_rate
    peak = float(np.max(np.abs(pcm)))
    frame = sample_rate // 50
    full = pcm[:len(pcm) // frame * frame]
    envelope = np.sqrt(np.mean(full.reshape(-1, frame) ** 2, axis=1))
    speech = np.flatnonzero(envelope > 10 ** (-42 / 20))
    if not len(speech) or peak < .001:
        raise palette.Stopped('Decoded sample is silent')
    tail = max(0, duration - (int(speech[-1]) + 1) * .02)
    return {'decodedSeconds': round(duration, 6), 'decodedSampleRate': sample_rate,
            'peak': peak, 'leadingSilenceSeconds': round(int(speech[0]) * .02, 6),
            'tailSilenceSeconds': round(tail, 6),
            'silentFrameFraction': round(float(np.mean(envelope <= 10 ** (-42 / 20))), 4),
            'silenceThresholdDbfs': -42, 'silenceFrameSeconds': .02,
            'mechanicalScreenPassed': bool(peak <= palette.LIMITS['maxDecodedPeak']
                                          and tail <= palette.LIMITS['maxTailSilenceSeconds'])}


def cached_checks(stage=STAGE):
    stage = Path(stage)
    report = palette.cached_generation(stage)
    budget, attempts = palette.load_state(stage)
    if budget['phases']['verification']['blocked']:
        raise palette.Stopped('CPU screening failed/interrupted; preserve checks and stop, no retry')
    summary = palette.read_json(stage / 'verification.json')
    checks = palette.read_json(stage / 'checks.json')
    if summary.get('status') != 'complete' or summary.get('asrConfig') != ASR_CONFIG \
            or summary.get('reportSha256') != palette.sha(stage / 'report.json') \
            or summary.get('checksSha256') != palette.sha(stage / 'checks.json') or len(checks) != 3:
        raise palette.Stopped('Missing, partial, changed or stale local checks; never rerun implicitly')
    for check, clip in zip(checks, report['clips']):
        if check.get('id') != clip['id'] or check.get('sha256') != clip['sha256'] \
                or not check.get('shaMatches') or check.get('rawSha256') != clip['rawSha256'] \
                or not check.get('rawShaMatches') or not check.get('mechanicalScreenPassed') \
                or not check.get('contentScreenPassed') or check.get('subjectiveStyleAccepted') is not False \
                or check.get('humanListeningPerformed') is not False:
            raise palette.Stopped('Cached screening does not match the completed audio/evidence')
        palette.validate_duration(check['decodedSeconds'], sum(c['decodedSeconds'] for c in checks))
        if abs(check['decodedSeconds'] - clip['duration']) > .06 \
                or check['peak'] > palette.LIMITS['maxDecodedPeak'] \
                or check['tailSilenceSeconds'] > palette.LIMITS['maxTailSilenceSeconds'] \
                or check['phoneticSimilarity'] < palette.LIMITS['minPhoneticSimilarity']:
            raise palette.Stopped('Cached checks exceed the fixed screening thresholds')
    matching_run = next((run for run in budget['phases']['verification']['runs']
                         if run['id'] == summary.get('verificationRunId')), None)
    if any(a['count'] != 1 or a['status'] != 'completed' for a in attempts['phases']['verification'].values()) \
            or matching_run is None or matching_run['status'] != 'completed':
        raise palette.Stopped('CPU screening attempts/reservation are not settled or do not match the summary')
    return summary, checks


def verification_worker(run_id, lock_fd):
    run = palette.worker_reservation('verification', run_id, lock_fd)
    deadline, active_key, checks = run['hardDeadlineMonotonic'], None, []
    try:
        report = palette.cached_generation()
        sys.path.insert(0, str(ROOT / 'work/asr-deps'))
        import numpy as np
        from faster_whisper import WhisperModel
        from pypinyin import lazy_pinyin
        from pronunciation import cn, spoken
        from importlib.metadata import version
        def phonetic(text):
            text = re.sub(r'\d{1,3}', lambda match: cn(int(match[0])), text)
            return lazy_pinyin(re.sub(r'[^\u3400-\u9fff]', '', text))
        hashes = {name: palette.sha(ASR_PATH / name, deadline) for name in
                  ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.json', 'preprocessor_config.json']}
        model = WhisperModel(str(ASR_PATH), device='cpu', compute_type='int8', cpu_threads=3,
                             num_workers=1, local_files_only=True)
        summary = palette.read_json(STAGE / 'verification.json')
        summary.update(asrModelPath=str(ASR_PATH), asrModelHashes=hashes,
                       runtime={'python': sys.version, 'fasterWhisper': version('faster-whisper'),
                                'ctranslate2': version('ctranslate2'), 'pypinyin': version('pypinyin'),
                                'offline': True, 'networkBlocked': True},
                       scriptSha256=palette.sha(Path(__file__)),
                       modelLoadedElapsedSeconds=round(time.monotonic() - run['startedMonotonic'], 3))
        palette.save(STAGE / 'verification.json', summary)
        total = 0
        for clip in report['clips']:
            active_key = clip['id']
            palette.seconds_left(deadline)
            palette.begin_attempt(STAGE, 'verification', active_key, run_id)
            started = time.monotonic()
            path, raw = STAGE / clip['file'], STAGE / clip['rawFile']
            actual_sha, raw_sha = palette.sha(path, deadline), palette.sha(raw, deadline)
            entry = {'id': active_key, 'speaker': clip['speaker'], 'text': clip['text'], 'file': clip['file'],
                     'sha256': actual_sha, 'shaMatches': actual_sha == clip['sha256'],
                     'rawSha256': raw_sha, 'rawShaMatches': raw_sha == clip['rawSha256'],
                     'modelRevision': palette.REVISION, 'asrRevision': ASR_REVISION,
                     'humanListeningPerformed': False, 'subjectiveStyleAccepted': False}
            if not entry['shaMatches'] or not entry['rawShaMatches']:
                raise palette.Stopped(f'{active_key}: sample SHA mismatch')
            with wave.open(str(raw), 'rb') as wav:
                if wav.getframerate() != 24000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2 \
                        or wav.getnframes() != clip['rawFrames']:
                    raise palette.Stopped('Unexpected raw WAV format/frames')
                entry['rawDecodedSeconds'] = round(wav.getnframes() / wav.getframerate(), 6)
            decoded = palette.bounded_subprocess(
                ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '24000', '-f', 'f32le', '-'],
                deadline, capture_output=True).stdout
            pcm = np.frombuffer(decoded, np.float32)
            entry.update(pcm_metrics(pcm, 24000, np))
            total += entry['decodedSeconds']
            palette.validate_duration(entry['decodedSeconds'], total)
            if abs(entry['decodedSeconds'] - clip['duration']) > .06 \
                    or abs(entry['rawDecodedSeconds'] - clip['duration']) > .00001:
                raise palette.Stopped('Decode duration does not match generated waveform')
            if not entry['mechanicalScreenPassed']:
                checks.append({**entry, 'status': 'failed', 'needsContentReview': True})
                palette.save(STAGE / 'checks.json', checks)
                raise palette.Stopped('Unexpected decoded peak or silent tail; do not publish/retry')
            # Analysis-only resampling; the published MP3 is unchanged.
            analysis_pcm = palette.bounded_subprocess(
                ['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
                 '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'],
                deadline, input=decoded, capture_output=True).stdout
            audio = np.frombuffer(analysis_pcm, np.float32)
            if not len(audio) or not np.isfinite(audio).all() or abs(len(audio) / 16000 - clip['duration']) > .06:
                raise palette.Stopped('Invalid ASR analysis PCM')
            segments, info = model.transcribe(audio, language='zh', condition_on_previous_text=False,
                                              beam_size=3, vad_filter=False, initial_prompt=None)
            segments = list(segments)  # the absolute external deadline covers lazy ASR evaluation
            heard = ''.join(segment.text for segment in segments)
            entry.update(transcript_check(spoken(clip['text']), heard, phonetic))
            entry.update(status='checked' if entry['contentScreenPassed'] else 'failed',
                         asrAnalysisSampleRate=16000, asrLanguage=info.language,
                         segments=[{'text': s.text, 'start': round(s.start, 3), 'end': round(s.end, 3)} for s in segments],
                         elapsedSeconds=round(time.monotonic() - started, 3))
            checks.append(entry)
            palette.save(STAGE / 'checks.json', checks)
            print(json.dumps(entry, ensure_ascii=False), flush=True)
            if not entry['contentScreenPassed']:
                raise palette.Stopped('Phonetic similarity below the fixed .9 threshold; stop for parent review')
            palette.update_attempt(STAGE, 'verification', active_key, status='completed', finishedAt=palette.utc(),
                                   sha256=actual_sha, phoneticSimilarity=entry['phoneticSimilarity'])
        summary.update(status='complete', clipsChecked=3, decodedTotalSeconds=round(total, 6),
                       requiresHumanContentReview=any(c['needsContentReview'] for c in checks),
                       requiresUserVoiceSelection=True, humanListeningPerformed=False, subjectiveStyleAccepted=False,
                       checksSha256=palette.sha(STAGE / 'checks.json'), completedAt=palette.utc())
        palette.save(STAGE / 'verification.json', summary)
    except BaseException as exc:
        if active_key:
            palette.update_attempt(STAGE, 'verification', active_key, status='failed', error=f'{type(exc).__name__}: {exc}')
        summary = palette.read_json(STAGE / 'verification.json')
        summary.update(status='failed', clipsChecked=len(checks), stoppedAt=palette.utc(),
                       error=f'{type(exc).__name__}: {exc}', requiresHumanContentReview=True)
        palette.save(STAGE / 'verification.json', summary)
        raise
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='the one bounded offline CPU screening pass')
    mode.add_argument('--check-cache', action='store_true', help='read-only cache/record check, no ASR model loading')
    mode.add_argument('--_worker', nargs=2, metavar=('RUN_ID', 'LOCK_FD'), help=argparse.SUPPRESS)
    args = ap.parse_args()
    if args._worker:
        verification_worker(args._worker[0], int(args._worker[1]))
        return
    def interrupted(*_):
        raise InterruptedError('CPU supervisor terminated; no retry')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    with palette.ExclusiveLock() as fd:
        budget, attempts = palette.load_state()
        palette.stop_abandoned()
        report = palette.cached_generation()
        if args.check_cache or (STAGE / 'verification.json').exists() or (STAGE / 'checks.json').exists():
            summary, checks = cached_checks()
            print(json.dumps({'status': 'cached', 'clipsChecked': len(checks), 'modelLoaded': False,
                              'newAttempts': 0, 'requiresHumanContentReview': summary['requiresHumanContentReview']}, ensure_ascii=False))
            return
        if budget['phases']['verification']['blocked'] or budget['phases']['verification']['runs'] \
                or any(a['count'] for a in attempts['phases']['verification'].values()):
            raise palette.Stopped('Existing CPU attempt/reservation without checks; never reset or repeat')
        palette.save(STAGE / 'checks.json', [])
        palette.save(STAGE / 'verification.json', {
            'status': 'checking', 'createdAt': palette.utc(), 'clipsExpected': 3,
            'asrConfig': ASR_CONFIG, 'reportSha256': palette.sha(STAGE / 'report.json'),
            'authorizationSource': palette.AUTHORIZATION['source'],
            'limits': {'cumulativeCpuSeconds': 240, 'concurrency': 1, 'ffmpegSubprocessSeconds': 20,
                       'maxClipSeconds': 20, 'maxTotalAudioSeconds': 60,
                       'maxTailSilenceSeconds': 1, 'maxDecodedPeak': .99, 'minPhoneticSimilarity': .9},
            'humanListeningPerformed': False, 'subjectiveStyleAccepted': False})
        try:
            run = palette.run_supervised('verification', palette.ASR_PYTHON, Path(__file__).resolve(), fd)
        except BaseException as exc:
            summary = palette.read_json(STAGE / 'verification.json')
            summary.update(status='failed', supervisorError=f'{type(exc).__name__}: {exc}', stoppedAt=palette.utc())
            palette.save(STAGE / 'verification.json', summary)
            raise
        summary = palette.read_json(STAGE / 'verification.json')
        summary.update(elapsedSeconds=run['spentSeconds'], verificationRunId=run['id'],
                       verificationLog=run.get('log', f'work/voice-palette/runs/verification-{run["id"]}.log'))
        palette.save(STAGE / 'verification.json', summary)
        cached_checks()
        print(json.dumps({'status': 'complete', 'clipsChecked': len(report['clips']),
                          'verificationChargedSeconds': run['spentSeconds'],
                          'requiresHumanContentReview': summary['requiresHumanContentReview'],
                          'humanListeningPerformed': False, 'subjectiveStyleAccepted': False}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'STOP: {type(error).__name__}: {error}', file=sys.stderr, flush=True)
        raise SystemExit(1)
