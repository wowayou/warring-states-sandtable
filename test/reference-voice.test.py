import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / file)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

batch = load('reference_batch', 'reference-voice-batch.py')
alignment = load('reference_alignment', 'align-reference-captions.py')

class ReferenceVoiceTest(unittest.TestCase):
    def test_all_current_historical_text_and_caveats_survive_chunking(self):
        cfg = json.loads((ROOT / 'work/reference-voice-input.json').read_text())
        self.assertEqual(len(cfg['lines']), 204)
        for key, line in cfg['lines'].items():
            with self.subTest(key=key):
                chunks = batch.chunks_for(line['text'])
                self.assertEqual(''.join(chunks), line['text'])
                self.assertTrue(all(len(batch.spoken(c)) <= 48 for c in chunks))

    def test_reference_audio_transcript_and_model_changes_invalidate_cache(self):
        cfg = {'model': 'Base', 'revision': '1'}
        ref = {'sha256': 'audio1', 'text': '参考一'}
        original = batch.identity(cfg, ref, '讲解')
        self.assertNotEqual(original, batch.identity(cfg, {**ref, 'sha256': 'audio2'}, '讲解'))
        self.assertNotEqual(original, batch.identity(cfg, {**ref, 'text': '参考二'}, '讲解'))
        self.assertNotEqual(original, batch.identity({**cfg, 'revision': '2'}, ref, '讲解'))

    def test_pronunciation_changes_do_not_reset_the_two_attempt_limit(self):
        attempts = {'battle:0:old-reading-hash': 1, 'battle:0:new-reading-hash': 1, 'battle:1:other': 1}
        self.assertEqual(batch.attempt_count(attempts, 'battle', 0), 2)
        self.assertEqual(batch.attempt_count(attempts, 'battle', 1), 1)

    def test_sentence_time_comes_from_recorded_words_not_character_proportions(self):
        chunk = {'text': '秦军出发。赵军坚守。', 'start': 0, 'end': 10}
        source = {'words': [{'text': '秦军出发', 'start': 0, 'end': 1},
                            {'text': '赵军坚守', 'start': 7.2, 'end': 10}]}
        captions, _ = alignment.align_chunk(chunk, source)
        self.assertEqual(captions[1]['start'], 7.2)
        self.assertEqual(captions[0]['end'], 7.2)
        self.assertEqual(''.join(c['text'] for c in captions), chunk['text'])

    def test_missing_or_unrelated_word_times_fail_instead_of_guessing(self):
        chunk = {'text': '秦军出发。赵军坚守。', 'start': 0, 'end': 10}
        for source in [{'words': []}, {'words': [{'text': '天气晴朗', 'start': 0, 'end': 9}]}]:
            with self.assertRaises(ValueError): alignment.align_chunk(chunk, source)

    def test_single_sentence_keeps_measured_synthesis_boundaries(self):
        chunk = {'text': '赵军坚守。', 'start': 4.25, 'end': 7.81}
        spans, detail = alignment.align_chunk(chunk, {})
        self.assertEqual(spans, [chunk])
        self.assertEqual(detail['method'], 'measured-synthesis-chunk')

    def test_closing_quote_stays_with_its_spoken_sentence(self):
        text = '「亦余心之所善兮，虽九死其犹未悔。」'
        self.assertEqual(alignment.captions(text), [text])
        chunk = {'text': text, 'start': 5, 'end': 12}
        self.assertEqual(alignment.align_chunk(chunk, {})[0], [chunk])

if __name__ == '__main__': unittest.main()
