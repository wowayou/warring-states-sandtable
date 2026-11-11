"""One supplementary offline homophone review; no synthesis and no human approval.

The original exact-character warnings remain untouched. A different cached ASR
model and tone-marked reading comparison distinguish same-reading spelling from
unresolved syllable/tone differences. CPU time shares the original 240s ledger.
"""
import argparse
import importlib.util
from pathlib import Path
import re
import signal
import sys

ROOT = Path(__file__).resolve().parents[1]
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
palette = load('homophone_palette', 'voice-palette.py')
checker = load('homophone_checker', 'check-voice-palette.py')
STAGE = palette.STAGE
OUTPUT = STAGE / 'homophone-review.json'
SMALL_REVISION = '536b0662742c02347bc0e980a01041f333bce120'
SMALL_MODEL = Path.home() / '.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots' / SMALL_REVISION
SMALL_FILES = ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt']


def continue_pre_model_filename_fix(stage=STAGE, model=SMALL_MODEL):
    """One explicit code-fix continuation, only for the recorded pre-ASR filename bug.

    Never retry an ASR result, a timeout, synthesis, or an unknown failure. All
    failed-run time/logs and per-speaker attempts remain consumed and unchanged.
    """
    stage = Path(stage)
    budget, attempts = palette.load_state(stage)
    phase = budget['phases']['verification']
    if not phase['blocked'] or phase.get('preModelFilenameContinuation') or not phase['runs']:
        raise palette.Stopped('No eligible one-time metadata filename fix')
    partial = palette.read_json(stage / 'homophone-review.json')
    previous = phase['runs'][-1]
    script = str(ROOT / 'tools/review-voice-homophones.py')
    log = ROOT / previous.get('log', '')
    expected_error = f"STOP: FileNotFoundError: [Errno 2] No such file or directory: '{model}/vocabulary.json'"
    if previous['status'] != 'failed' or previous.get('exitCode') != 1 \
            or script not in previous.get('workerCommand', []) \
            or log.read_text().strip() != expected_error \
            or partial.get('status') != 'checking' or partial.get('clips') != [] \
            or 'modelHashes' in partial or partial.get('initialChecksSha256') != palette.sha(stage / 'checks.json') \
            or partial.get('legacyChecksSha256') != palette.sha(ROOT / 'work/revision-3/voices/checks.json') \
            or any(not (model / name).is_file() for name in SMALL_FILES):
        raise palette.Stopped('Failure was not the specific pre-model filename bug; keep it latched closed')
    archive = stage / f'homophone-review-pre-model-failure-{previous["id"]}.json'
    if archive.exists():
        raise palette.Stopped('Metadata-only continuation already recorded')
    before_charge = phase['chargedSeconds']
    (stage / 'homophone-review.json').rename(archive)
    phase.update(blocked=False, preModelFilenameContinuation={
        'previousRunId': previous['id'], 'previousLogSha256': palette.sha(log),
        'partialReportSha256': palette.sha(archive), 'recordedAt': palette.utc(),
        'reason': 'vocabulary.txt is the actual fixed small-model asset; failure occurred before ASR loading',
        'scope': 'one explicit supplementary CPU check after a code fix; no synthesis or ASR-result retry',
        'chargedSecondsPreserved': before_charge, 'limitSecondsUnchanged': phase['limitSeconds']})
    palette.save(stage / 'budget.json', budget)
    if palette.read_json(stage / 'attempts.json') != attempts:
        raise palette.Stopped('Attempt history changed during metadata-only continuation')



def tone_decision(expected, primary, independent, syllables):
    """Do not call homophonic spelling a voice error, or ignore actual tone differences."""
    reference = syllables(expected)
    first, second = syllables(primary), syllables(independent)
    passed = bool(reference and reference == first == second)
    return {'expectedTonePinyin': reference, 'initialTonePinyin': first,
            'independentTonePinyin': second, 'toneReadingMatch': passed,
            'needsContentReview': not passed, 'humanListeningPerformed': False,
            'subjectiveStyleAccepted': False, 'notAcousticToneProof': True}


def inputs():
    _, new_checks = checker.cached_checks()
    new_report = palette.cached_generation()
    legacy = palette.read_json(ROOT / 'work/revision-3/voices/report.json')
    legacy_checks = palette.read_json(ROOT / 'work/revision-3/voices/checks.json')
    if legacy['revision'] != palette.REVISION or len(legacy['clips']) != 2:
        raise palette.Stopped('Unexpected cached alternative samples')
    result = []
    for folder, report, checks in [
        (ROOT / 'work/revision-3/voices', legacy, legacy_checks),
        (STAGE, new_report, new_checks),
    ]:
        for clip in report['clips']:
            check = next(c for c in checks if c['id'] == clip['id'])
            path = folder / clip['file']
            if clip['text'] != palette.TEXT or palette.sha(path) != check['sha256']:
                raise palette.Stopped('Changed sample/text or initial transcript evidence')
            result.append({'id': clip['id'], 'speaker': clip['speaker'], 'text': clip['text'],
                           'path': path, 'sha256': check['sha256'], 'duration': clip['duration'],
                           'initialAsr': check['asr'], 'initialNeedsContentReview': check['needsContentReview']})
    return result


