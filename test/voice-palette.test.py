"""CPU-only regressions for persistent limits and screening evidence.

All temporary records stay under work/voice-palette/test-tmp. No TTS/ASR model
is loaded and no GPU, download, or production file is needed.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


palette = load('palette_test', 'voice-palette.py')
checker = load('palette_checker_test', 'check-voice-palette.py')
homophones = load('palette_homophones_test', 'review-voice-homophones.py')
orthography = load('palette_orthography_test', 'review-voice-orthography.py')


class PaletteTest(unittest.TestCase):
    def setUp(self):
        folder = ROOT / 'work/voice-palette/test-tmp'
        folder.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=folder)
        self.stage = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)

    def initialize(self):
        return palette.load_state(self.stage, create=True)

    def reserve(self, phase='generation'):
        self.initialize()
        return palette.reserve_run(self.stage, phase, ['local-test-only'])

    def fake_report(self):
        report = palette.initial_report()
        report.update(status='complete', totalDurationSeconds=30)
        for spec in palette.SPECS:
            key = spec['id']
            raw, audio = self.stage / f'{key}-raw.wav', self.stage / f'{key}.mp3'
            raw.write_bytes(b'fixture raw ' + key.encode())
            audio.write_bytes(b'fixture mp3 ' + key.encode())
            report['clips'].append({**{k: spec[k] for k in ['id', 'title', 'speaker']},
                                    'text': palette.TEXT, 'spokenText': palette.TEXT,
                                    'file': audio.name, 'rawFile': raw.name, 'duration': 10,
                                    'hash': palette.clip_identity(spec), 'sha256': palette.sha(audio),
                                    'rawSha256': palette.sha(raw), 'maxNewTokens': 240,
                                    'generatedTokens': 126, 'codecTokens': 125,
                                    'stoppedOnEos': True, 'styleInstructionTokens': 37})
        palette.save(self.stage / 'report.json', report)
        return report

    def completed_generation_fixture(self):
        run = self.reserve()
        report = self.fake_report()
        for clip in report['clips']:
            palette.begin_attempt(self.stage, 'generation', clip['id'], run['id'])
            palette.update_attempt(self.stage, 'generation', clip['id'], status='completed',
                                   sha256=clip['sha256'], duration=clip['duration'])
        palette.finish_run(self.stage, 'generation', run['id'], 32.001, True, exit_code=0)
        report['generationRunId'] = run['id']
        palette.save(self.stage / 'report.json', report)
        return report

    def test_fixed_scope_and_authorization_are_not_reference_voice_budget(self):
        self.assertEqual([s['speaker'] for s in palette.SPECS], ['Vivian', 'Aiden', 'Ryan'])
        self.assertEqual(palette.TEXT, '春秋的霸主秩序散了。三家分晋、田氏专齐，卿大夫取代诸侯成为主角。')
        self.assertEqual(palette.REVISION, '0c0e3051f131929182e2c023b9537f8b1c68adfe')
        self.assertEqual(palette.PHASE_LIMITS, {'generation': 600, 'verification': 240})
        self.assertEqual(palette.SAMPLING['max_new_tokens'], 240)
        self.assertEqual(palette.LIMITS['maxGenerationAttemptsPerSpeaker'], 1)
        self.assertEqual(palette.LIMITS['concurrency'], 1)
        self.assertEqual(palette.AUTHORIZATION['source'], 'current-user-request')
        self.assertFalse(palette.AUTHORIZATION['usesReferenceVoiceBudget'])
        self.assertFalse(palette.AUTHORIZATION['productionRerecordingAuthorized'])
        self.assertFalse(palette.AUTHORIZATION['userAuditionAccepted'])
        self.assertEqual(palette.POSTPROCESS['pitchShiftSemitones'], 0)
        self.assertEqual(palette.POSTPROCESS['tempoFactor'], 1)
        self.assertFalse(palette.POSTPROCESS['trimSilence'])

    def test_inference_is_not_implicit_and_private_worker_requires_lock(self):
        for filename in ['voice-palette.py', 'check-voice-palette.py']:
            with self.subTest(filename=filename):
                result = subprocess.run([sys.executable, '-B', str(ROOT / 'tools' / filename)],
                                        capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 2)
                result = subprocess.run([sys.executable, '-B', str(ROOT / 'tools' / filename),
                                         '--_worker', 'invalid', '-1'], capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 1)
                self.assertIn(b'inherited exclusive lock', result.stderr)

    def test_reservation_is_durable_and_charged_before_work(self):
        run = self.reserve()
        budget, attempts = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 600)
        self.assertEqual(budget['phases']['generation']['runs'][0]['status'], 'reserved')
        self.assertEqual(run['hardDeadlineMonotonic'], run['startedMonotonic'] + 598)
        self.assertEqual(attempts['phases']['generation']['vivian']['count'], 0)
        with self.assertRaises(palette.Stopped):
            palette.reserve_run(self.stage, 'verification', ['parallel-forbidden'])

    def test_attempt_saved_before_call_and_cannot_be_reused_after_reload(self):
        run = self.reserve()
        palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])
        _, attempts = palette.load_state(self.stage)
        self.assertEqual(attempts['phases']['generation']['vivian']['count'], 1)
        self.assertEqual(attempts['phases']['generation']['vivian']['status'], 'running')
        with self.assertRaises(palette.Stopped):
            palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])
        with self.assertRaises(palette.Stopped):
            palette.update_attempt(self.stage, 'generation', 'vivian', count=0)
        palette.update_attempt(self.stage, 'generation', 'vivian', status='completed')
        with self.assertRaises(palette.Stopped):
            palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])

    def test_success_refunds_only_unused_reservation_and_time_is_cumulative(self):
        run = self.reserve()
        palette.finish_run(self.stage, 'generation', run['id'], 100.1231, True, exit_code=0)
        budget, _ = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 100.124)
        second = palette.reserve_run(self.stage, 'generation', ['local-test-only'])
        self.assertAlmostEqual(second['reservedSeconds'], 499.876)
        palette.finish_run(self.stage, 'generation', second['id'], 20.0011, True, exit_code=0)
        budget, _ = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 120.126)
        with self.assertRaises(palette.Stopped):
            palette.finish_run(self.stage, 'generation', second['id'], 0, True)

    def test_cpu_budget_is_independent_but_equally_persistent(self):
        run = self.reserve('verification')
        palette.begin_attempt(self.stage, 'verification', 'vivian', run['id'])
        palette.update_attempt(self.stage, 'verification', 'vivian', status='completed')
        palette.finish_run(self.stage, 'verification', run['id'], 27.0011, True, exit_code=0)
        budget, attempts = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['verification']['chargedSeconds'], 27.002)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 0)
        self.assertEqual(attempts['phases']['verification']['vivian']['count'], 1)
        self.assertEqual(attempts['phases']['generation']['vivian']['count'], 0)

    def test_failure_latches_even_with_unspent_time_and_other_pending_speakers(self):
        run = self.reserve()
        palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])
        palette.finish_run(self.stage, 'generation', run['id'], 12.5, False, 'quality failure', 1)
        budget, attempts = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 12.5)
        self.assertTrue(budget['phases']['generation']['blocked'])
        self.assertEqual(attempts['phases']['generation']['vivian']['status'], 'failed')
        self.assertEqual(attempts['phases']['generation']['aiden']['count'], 0)
        with self.assertRaises(palette.Stopped):
            palette.reserve_run(self.stage, 'generation', ['forbidden-retry'])
        with self.assertRaises(palette.Stopped):
            palette.begin_attempt(self.stage, 'generation', 'aiden', run['id'])

    def test_abandoned_run_keeps_full_time_and_completed_cache(self):
        run = self.reserve()
        palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])
        palette.update_attempt(self.stage, 'generation', 'vivian', status='completed')
        cached = self.stage / 'vivian.mp3'
        cached.write_bytes(b'completed take must survive')
        original = palette.sha(cached)
        palette.begin_attempt(self.stage, 'generation', 'aiden', run['id'])
        with self.assertRaises(palette.Stopped):
            palette.stop_abandoned(self.stage)
        budget, attempts = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 600)
        self.assertEqual(budget['phases']['generation']['runs'][0]['status'], 'abandoned')
        self.assertEqual(attempts['phases']['generation']['vivian']['status'], 'completed')
        self.assertEqual(attempts['phases']['generation']['aiden']['status'], 'interrupted')
        self.assertEqual(palette.sha(cached), original)
        with self.assertRaises(palette.Stopped):
            palette.reserve_run(self.stage, 'generation', ['forbidden-recovery'])

    def test_actual_overrun_is_not_hidden_by_clamping(self):
        run = self.reserve()
        settled = palette.finish_run(self.stage, 'generation', run['id'], 600.01, True, exit_code=0)
        budget, _ = palette.load_state(self.stage)
        self.assertEqual(settled['status'], 'failed')
        self.assertTrue(settled['limitExceeded'])
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 600.01)
        self.assertTrue(budget['phases']['generation']['blocked'])

    def test_contract_reading_or_seed_change_never_resets_attempts(self):
        run = self.reserve()
        palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])
        original = (self.stage / 'attempts.json').read_bytes()
        with mock.patch.object(palette, 'TEXT', palette.TEXT + '。'):
            with self.assertRaises(palette.Stopped):
                palette.load_state(self.stage, create=True)
        self.assertEqual((self.stage / 'attempts.json').read_bytes(), original)
        with self.assertRaises(palette.Stopped):
            palette.begin_attempt(self.stage, 'generation', 'vivian', run['id'])

    def test_missing_record_or_audio_evidence_refuses_fresh_budget(self):
        self.initialize()
        (self.stage / 'attempts.json').unlink()
        with self.assertRaises(palette.Stopped):
            palette.load_state(self.stage, create=True)
        (self.stage / 'budget.json').unlink()
        (self.stage / 'vivian.mp3').write_bytes(b'prior attempt')
        with self.assertRaises(palette.Stopped):
            palette.load_state(self.stage, create=True)
        self.assertFalse((self.stage / 'budget.json').exists())

    def test_corrupt_limit_charge_or_attempt_identity_refuses_work(self):
        self.initialize()
        original_budget = palette.read_json(self.stage / 'budget.json')
        original_attempts = palette.read_json(self.stage / 'attempts.json')
        for mutation in ['limit', 'charge', 'speaker', 'count']:
            with self.subTest(mutation=mutation):
                budget = json.loads(json.dumps(original_budget))
                attempts = json.loads(json.dumps(original_attempts))
                if mutation == 'limit':
                    budget['phases']['generation']['limitSeconds'] = 601
                elif mutation == 'charge':
                    budget['phases']['generation']['chargedSeconds'] = 0.1
                elif mutation == 'speaker':
                    attempts['phases']['generation'].pop('vivian')
                else:
                    attempts['phases']['generation']['vivian']['count'] = -1
                palette.save(self.stage / 'budget.json', budget)
                palette.save(self.stage / 'attempts.json', attempts)
                with self.assertRaises(palette.Stopped):
                    palette.load_state(self.stage)

    def test_exclusive_lock_and_inherited_lock_survive_supervisor_close(self):
        with palette.ExclusiveLock(self.stage) as fd:
            with self.assertRaises(palette.Stopped):
                with palette.ExclusiveLock(self.stage):
                    pass
            child = subprocess.Popen([sys.executable, '-B', '-c', 'import time; time.sleep(.3)'], pass_fds=(fd,))
        try:
            with self.assertRaises(palette.Stopped):
                with palette.ExclusiveLock(self.stage):
                    pass
        finally:
            child.wait(timeout=3)
        with palette.ExclusiveLock(self.stage):
            pass

    def test_all_child_commands_have_absolute_and_per_process_timeouts(self):
        with mock.patch.object(palette.subprocess, 'run') as run:
            palette.bounded_subprocess(['ffmpeg', '-version'], time.monotonic() + 600, capture_output=True)
            args, kwargs = run.call_args
            self.assertEqual(args[0][:3], ['/usr/bin/timeout', '--foreground', '--signal=KILL'])
            self.assertLessEqual(float(args[0][3][:-1]), 20)
            self.assertLessEqual(kwargs['timeout'], 20.1)
            self.assertTrue(kwargs['check'])
        deadline = time.monotonic() + .55
        with self.assertRaises((subprocess.CalledProcessError, subprocess.TimeoutExpired)):
            palette.bounded_subprocess([sys.executable, '-B', '-c', 'import time; time.sleep(10)'], deadline,
                                       capture_output=True)
        self.assertLess(time.monotonic(), deadline + .5)
        with self.assertRaises(TimeoutError):
            palette.seconds_left(time.monotonic() - 1)

    def test_token_cap_is_inclusive_and_no_eos_is_rejected(self):
        palette.token_check(130, 129, True)
        for generated, codes, eos in [(240, 239, True), (239, 239, True), (241, 120, True), (120, 119, False)]:
            with self.subTest(generated=generated, codes=codes, eos=eos):
                with self.assertRaises(palette.Stopped):
                    palette.token_check(generated, codes, eos)

    def test_exact_duration_and_total_bounds_have_no_short_text_fallback(self):
        palette.validate_duration(20, 60)
        for seconds, total in [(20.001, 20.001), (2, 2), (10, 60.001), (float('nan'), 10)]:
            with self.assertRaises(palette.Stopped):
                palette.validate_duration(seconds, total)

    def test_completed_sha_cache_is_read_only_and_tamper_never_regenerates(self):
        self.fake_report()
        before = {p.name: p.read_bytes() for p in self.stage.iterdir()}
        report = palette.validate_report(self.stage)
        self.assertEqual(len(report['clips']), 3)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.stage.iterdir()})
        (self.stage / 'vivian.mp3').write_bytes(b'tampered')
        with self.assertRaises(palette.Stopped):
            palette.validate_report(self.stage)
        self.assertEqual((self.stage / 'vivian.mp3').read_bytes(), b'tampered')

    def test_partial_clip_count_wrong_speaker_or_path_is_not_publishable(self):
        original = self.fake_report()
        for mutation in ['partial', 'extra', 'speaker', 'path', 'text', 'cap']:
            report = json.loads(json.dumps(original))
            if mutation == 'partial':
                report['clips'].pop()
            elif mutation == 'extra':
                report['clips'].append(report['clips'][0])
            elif mutation == 'speaker':
                report['clips'][0]['speaker'] = 'Serena'
            elif mutation == 'path':
                report['clips'][0]['file'] = '../vivian.mp3'
            elif mutation == 'text':
                report['clips'][0]['spokenText'] = '春秋的霸主秩序散了。'
            else:
                report['clips'][0]['generatedTokens'] = 240
            palette.save(self.stage / 'report.json', report)
            with self.subTest(mutation=mutation):
                with self.assertRaises(palette.Stopped):
                    palette.validate_report(self.stage)

    def test_completed_cache_rechecks_do_not_reset_time_or_attempts(self):
        self.completed_generation_fixture()
        before = {p.name: p.read_bytes() for p in self.stage.iterdir()}
        for _ in range(2):
            self.assertEqual(len(palette.cached_generation(self.stage)['clips']), 3)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.stage.iterdir()})
        budget, attempts = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['generation']['chargedSeconds'], 32.001)
        self.assertTrue(all(a['count'] == 1 for a in attempts['phases']['generation'].values()))
        changed = palette.read_json(self.stage / 'report.json')
        changed['generationRunId'] = 'different-run'
        palette.save(self.stage / 'report.json', changed)
        with self.assertRaises(palette.Stopped):
            palette.cached_generation(self.stage)

    def test_cached_checks_bind_report_audio_attempts_and_budget_without_asr(self):
        report = self.completed_generation_fixture()
        run = palette.reserve_run(self.stage, 'verification', ['local-test-only'])
        checks = []
        for clip in report['clips']:
            palette.begin_attempt(self.stage, 'verification', clip['id'], run['id'])
            palette.update_attempt(self.stage, 'verification', clip['id'], status='completed')
            checks.append({'id': clip['id'], 'sha256': clip['sha256'], 'shaMatches': True,
                           'rawSha256': clip['rawSha256'], 'rawShaMatches': True,
                           'decodedSeconds': 10, 'peak': .7, 'tailSilenceSeconds': .08,
                           'mechanicalScreenPassed': True, 'contentScreenPassed': True,
                           'phoneticSimilarity': 1, 'humanListeningPerformed': False,
                           'subjectiveStyleAccepted': False})
        palette.finish_run(self.stage, 'verification', run['id'], 15.123, True, exit_code=0)
        palette.save(self.stage / 'checks.json', checks)
        summary = {'status': 'complete', 'asrConfig': checker.ASR_CONFIG,
                   'reportSha256': palette.sha(self.stage / 'report.json'),
                   'checksSha256': palette.sha(self.stage / 'checks.json'),
                   'verificationRunId': run['id']}
        palette.save(self.stage / 'verification.json', summary)
        before = {p.name: p.read_bytes() for p in self.stage.iterdir()}
        self.assertEqual(len(checker.cached_checks(self.stage)[1]), 3)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.stage.iterdir()})
        checks[0]['sha256'] = 'tampered'
        palette.save(self.stage / 'checks.json', checks)
        with self.assertRaises(checker.palette.Stopped):
            checker.cached_checks(self.stage)

    def test_supplementary_review_does_not_break_original_settled_run_binding(self):
        report = self.completed_generation_fixture()
        run = palette.reserve_run(self.stage, 'verification', ['local-test-only'])
        checks = []
        for clip in report['clips']:
            palette.begin_attempt(self.stage, 'verification', clip['id'], run['id'])
            palette.update_attempt(self.stage, 'verification', clip['id'], status='completed')
            checks.append({'id': clip['id'], 'sha256': clip['sha256'], 'shaMatches': True,
                           'rawSha256': clip['rawSha256'], 'rawShaMatches': True,
                           'decodedSeconds': 10, 'peak': .7, 'tailSilenceSeconds': .08,
                           'mechanicalScreenPassed': True, 'contentScreenPassed': True,
                           'phoneticSimilarity': 1, 'humanListeningPerformed': False,
                           'subjectiveStyleAccepted': False})
        palette.finish_run(self.stage, 'verification', run['id'], 15, True, exit_code=0)
        palette.save(self.stage / 'checks.json', checks)
        palette.save(self.stage / 'verification.json', {'status': 'complete', 'asrConfig': checker.ASR_CONFIG,
            'reportSha256': palette.sha(self.stage / 'report.json'),
            'checksSha256': palette.sha(self.stage / 'checks.json'), 'verificationRunId': run['id']})
        extra = palette.reserve_run(self.stage, 'verification', ['independent-review'])
        palette.finish_run(self.stage, 'verification', extra['id'], 5, True, exit_code=0)
        self.assertEqual(len(checker.cached_checks(self.stage)[1]), 3)
        budget, attempts = palette.load_state(self.stage)
        self.assertEqual(budget['phases']['verification']['chargedSeconds'], 20)
        self.assertTrue(all(a['count'] == 1 for a in attempts['phases']['verification'].values()))

    def test_tone_triage_requires_both_transcripts_and_never_claims_human_approval(self):
        mapping = {'晋': 'jin4', '进': 'jin4', '禁': 'jin4', '齐': 'qi2', '棋': 'qi2',
                   '卿': 'qing1', '清': 'qing1', '请': 'qing3'}
        syllables = lambda text: [mapping.get(c, c) for c in checker.normalize(text)]
        reviewed = homophones.tone_decision('晋齐卿', '禁棋清', '进棋清', syllables)
        self.assertFalse(reviewed['needsContentReview'])
        self.assertFalse(reviewed['humanListeningPerformed'])
        self.assertFalse(reviewed['subjectiveStyleAccepted'])
        self.assertTrue(reviewed['notAcousticToneProof'])
        for primary, independent in [('禁棋请', '进棋清'), ('禁棋清', '进棋请'),
                                     ('禁棋', '进棋清'), ('禁棋清', '')]:
            self.assertTrue(homophones.tone_decision('晋齐卿', primary, independent, syllables)['needsContentReview'])

    def metadata_failure_fixture(self, log_message=None, model_loaded=False):
        run = self.reserve('verification')
        model = self.stage / 'model'
        model.mkdir()
        for name in homophones.SMALL_FILES:
            (model / name).write_text('fixture')
        (self.stage / 'checks.json').write_text('[]')
        legacy = self.stage / 'work/revision-3/voices/checks.json'
        legacy.parent.mkdir(parents=True)
        legacy.write_text('[]')
        partial = {'status': 'checking', 'clips': [],
            'initialChecksSha256': palette.sha(self.stage / 'checks.json'),
            'legacyChecksSha256': palette.sha(legacy)}
        if model_loaded:
            partial['modelHashes'] = {}
        palette.save(self.stage / 'homophone-review.json', partial)
        log = self.stage / 'metadata-error.log'
        log.write_text(log_message or f"STOP: FileNotFoundError: [Errno 2] No such file or directory: '{model}/vocabulary.json'\n")
        budget, _ = palette.load_state(self.stage)
        budget['phases']['verification']['runs'][-1].update(
            workerCommand=[str(self.stage / 'tools/review-voice-homophones.py')], log='metadata-error.log')
        palette.save(self.stage / 'budget.json', budget)
        palette.finish_run(self.stage, 'verification', run['id'], 1.379, False, 'pre-model metadata filename', 1)
        return model

    def test_explicit_pre_model_fix_preserves_failed_log_charge_limit_and_attempts(self):
        model = self.metadata_failure_fixture()
        attempts = palette.read_json(self.stage / 'attempts.json')
        with mock.patch.object(homophones, 'ROOT', self.stage):
            homophones.continue_pre_model_filename_fix(self.stage, model)
            with self.assertRaises(homophones.palette.Stopped):
                homophones.continue_pre_model_filename_fix(self.stage, model)
        budget, after = palette.load_state(self.stage)
        phase = budget['phases']['verification']
        self.assertEqual(phase['chargedSeconds'], 1.379)
        self.assertEqual(phase['limitSeconds'], 240)
        self.assertEqual(phase['runs'][0]['status'], 'failed')
        self.assertFalse(phase['blocked'])
        self.assertEqual(after, attempts)
        self.assertEqual(len(list(self.stage.glob('homophone-review-pre-model-failure-*.json'))), 1)

    def test_pre_model_fix_never_retries_unknown_failure(self):
        model = self.metadata_failure_fixture('STOP: TimeoutError: budget exhausted\n')
        before = palette.read_json(self.stage / 'budget.json')
        with mock.patch.object(homophones, 'ROOT', self.stage):
            with self.assertRaises(homophones.palette.Stopped):
                homophones.continue_pre_model_filename_fix(self.stage, model)
        self.assertEqual(palette.read_json(self.stage / 'budget.json'), before)
        self.assertTrue((self.stage / 'homophone-review.json').exists())

    def test_pre_model_fix_never_retries_a_loaded_asr_model(self):
        model = self.metadata_failure_fixture(model_loaded=True)
        before = palette.read_json(self.stage / 'budget.json')
        with mock.patch.object(homophones, 'ROOT', self.stage):
            with self.assertRaises(homophones.palette.Stopped):
                homophones.continue_pre_model_filename_fix(self.stage, model)
        self.assertEqual(palette.read_json(self.stage / 'budget.json'), before)
        self.assertTrue((self.stage / 'homophone-review.json').exists())

    def test_traditional_simplified_equivalence_uses_the_same_contextual_tone(self):
        self.assertEqual(orthography.syllables('諸侯成為主角'), orthography.syllables('诸侯成为主角'))
        self.assertIn('wei2', orthography.syllables('諸侯成為主角'))
        self.assertEqual(orthography.canonical_reading_text('敬请晋卿'), '敬请晋卿')
        self.assertNotEqual(orthography.syllables('分敬'), orthography.syllables('分晋'))
        self.assertNotEqual(orthography.syllables('请大夫'), orthography.syllables('卿大夫'))

    def test_homophones_are_disclosed_and_require_human_review(self):
        heard = palette.TEXT.replace('晋', '进').replace('齐', '棋').replace('卿', '清')
        mapping = {'晋': 'jin', '进': 'jin', '齐': 'qi', '棋': 'qi', '卿': 'qing', '清': 'qing'}
        phonetic = lambda text: [mapping.get(c, c) for c in checker.normalize(text)]
        check = checker.transcript_check(palette.TEXT, heard, phonetic)
        self.assertEqual(check['phoneticSimilarity'], 1)
        self.assertFalse(check['exactTextMatch'])
        self.assertLess(check['textSimilarity'], 1)
        self.assertEqual(sum(len(d['expected']) for d in check['textDifferences']), 3)
        self.assertEqual(''.join(d['expected'] for d in check['textDifferences']), '晋齐卿')
        self.assertTrue(check['contentScreenPassed'])
        self.assertTrue(check['needsContentReview'])
        self.assertFalse(check['humanListeningPerformed'])
        self.assertFalse(check['subjectiveStyleAccepted'])

    def test_unrelated_empty_asr_fails_and_exact_text_is_not_voice_approval(self):
        phonetic = lambda text: list(checker.normalize(text))
        for heard in ['', '今天的天气很好']:
            check = checker.transcript_check(palette.TEXT, heard, phonetic)
            self.assertFalse(check['contentScreenPassed'])
            self.assertTrue(check['needsContentReview'])
        check = checker.transcript_check(palette.TEXT, palette.TEXT.replace('。', ''), phonetic)
        self.assertTrue(check['exactTextMatch'])
        self.assertFalse(check['needsContentReview'])
        self.assertFalse(check['subjectiveStyleAccepted'])
        self.assertFalse(checker.ASR_CONFIG['expectedTextPrompt'])
        self.assertEqual(checker.ASR_CONFIG['device'], 'cpu')
        self.assertEqual(checker.ASR_CONFIG['numWorkers'], 1)
        self.assertEqual(checker.ASR_CONFIG['phoneticSimilarityMinimum'], .9)


if __name__ == '__main__':
    unittest.main(verbosity=2)
