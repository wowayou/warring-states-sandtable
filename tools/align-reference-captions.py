"""Align display sentences to current ASR word times inside measured TTS chunks.

The text is always the historical source. Missing/weak alignment stops this
step; it never invents evenly spaced timing or reuses another recording's ASR.
"""
import argparse, difflib, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'work/reference-voice'
sys.path.insert(0, str(ROOT / 'work/asr-deps'))
from pypinyin import lazy_pinyin, load_phrases_dict
from pronunciation import spoken, cn

load_phrases_dict({'而还': [['er'], ['huan']], '出降': [['chu'], ['xiang']]})

def syllables(text):
    text = re.sub(r'\d{1,3}', lambda match: cn(int(match[0])), text)
    return lazy_pinyin(re.sub(r'[^\u3400-\u9fff]', '', text))

def captions(text):
    pieces, current = [], ''
    for clause in re.findall(r'[^。！？；，]+[。！？；，]?', text):
        if not re.search(r'[\w\u3400-\u9fff]', clause) and pieces and not current:
            pieces[-1] += clause
            continue
        if current and len(current + clause) > 28:
            pieces.append(current); current = ''
        current += clause
        if current[-1:] in '。！？；': pieces.append(current); current = ''
    if current: pieces.append(current)
    if ''.join(pieces) != text: raise ValueError('Caption splitting lost source text')
    return pieces

def align_chunk(chunk, info):
    pieces = captions(chunk['text'])
    if len(pieces) == 1:
        return [dict(chunk)], {'method': 'measured-synthesis-chunk', 'score': None}
    ref = []; offsets = []
    for piece in pieces:
        offsets.append(len(ref)); ref.extend(syllables(spoken(piece)))
    offsets.append(len(ref))
    hyp = []; times = []
    for word in info.get('words', []):
        a, b = word['start'], word['end']
        if b <= a or (a + b) / 2 < chunk['start'] - .12 or (a + b) / 2 > chunk['end'] + .12: continue
        units = syllables(word['text'])
        for i, unit in enumerate(units):
            hyp.append(unit); times.append((a + (b-a)*i/len(units), a + (b-a)*(i+1)/len(units)))
    matcher = difflib.SequenceMatcher(None, ref, hyp, autojunk=False)
    mapping = {}
    for a, b, size in matcher.get_matching_blocks():
        for i in range(size): mapping[a+i] = times[b+i]
    if matcher.ratio() < .78: raise ValueError(f'Weak phonetic alignment {matcher.ratio():.3f}')
    starts = [chunk['start']]
    for i in range(1, len(pieces)):
        anchors = [j for j in range(offsets[i], offsets[i+1]) if j in mapping]
        if not anchors or anchors[0] - offsets[i] > 2: raise ValueError('No reliable sentence-start anchor')
        point = max(chunk['start'], min(chunk['end'], mapping[anchors[0]][0]))
        if point <= starts[-1] + .12 or point >= chunk['end'] - .08: raise ValueError('Non-monotonic sentence alignment')
        starts.append(point)
    spans = [{'text': piece, 'start': round(starts[i], 4),
              'end': round(starts[i+1] if i+1 < len(starts) else chunk['end'], 4)} for i, piece in enumerate(pieces)]
    return spans, {'method': 'current-ASR-phonetic-anchors', 'score': round(matcher.ratio(), 4)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--inspect', action='store_true', help='inspect a generating batch without changing its manifest')
    args = ap.parse_args()
    manifest = json.loads((STAGE / 'manifest.json').read_text())
    reports = [(p.name, json.loads(p.read_text())) for p in STAGE.glob('asr-*-report.json')]
    result, failures, pending = {}, {}, []
    for key, item in manifest.items():
        sources = [(name, report[key]) for name, report in reports if key in report
                   and report[key].get('sha256') == item['sha256'] and report[key].get('text') == item['text']]
        if args.inspect and not sources:
            pending.append(key); continue
        chunks = item.get('synthesisChunks', item['sentences'])
        new_spans, evidence = [], []
        try:
            for chunk in chunks:
                options = []
                for name, source in sources:
                    try:
                        spans, detail = align_chunk(chunk, source)
                        options.append((detail['score'] if detail['score'] is not None else 1, spans, {**detail, 'source': name}))
                    except ValueError: pass
                if not options: raise ValueError(f'No current reliable alignment for: {chunk["text"]}')
                _, spans, detail = max(options, key=lambda option: option[0])
                new_spans.extend(spans); evidence.append(detail)
            item['synthesisChunks'] = chunks
            item['sentences'] = new_spans
            item['captionAlignmentSha256'] = item['sha256']
            result[key] = {'sha256': item['sha256'], 'sentences': len(new_spans), 'evidence': evidence}
        except ValueError as error: failures[key] = str(error)
    report_path = STAGE / ('caption-alignment-preview.json' if args.inspect else 'caption-alignment.json')
    report_path.write_text(json.dumps({'aligned': result, 'failures': failures, 'pendingTranscription': pending}, ensure_ascii=False, indent=2)+'\n')
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2)); raise SystemExit(1)
    if args.inspect:
        print(f'Inspected {len(result)} recordings, {len(pending)} await transcription; active generation manifest unchanged'); return
    temporary = STAGE / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    temporary.replace(STAGE / 'manifest.json')
    print(f'Aligned {len(result)} recordings to {sum(len(i["sentences"]) for i in manifest.values())} display sentences')

if __name__ == '__main__': main()