def cached():
    report = palette.read_json(OUTPUT)
    budget, _ = palette.load_state()
    run = next((r for r in budget['phases']['verification']['runs'] if r['id'] == report.get('runId')), None)
    if report.get('status') != 'complete' or run is None or run['status'] != 'completed' \
            or report.get('initialChecksSha256') != palette.sha(STAGE / 'checks.json') \
            or report.get('legacyChecksSha256') != palette.sha(ROOT / 'work/revision-3/voices/checks.json'):
        raise palette.Stopped('Missing, interrupted or stale supplementary review; do not rerun')
    for clip, item in zip(inputs(), report['clips']):
        if clip['id'] != item['id'] or clip['sha256'] != item['sha256'] or clip['initialAsr'] != item['initialAsr']:
            raise palette.Stopped('Supplementary review no longer matches its audio/transcript')
    if len(report['clips']) != 5:
        raise palette.Stopped('Partial supplementary review')
    return report


def worker(run_id, lock_fd):
    run = palette.worker_reservation('verification', run_id, lock_fd)
    deadline = run['hardDeadlineMonotonic']
    sys.path.insert(0, str(ROOT / 'work/asr-deps'))
    import numpy as np
    from faster_whisper import WhisperModel
    from pypinyin import lazy_pinyin, Style
    syllables = lambda text: lazy_pinyin(re.sub(r'[^\u3400-\u9fff]', '', text),
                                         style=Style.TONE3, neutral_tone_with_five=True)
    source = inputs()
    report = palette.read_json(OUTPUT)
    report['modelHashes'] = {name: palette.sha(SMALL_MODEL / name, deadline) for name in SMALL_FILES}
    palette.save(OUTPUT, report)  # Any later failure is no longer eligible for metadata-only continuation.
    model = WhisperModel(str(SMALL_MODEL), device='cpu', compute_type='int8', cpu_threads=3,
                         num_workers=1, local_files_only=True)
    for item in source:
        palette.seconds_left(deadline)
        decoded = palette.bounded_subprocess(['ffmpeg', '-v', 'error', '-i', str(item['path']),
                    '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], deadline, capture_output=True).stdout
        audio = np.frombuffer(decoded, np.float32)
        if not len(audio) or not np.isfinite(audio).all() or abs(len(audio) / 16000 - item['duration']) > .06:
            raise palette.Stopped('Invalid supplementary analysis PCM')
        segments, _ = model.transcribe(audio, language='zh', beam_size=3, initial_prompt=None,
                                        vad_filter=False, condition_on_previous_text=False)
        heard = ''.join(segment.text for segment in segments)
        row = {k: v for k, v in item.items() if k != 'path'}
        row.update(independentAsr=heard,
                   **tone_decision(item['text'], item['initialAsr'], heard, syllables))
        report['clips'].append(row)
        palette.save(OUTPUT, report)
        print(row['id'], row['toneReadingMatch'], row['independentAsr'], flush=True)
    report.update(status='complete', runId=run_id, completedAt=palette.utc())
    palette.save(OUTPUT, report)
    signal.setitimer(signal.ITIMER_REAL, 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--check-cache', action='store_true')
    mode.add_argument('--_worker', nargs=2, help=argparse.SUPPRESS)
    ap.add_argument('--continue-pre-model-filename-fix', action='store_true',
                    help='explicit one-time continuation of the recorded filename bug, with no budget/attempt reset')
    args = ap.parse_args()
    if args._worker:
        worker(args._worker[0], int(args._worker[1])); return
    with palette.ExclusiveLock() as fd:
        palette.stop_abandoned()
        if args.continue_pre_model_filename_fix:
            if not args.check:
                raise palette.Stopped('Metadata filename continuation requires explicit --check')
            continue_pre_model_filename_fix()
        if args.check_cache or OUTPUT.exists():
            report = cached()
        else:
            if any(not (SMALL_MODEL / name).is_file() for name in SMALL_FILES):
                raise palette.Stopped('Fixed local ASR model files missing; stop before reserving CPU')
            inputs()  # Refuse synthesis, stale audio or changed initial evidence before reserving CPU.
            palette.save(OUTPUT, {'status': 'checking', 'createdAt': palette.utc(),
                'model': 'Systran/faster-whisper-small', 'revision': SMALL_REVISION,
                'expectedTextPrompt': False, 'device': 'cpu', 'offline': True,
                'initialChecksSha256': palette.sha(STAGE / 'checks.json'),
                'legacyChecksSha256': palette.sha(ROOT / 'work/revision-3/voices/checks.json'),
                'method': 'two-asr-tone-reading-comparison-v1', 'clips': []})
            settled = palette.run_supervised('verification', palette.ASR_PYTHON, Path(__file__).resolve(), fd)
            report = palette.read_json(OUTPUT)
            report.update(elapsedSeconds=settled['spentSeconds'])
            palette.save(OUTPUT, report)
            report = cached()
        print({'sampleScreenPassed': [c['id'] for c in report['clips'] if not c['needsContentReview']],
               'needsHumanContentReview': [c['id'] for c in report['clips'] if c['needsContentReview']],
               'humanListeningPerformed': False, 'subjectiveStyleAccepted': False})


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'STOP: {type(error).__name__}: {error}', file=sys.stderr)
        raise SystemExit(1)
