"""Reanalyse existing ASR evidence after lossless Chinese-script normalization.

No ASR or synthesis is rerun. Raw transcripts, earlier warnings and audio remain
unchanged. In particular, 成為 and 成为 must get the same contextual reading;
敬 is never normalized into 晋, and 请 is never normalized into 卿.
"""
import argparse
import importlib.util
import signal
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('orthography_base', ROOT / 'tools/review-voice-homophones.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
palette = base.palette
OUTPUT = palette.STAGE / 'homophone-orthography-review.json'
EQUIVALENTS = str.maketrans({'為': '为', '諸': '诸', '專': '专', '齊': '齐'})


def canonical_reading_text(text):
    return text.translate(EQUIVALENTS)


def syllables(text):
    sys.path.insert(0, str(ROOT / 'work/asr-deps'))
    from pypinyin import lazy_pinyin, Style
    import re
    return lazy_pinyin(re.sub(r'[^\u3400-\u9fff]', '', canonical_reading_text(text)),
                       style=Style.TONE3, neutral_tone_with_five=True)


def derive(source):
    clips = []
    for item in source['clips']:
        clips.append({**item, **base.tone_decision(item['text'], item['initialAsr'], item['independentAsr'], syllables),
                      'normalizedInitialAsr': canonical_reading_text(item['initialAsr']),
                      'normalizedIndependentAsr': canonical_reading_text(item['independentAsr'])})
    return clips


def cached():
    report = palette.read_json(OUTPUT)
    source = base.cached()
    budget, _ = palette.load_state()
    run = next((r for r in budget['phases']['verification']['runs'] if r['id'] == report.get('runId')), None)
    if report.get('status') != 'complete' or run is None or run['status'] != 'completed' \
            or report.get('sourceReviewSha256') != palette.sha(base.OUTPUT) or report['clips'] != derive(source):
        raise palette.Stopped('Stale or changed orthographic review; do not rerun models or change warnings')
    return report


def worker(run_id, lock_fd):
    run = palette.worker_reservation('verification', run_id, lock_fd)
    source = base.cached()
    report = {'status': 'complete', 'method': 'two-asr-tone-reading-comparison-v2-orthography',
              'createdAt': palette.utc(), 'sourceReviewSha256': palette.sha(base.OUTPUT),
              'orthographyOnly': {'為': '为', '諸': '诸', '專': '专', '齊': '齐'},
              'modelsRerun': False, 'audioChanged': False, 'humanListeningPerformed': False,
              'subjectiveStyleAccepted': False, 'runId': run_id, 'clips': derive(source)}
    palette.seconds_left(run['hardDeadlineMonotonic'])
    palette.save(OUTPUT, report)
    signal.setitimer(signal.ITIMER_REAL, 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--check-cache', action='store_true')
    mode.add_argument('--_worker', nargs=2, help=argparse.SUPPRESS)
    args = ap.parse_args()
    if args._worker:
        worker(args._worker[0], int(args._worker[1])); return
    with palette.ExclusiveLock() as fd:
        palette.stop_abandoned()
        if args.check_cache or OUTPUT.exists():
            report = cached()
        else:
            base.cached()
            run = palette.run_supervised('verification', palette.ASR_PYTHON, Path(__file__).resolve(), fd)
            report = palette.read_json(OUTPUT)
            report['elapsedSeconds'] = run['spentSeconds']
            palette.save(OUTPUT, report)
            report = cached()
        print({'screenedSamples': [c['id'] for c in report['clips'] if not c['needsContentReview']],
               'needsHumanContentReview': [c['id'] for c in report['clips'] if c['needsContentReview']],
               'modelsRerun': False, 'audioChanged': False})


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'STOP: {type(error).__name__}: {error}', file=sys.stderr)
        raise SystemExit(1)
