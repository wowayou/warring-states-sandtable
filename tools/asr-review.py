"""Compare ASR syllables with reading text; flags are review hints, not verdicts."""
import argparse, difflib, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/asr-deps'))
from pypinyin import lazy_pinyin, load_phrases_dict
from pronunciation import spoken, cn

load_phrases_dict({'而还': [['er'], ['huan']], '出降': [['chu'], ['xiang']]})

def syllables(text):
    text = re.sub(r'\d{1,3}', lambda m: cn(int(m[0])), text)
    return lazy_pinyin(re.sub(r'[^\u3400-\u9fff]', '', text))

ap = argparse.ArgumentParser()
ap.add_argument('--threshold', type=float, default=.92)
ap.add_argument('--staged', action='store_true')
args = ap.parse_args()
directory = ROOT / ('work/reference-voice' if args.staged else 'work')
manifest = json.loads((directory / ('manifest.json' if args.staged else 'voice-manifest.json')).read_text())
reports = [(p.name, json.loads(p.read_text())) for p in directory.glob('asr-*-report.json')]
results = {}
for lid, item in manifest.items():
    ref = syllables(spoken(item['text']))
    options = []
    for name, report in reports:
        info = report.get(lid)
        if not info or info.get('sha256') != item['sha256']: continue
        hyp = syllables(info['asr'])
        match = difflib.SequenceMatcher(None, ref, hyp, autojunk=False)
        diffs = [{'expected': ' '.join(ref[a:b]), 'heard': ' '.join(hyp[c:d])}
                 for op, a, b, c, d in match.get_opcodes() if op != 'equal']
        options.append({'report': name, 'score': round(match.ratio(), 4), 'asr': info['asr'], 'diffs': diffs})
    if not options: continue
    best = max(options, key=lambda v: v['score'])
    results[lid] = {'sha256': item['sha256'], 'text': item['text'], **best, 'review': best['score'] < args.threshold}
out = directory / 'phonetic-review.json'
out.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(f'Current recordings screened: {len(results)}/{len(manifest)}; tones not assessed')
for lid, info in results.items():
    if info['review']: print(lid, info['score'], info['diffs'])
