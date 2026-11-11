"""Three additional native-preset auditions; never a production re-recording.

--plan is read-only. --generate explicitly authorizes this already fixed local
job. A persistent reservation is charged BEFORE starting any model process;
an interrupted reservation is never refunded on restart. Failed jobs latch
closed. The inherited flock and GNU timeout also survive a supervisor crash.
Heavy dependencies are imported only in the supervised, offline worker.
"""
import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'work/voice-palette'
MODEL_NAME = 'Qwen3-TTS-12Hz-1.7B-CustomVoice'
REVISION = '0c0e3051f131929182e2c023b9537f8b1c68adfe'
MODEL = ROOT / 'work/models' / MODEL_NAME / REVISION
QWEN_PYTHON = ROOT.parent / 'time-eigentime-org/.venv-qwen/bin/python'
ASR_PYTHON = ROOT.parent / '.venv-asr/bin/python'
TIMEOUT = Path('/usr/bin/timeout')
PIPELINE = 'native-voice-palette-v1'
TEXT = '春秋的霸主秩序散了。三家分晋、田氏专齐，卿大夫取代诸侯成为主角。'
SPECS = [
    {'id': 'vivian', 'title': 'Vivian · 原生预设', 'speaker': 'Vivian', 'seed': 1401},
    {'id': 'aiden', 'title': 'Aiden · 原生预设', 'speaker': 'Aiden', 'seed': 1402},
    {'id': 'ryan', 'title': 'Ryan · 原生预设', 'speaker': 'Ryan', 'seed': 1403},
]
INSTRUCTION = '用标准普通话作平实的历史解说。语速适中均匀，声线自然，情绪中性，停顿轻，句尾平稳落下。'
SAMPLING = {
    'do_sample': True, 'temperature': .9, 'top_p': 1.0, 'top_k': 50,
    'repetition_penalty': 1.05, 'subtalker_dosample': True,
    'subtalker_temperature': .9, 'subtalker_top_p': 1.0, 'subtalker_top_k': 50,
    'max_new_tokens': 240,
}
LIMITS = {
    'clips': 3, 'maxClipSeconds': 20, 'maxTotalAudioSeconds': 60,
    'minClipSeconds': len(TEXT) / 12, 'maxNewTokens': 240,
    'maxGenerationAttemptsPerSpeaker': 1, 'concurrency': 1,
    'inferenceSeconds': 600, 'verificationSeconds': 240,
    'ffmpegSubprocessSeconds': 20, 'maxTailSilenceSeconds': 1,
    'minPhoneticSimilarity': .9, 'maxDecodedPeak': .99,
}
AUTHORIZATION = {
    'source': 'current-user-request',
    'request': '用户本轮要求另多提供几种配音；追加 Vivian、Aiden、Ryan 三条本地原生预设短样。',
    'scope': 'local additional short auditions only; not a full narration pass',
    'userAuditionAccepted': False, 'productionRerecordingAuthorized': False,
    'usesReferenceVoiceBudget': False,
}
POSTPROCESS = {
    'operations': ['loudness normalization only'],
    'ffmpegFilter': 'loudnorm=I=-20:TP=-2:LRA=7',
    'pitchShiftSemitones': 0, 'tempoFactor': 1, 'trimSilence': False,
    'sampleRate': 24000, 'channels': 1, 'mp3Bitrate': '96k',
}
PHASE_LIMITS = {'generation': 600, 'verification': 240}


class Stopped(RuntimeError):
    """A terminal local failure: preserve evidence and do not retry."""


def utc():
    return datetime.now(timezone.utc).isoformat()


def contract():
    return {'pipeline': PIPELINE, 'model': MODEL_NAME, 'revision': REVISION,
            'text': TEXT, 'speakers': SPECS, 'instruction': INSTRUCTION,
            'language': 'Chinese', 'nonStreamingMode': True,
            'sampling': SAMPLING, 'limits': LIMITS, 'authorization': AUTHORIZATION,
            'quantization': 'NF4 talker / float32 CPU decoder',
            'postprocess': POSTPROCESS}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':')).encode()).hexdigest()


def sha(path, deadline=None):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            if deadline is not None:
                seconds_left(deadline)
            h.update(block)
    return h.hexdigest()


def save(path, value):
    """Atomic JSON, including fsync, under the job's exclusive lock."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read_json(path):
    with Path(path).open(encoding='utf-8') as stream:
        return json.load(stream)


class ExclusiveLock:
    def __init__(self, stage=STAGE):
        self.stage = Path(stage)
        self.stream = None

    def __enter__(self):
        self.stage.mkdir(parents=True, exist_ok=True)
        self.stream = (self.stage / 'palette.lock').open('a')
        try:
            fcntl.flock(self.stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.stream.close()
            raise Stopped('Another palette job holds the exclusive lock; concurrency is 1')
        return self.stream.fileno()

    def __exit__(self, *_):
        # Do not explicitly unlock: the worker/timeout inherit this open file
        # description, so it must remain locked if the supervisor dies.
        self.stream.close()


def load_state(stage=STAGE, create=False):
    stage = Path(stage)
    bp, ap = stage / 'budget.json', stage / 'attempts.json'
    if not bp.exists() and not ap.exists() and create:
        evidence = list(stage.glob('*.mp3')) + list(stage.glob('*.wav'))
        evidence += [stage / name for name in ['report.json', 'checks.json', 'verification.json']
                     if (stage / name).exists()]
        evidence += list((stage / 'runs').glob('*')) if (stage / 'runs').exists() else []
        evidence += list(stage.glob('*.json.tmp'))
        if evidence:
            raise Stopped('Records missing but prior run evidence exists; never reset authorization')
        budget = {'schema': 1, 'contractHash': fingerprint(contract()),
                  'authorization': AUTHORIZATION, 'createdAt': utc(), 'phases': {
                      phase: {'limitSeconds': limit, 'chargedSeconds': 0, 'blocked': False, 'runs': []}
                      for phase, limit in PHASE_LIMITS.items()}}
        attempts = {'schema': 1, 'contractHash': fingerprint(contract()), 'phases': {
            phase: {spec['id']: {'count': 0, 'status': 'pending'} for spec in SPECS}
            for phase in PHASE_LIMITS}}
        save(bp, budget)
        save(ap, attempts)
    if not bp.exists() or not ap.exists():
        raise Stopped('Both persistent budget and attempt records are required; no implicit reset')
    budget, attempts = read_json(bp), read_json(ap)
    for record in [budget, attempts]:
        if record.get('schema') != 1 or record.get('contractHash') != fingerprint(contract()):
            raise Stopped('Fixed contract changed or record is corrupt; attempts/budget remain consumed')
        if set(record.get('phases', {})) != set(PHASE_LIMITS):
            raise Stopped('Missing or unexpected budget/attempt phase')
    if budget.get('authorization') != AUTHORIZATION:
        raise Stopped('Authorization source changed')
    for phase, limit in PHASE_LIMITS.items():
        entry = budget['phases'][phase]
        charge = entry.get('chargedSeconds')
        if entry.get('limitSeconds') != limit or not isinstance(charge, (int, float)) \
                or not math.isfinite(charge) or charge < 0 or not isinstance(entry.get('blocked'), bool):
            raise Stopped('Invalid persistent time limit or charge')
        recorded = 0
        for run in entry.get('runs', []):
            if run.get('status') not in {'reserved', 'completed', 'failed', 'abandoned'}:
                raise Stopped('Invalid run status')
            amount = run['reservedSeconds'] if run['status'] in {'reserved', 'abandoned'} else run['spentSeconds']
            if not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount < 0:
                raise Stopped('Invalid recorded run charge')
            recorded += amount
        if abs(recorded - charge) > .00001:
            raise Stopped('Cumulative charge does not match persistent runs')
        entries = attempts['phases'][phase]
        if set(entries) != {spec['id'] for spec in SPECS}:
            raise Stopped('Stable speaker attempt identities must not be removed or renamed')
        for attempt in entries.values():
            if type(attempt.get('count')) is not int or not 0 <= attempt['count'] <= 1:
                raise Stopped('Invalid or exhausted per-speaker attempt record')
            if attempt.get('status') not in {'pending', 'running', 'completed', 'failed', 'interrupted'}:
                raise Stopped('Invalid attempt status')
            if (attempt['status'] == 'pending') != (attempt['count'] == 0):
                raise Stopped('Attempt count/status mismatch')
    return budget, attempts


def stop_abandoned(stage=STAGE):
    """Called only after acquiring the lock; a live inherited worker blocks it."""
    budget, attempts = load_state(stage)
    abandoned = False
    for phase, entry in budget['phases'].items():
        for run in entry['runs']:
            if run['status'] == 'reserved':
                run.update(status='abandoned', recoveredAt=utc(),
                           error='Supervisor interrupted; full reservation remains charged')
                entry['blocked'] = True
                abandoned = True
                for attempt in attempts['phases'][phase].values():
                    if attempt['status'] == 'running':
                        attempt.update(status='interrupted', error=run['error'])
    if abandoned:
        save(Path(stage) / 'budget.json', budget)
        save(Path(stage) / 'attempts.json', attempts)
        raise Stopped('Interrupted job is terminal; full reserved time and completed clips preserved')


def reserve_run(stage, phase, command, started=None):
    budget, _ = load_state(stage)
    if any(run['status'] == 'reserved' for entry in budget['phases'].values() for run in entry['runs']):
        raise Stopped('An unresolved reservation prevents another run')
    entry = budget['phases'][phase]
    if entry['blocked']:
        raise Stopped(f'{phase} previously failed; no automatic recovery/retry')
    remaining = entry['limitSeconds'] - entry['chargedSeconds']
    if remaining <= 3:
        raise Stopped(f'{phase} cumulative authorized budget exhausted')
    started = time.monotonic() if started is None else started
    run = {'id': uuid.uuid4().hex, 'status': 'reserved', 'reservedSeconds': remaining,
           'startedAt': utc(), 'startedMonotonic': started,
           'hardDeadlineMonotonic': started + remaining - 2, 'command': command,
           'supervisorPid': os.getpid()}
    entry['runs'].append(run)
    entry['chargedSeconds'] += remaining
    save(Path(stage) / 'budget.json', budget)
    return run


def finish_run(stage, phase, run_id, spent, success, error=None, exit_code=None):
    budget, attempts = load_state(stage)
    entry = budget['phases'][phase]
    run = next(r for r in entry['runs'] if r['id'] == run_id)
    if run['status'] != 'reserved':
        raise Stopped('A reservation may be settled only once')
    spent = math.ceil(max(0, spent) * 1000) / 1000  # never round authorized time down
    success = bool(success and spent <= run['reservedSeconds'])
    run.update(status='completed' if success else 'failed', spentSeconds=spent,
               finishedAt=utc(), exitCode=exit_code)
    if error:
        run['error'] = str(error)
    if spent > run['reservedSeconds']:
        run['limitExceeded'] = True  # record honestly, never conceal an overrun by clamping
    entry['chargedSeconds'] = round(entry['chargedSeconds'] - run['reservedSeconds'] + spent, 3)
    if not success:
        entry['blocked'] = True
        for attempt in attempts['phases'][phase].values():
            if attempt['status'] == 'running':
                attempt.update(status='failed', error=str(error or 'Worker stopped'))
        save(Path(stage) / 'attempts.json', attempts)
    save(Path(stage) / 'budget.json', budget)
    return run


def begin_attempt(stage, phase, key, run_id):
    budget, attempts = load_state(stage)
    entry = budget['phases'][phase]
    if entry['blocked'] or not any(r['id'] == run_id and r['status'] == 'reserved' for r in entry['runs']):
        raise Stopped('An active bounded reservation is required before any attempt')
    attempt = attempts['phases'][phase][key]
    if attempt['count'] or attempt['status'] != 'pending':
        raise Stopped(f'{key}: one attempt already consumed; text/cache changes cannot reset it')
    attempt.update(count=1, status='running', runId=run_id, startedAt=utc())
    save(Path(stage) / 'attempts.json', attempts)


def update_attempt(stage, phase, key, **values):
    _, attempts = load_state(stage)
    attempt = attempts['phases'][phase][key]
    if attempt['count'] != 1 or {'count', 'runId'} & values.keys():
        raise Stopped('Attempt count/run identity must never be reset')
    attempt.update(values)
    save(Path(stage) / 'attempts.json', attempts)


def seconds_left(deadline, maximum=None):
    left = deadline - time.monotonic() - .25
    if left <= .1:
        raise TimeoutError('Absolute job deadline reached; do not retry')
    return min(left, maximum) if maximum is not None else left


def bounded_subprocess(command, deadline, **kwargs):
    """Both Python timeout and an independent OS-process timeout, no retries."""
    limit = seconds_left(deadline, LIMITS['ffmpegSubprocessSeconds'])
    return subprocess.run([str(TIMEOUT), '--foreground', '--signal=KILL', f'{limit:.6f}s', *command],
                          timeout=limit + .1, check=True, **kwargs)


def offline_environment():
    cache = STAGE / 'runtime-cache'
    temp = STAGE / 'tmp'
    temp.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_DATASETS_OFFLINE='1',
               HF_HUB_DISABLE_TELEMETRY='1', PYTHONDONTWRITEBYTECODE='1',
               TOKENIZERS_PARALLELISM='false', TMPDIR=str(temp))
    for key, folder in {'XDG_CACHE_HOME': 'xdg', 'HF_HOME': 'hf', 'TORCH_HOME': 'torch',
                        'TORCH_EXTENSIONS_DIR': 'torch-extensions', 'TORCHINDUCTOR_CACHE_DIR': 'inductor',
                        'TRITON_CACHE_DIR': 'triton', 'CUDA_CACHE_PATH': 'cuda',
                        'NUMBA_CACHE_DIR': 'numba', 'MPLCONFIGDIR': 'matplotlib'}.items():
        env[key] = str(cache / folder)
    return env


def block_network():
    import socket
    def denied(*_, **__):
        raise Stopped('Network access prohibited: cached local models only')
    socket.create_connection = denied
    socket.socket.connect = denied
    socket.socket.connect_ex = denied


def worker_reservation(phase, run_id, lock_fd):
    if lock_fd < 0:
        raise Stopped('Internal worker requires an inherited exclusive lock')
    stat, locked = os.stat(STAGE / 'palette.lock'), os.fstat(lock_fd)
    if (stat.st_dev, stat.st_ino) != (locked.st_dev, locked.st_ino):
        raise Stopped('Wrong inherited lock')
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    budget, _ = load_state()
    entry = budget['phases'][phase]
    run = next((r for r in entry['runs'] if r['id'] == run_id and r['status'] == 'reserved'), None)
    if not run or entry['blocked'] or os.getpgrp() == os.getpid():
        raise Stopped('Worker must be launched inside the active GNU timeout process group')
    def expired(*_):
        raise TimeoutError('Fixed absolute job deadline reached')
    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds_left(run['hardDeadlineMonotonic']))
    block_network()
    return run


def run_supervised(phase, python, script, lock_fd):
    if not python.is_file() or not TIMEOUT.is_file():
        raise Stopped('Existing local Python environment and GNU timeout are required; no installation')
    run = reserve_run(STAGE, phase, [str(python), '-B', str(script), '--generate' if phase == 'generation' else '--check'])
    log = STAGE / 'runs' / f'{phase}-{run["id"]}.log'
    log.parent.mkdir(parents=True, exist_ok=True)
    process, error, code = None, None, None
    try:
        limit = seconds_left(run['hardDeadlineMonotonic'])
        command = [str(TIMEOUT), '--signal=KILL', f'{limit:.6f}s', str(python), '-B', str(script),
                   '--_worker', run['id'], str(lock_fd)]
        budget, _ = load_state()
        budget['phases'][phase]['runs'][-1].update(workerCommand=command, log=str(log.relative_to(ROOT)))
        save(STAGE / 'budget.json', budget)
        print(f'{phase}: fixed offline job started; log {log.relative_to(ROOT)}', flush=True)
        with log.open('xb') as output:
            process = subprocess.Popen(command, cwd=ROOT, env=offline_environment(),
                                       stdout=output, stderr=subprocess.STDOUT,
                                       start_new_session=True, pass_fds=(lock_fd,))
            code = process.wait(timeout=seconds_left(run['hardDeadlineMonotonic']) + .5)
        if code:
            raise Stopped(f'{phase} worker exited {code}; stop without retry; inspect {log.relative_to(ROOT)}')
    except BaseException as exc:
        error = exc
    finally:
        # Kill the ENTIRE worker group, also on nonzero exit/parent termination.
        if process is not None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                error = error or TimeoutError('Worker failed to stop at hard deadline')
        signal.setitimer(signal.ITIMER_REAL, 0)
        settled = finish_run(STAGE, phase, run['id'], time.monotonic() - run['startedMonotonic'],
                             error is None, error, code)
    if error:
        raise error
    if settled['status'] != 'completed':
        raise Stopped('Hard limit exceeded; do not publish')
    return settled


def validate_model_config():
    config = read_json(MODEL / 'config.json')
    if config.get('tts_model_size') != '1b7' or config.get('tts_model_type') != 'custom_voice':
        raise Stopped('Fixed controllable 1.7B CustomVoice model required')
    talker = config['talker_config']
    for spec in SPECS:
        key = spec['speaker'].lower()
        if key not in talker['spk_id'] or talker['spk_is_dialect'].get(key) is not False:
            raise Stopped(f'{key}: cached config does not support the requested non-dialect preset')
    return config


def token_check(generated_tokens, codec_tokens, stopped_on_eos):
    if not stopped_on_eos or not 1 < generated_tokens < LIMITS['maxNewTokens'] \
            or not 0 < codec_tokens < LIMITS['maxNewTokens'] - 1:
        raise Stopped('Generation reached token limit or lacked EOS; reject, never publish/retry')


def validate_duration(duration, total):
    if not math.isfinite(duration) or not LIMITS['minClipSeconds'] <= duration <= LIMITS['maxClipSeconds']:
        raise Stopped('Sample duration outside the fixed bounds; no shorter-text recovery')
    if total > LIMITS['maxTotalAudioSeconds']:
        raise Stopped('Total sample duration exceeds 60 seconds')


def clip_identity(spec):
    return fingerprint({'contractHash': fingerprint(contract()), 'speaker': spec})


def validate_report(stage=STAGE, require_complete=True):
    stage = Path(stage)
    report = read_json(stage / 'report.json')
    if report.get('hash') != fingerprint(contract()) or report.get('revision') != REVISION \
            or report.get('model') != MODEL_NAME or report.get('limits') != LIMITS \
            or report.get('postprocess') != POSTPROCESS or report.get('authorization') != AUTHORIZATION:
        raise Stopped('Report differs from the fixed authorized contract')
    clips = report['clips']
    if require_complete and (len(clips) != 3 or report.get('status') != 'complete'):
        raise Stopped(f'Only {len(clips)}/3 completed samples; failed/partial job must be reported')
    if len(clips) > 3:
        raise Stopped('Unexpected additional samples')
    total = 0
    for clip, spec in zip(clips, SPECS):
        key = spec['id']
        if any(clip.get(field) != spec[field] for field in ['id', 'speaker', 'title']) \
                or clip.get('text') != TEXT or clip.get('spokenText') != TEXT \
                or clip.get('file') != f'{key}.mp3' or clip.get('rawFile') != f'{key}-raw.wav' \
                or clip.get('hash') != clip_identity(spec) or clip.get('maxNewTokens') != 240:
            raise Stopped('Speaker/text/file/cache identity changed; never regenerate it implicitly')
        token_check(clip['generatedTokens'], clip['codecTokens'], clip['stoppedOnEos'])
        if clip.get('styleInstructionTokens', 0) <= 0:
            raise Stopped('Style instruction was discarded')
        total += clip['duration']
        validate_duration(clip['duration'], total)
        for file_field, hash_field in [('file', 'sha256'), ('rawFile', 'rawSha256')]:
            if sha(stage / clip[file_field]) != clip[hash_field]:
                raise Stopped(f'{key}: cached audio SHA mismatch; do not re-generate')
    if abs(total - report.get('totalDurationSeconds', total)) > .00001:
        raise Stopped('Report total does not match clip durations')
    return report


def initial_report():
    return {**contract(), 'hash': fingerprint(contract()), 'modelPath': str(MODEL),
            'status': 'generating', 'createdAt': utc(), 'clips': [], 'totalDurationSeconds': 0,
            'productionFilesChanged': False, 'humanListeningPerformed': False,
            'subjectiveStyleAccepted': False, 'requiresUserSelection': True,
            'runtimeSettings': {'reasoningLevel': os.environ.get('PI_REASONING_LEVEL', 'not visible'),
                                'model': os.environ.get('PI_MODEL', 'not visible')}}


def generate_worker(run_id, lock_fd):
    run = worker_reservation('generation', run_id, lock_fd)
    deadline, active_key = run['hardDeadlineMonotonic'], None
    try:
        config = validate_model_config()
        sys.path.insert(0, str(ROOT / 'work/style-deps'))
        from pronunciation import spoken
        if spoken(TEXT) != TEXT:
            raise Stopped('The exact approved short text must not be rewritten')
        import numpy as np
        import soundfile as sf
        import torch
        import bitsandbytes as bnb
        from importlib.metadata import version
        from transformers import BitsAndBytesConfig
        from qwen_tts import Qwen3TTSModel
        from qwen_tts.inference.qwen3_tts_tokenizer import Qwen3TTSTokenizer
        if not torch.cuda.is_available():
            raise Stopped('Local CUDA unavailable; no CPU-talker or cloud fallback')
        if not Path(bnb.__file__).resolve().is_relative_to((ROOT / 'work/style-deps').resolve()):
            raise Stopped('Use only the existing work/style-deps NF4 dependency')
        torch.set_num_threads(4)
        hashes = {name: sha(MODEL / name, deadline) for name in [
            'config.json', 'generation_config.json', 'model.safetensors',
            'preprocessor_config.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt',
            'speech_tokenizer/config.json', 'speech_tokenizer/preprocessor_config.json',
            'speech_tokenizer/model.safetensors']}
        codec_loader = Qwen3TTSTokenizer.from_pretrained.__func__
        def cpu_codec(cls, path, **kwargs):
            if Path(path).resolve() != (MODEL / 'speech_tokenizer').resolve():
                raise Stopped('Unexpected decoder path')
            kwargs.pop('quantization_config', None)
            kwargs.update(device_map='cpu', dtype=torch.float32, local_files_only=True)
            return codec_loader(cls, path, **kwargs)
        Qwen3TTSTokenizer.from_pretrained = classmethod(cpu_codec)
        model = Qwen3TTSModel.from_pretrained(
            str(MODEL), device_map='cuda:0', dtype=torch.bfloat16,
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.bfloat16, llm_int8_skip_modules=['codec_head', 'lm_head']),
            attn_implementation='sdpa', local_files_only=True)
        if model.model.tts_model_size != '1b7' or model.model.tts_model_type != 'custom_voice':
            raise Stopped('Loaded wrong model type/size')
        if not {s['speaker'].lower() for s in SPECS} <= set(model.get_supported_speakers() or []):
            raise Stopped('Requested native speakers unavailable')
        decoder = model.model.speech_tokenizer.model
        decoder_devices = sorted({str(p.device) for p in decoder.parameters()})
        decoder_dtypes = sorted({str(p.dtype) for p in decoder.parameters() if p.is_floating_point()})
        quantized = [m for m in model.model.talker.modules() if isinstance(m, bnb.nn.Linear4bit)]
        if decoder_devices != ['cpu'] or decoder_dtypes != ['torch.float32'] or not quantized \
                or any(m.weight.quant_type != 'nf4' for m in quantized) \
                or any(isinstance(m, bnb.nn.Linear4bit) for m in decoder.modules()):
            raise Stopped('Required NF4 talker / unquantized CPU float32 decoder not achieved')
        report = read_json(STAGE / 'report.json')
        report.update(modelHashes=hashes, speakerIds={s['id']: config['talker_config']['spk_id'][s['id']] for s in SPECS},
                      scriptSha256=sha(Path(__file__)), pronunciationSha256=sha(ROOT / 'tools/pronunciation.py'),
                      runtime={'python': sys.version, 'torch': torch.__version__, 'qwenTts': version('qwen-tts'),
                               'bitsandbytes': bnb.__version__, 'bitsandbytesPath': bnb.__file__,
                               'cudaDevice': torch.cuda.get_device_name(0), 'talkerDevice': 'cuda:0',
                               'quantizedTalkerLinearLayers': len(quantized),
                               'decoderDevices': decoder_devices, 'decoderFloatingDtypes': decoder_dtypes,
                               'torchCpuThreads': 4, 'offline': True, 'networkBlocked': True},
                      modelLoadedElapsedSeconds=round(time.monotonic() - run['startedMonotonic'], 3))
        save(STAGE / 'report.json', report)
        print(f'Loaded fixed 1.7B; {len(quantized)} NF4 layers; decoder CPU float32', flush=True)
        stats = {}
        original_talker = model.model.talker.generate
        def verified_talker(**kwargs):
            if kwargs.get('max_new_tokens') != 240:
                raise Stopped('Token cap changed')
            result = original_talker(**kwargs)
            if result.sequences.ndim != 2 or result.sequences.shape[0] != 1:
                raise Stopped('Only one sample may be generated at a time')
            stats.update(generatedTokens=int(result.sequences.shape[-1]),
                         stoppedOnEos=int(result.sequences[0, -1]) == config['talker_config']['codec_eos_token_id'])
            update_attempt(STAGE, 'generation', active_key, **stats)
            if stats['generatedTokens'] >= 240 or not stats['stoppedOnEos']:
                raise Stopped('Talker reached max_new_tokens or lacked EOS; reject before decoding')
            return result
        model.model.talker.generate = verified_talker
        original_generate = model.model.generate
        def verified_generation(**kwargs):
            instructions = kwargs.get('instruct_ids')
            if kwargs.get('max_new_tokens') != 240 or not instructions or len(instructions) != 1 \
                    or instructions[0] is None or instructions[0].numel() <= 0:
                raise Stopped('Fixed style instruction/token cap not forwarded')
            stats['styleInstructionTokens'] = int(instructions[0].numel())
            result = original_generate(**kwargs)
            if len(result[0]) != 1:
                raise Stopped('Unexpected generation batch')
            stats['codecTokens'] = int(result[0][0].shape[0])
            update_attempt(STAGE, 'generation', active_key, **stats)
            token_check(stats['generatedTokens'], stats['codecTokens'], stats['stoppedOnEos'])
            return result
        model.model.generate = verified_generation
        total = 0
        for spec in SPECS:
            active_key, stats = spec['id'], {}
            seconds_left(deadline)
            begin_attempt(STAGE, 'generation', active_key, run_id)
            clip_started = time.monotonic()
            torch.manual_seed(spec['seed'])
            audio, sr = model.generate_custom_voice(text=TEXT, language='Chinese', speaker=spec['speaker'],
                                                    instruct=INSTRUCTION, non_streaming_mode=True, **SAMPLING)
            a = np.asarray(audio[0], dtype=np.float32)
            if len(audio) != 1 or sr != 24000 or a.ndim != 1 or not len(a) or not np.isfinite(a).all():
                raise Stopped('Invalid waveform/sample rate')
            peak = float(np.max(np.abs(a)))
            if not .001 <= peak < 1:
                raise Stopped('Silent or clipped raw waveform')
            duration = len(a) / sr
            validate_duration(duration, total + duration)
            raw = STAGE / f'{active_key}-raw.wav'
            target = STAGE / f'{active_key}.mp3'
            temporary = STAGE / f'{active_key}.pending.mp3'
            if any(path.exists() for path in [raw, target, temporary]):
                raise Stopped('Prior audio evidence exists; do not overwrite or retry')
            with raw.open('xb') as stream:
                sf.write(stream, a, sr, format='WAV', subtype='PCM_16')
            bounded_subprocess(['ffmpeg', '-v', 'error', '-n', '-i', str(raw),
                                '-af', POSTPROCESS['ffmpegFilter'], '-ar', '24000', '-ac', '1', '-b:a', '96k',
                                '-metadata', 'title=AI合成本地原生预设短样',
                                '-metadata', 'comment=本轮追加短样，未经用户试听选定；不替换生产配音。',
                                str(temporary)], deadline, capture_output=True)
            seconds_left(deadline)
            temporary.replace(target)
            total += duration
            clip = {**{k: spec[k] for k in ['id', 'title', 'speaker']}, 'text': TEXT, 'spokenText': TEXT,
                    'file': target.name, 'rawFile': raw.name, 'duration': round(duration, 6),
                    'sampleRate': sr, 'rawFrames': len(a), 'rawPeak': peak,
                    'sha256': sha(target, deadline), 'rawSha256': sha(raw, deadline),
                    'hash': clip_identity(spec), 'modelRevision': REVISION, 'seed': spec['seed'],
                    'attempt': 1, 'maxNewTokens': 240, **stats,
                    'elapsedSeconds': round(time.monotonic() - clip_started, 3)}
            report = read_json(STAGE / 'report.json')
            report['clips'].append(clip)
            report.update(totalDurationSeconds=round(total, 6),
                          elapsedSeconds=round(time.monotonic() - run['startedMonotonic'], 3))
            save(STAGE / 'report.json', report)
            update_attempt(STAGE, 'generation', active_key, status='completed', finishedAt=utc(),
                           sha256=clip['sha256'], duration=clip['duration'])
            print(f'{active_key}: {duration:.2f}s, {stats["generatedTokens"]} generated tokens; attempt 1/1', flush=True)
        report.update(status='complete', completedAt=utc(), requiresLocalScreening=True)
        save(STAGE / 'report.json', report)
        validate_report()
    except BaseException as exc:
        if active_key:
            update_attempt(STAGE, 'generation', active_key, status='failed', error=f'{type(exc).__name__}: {exc}')
        if (STAGE / 'report.json').exists():
            report = read_json(STAGE / 'report.json')
            report.update(status='failed', error=f'{type(exc).__name__}: {exc}', stoppedAt=utc())
            save(STAGE / 'report.json', report)
        raise
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


def cached_generation(stage=STAGE):
    budget, attempts = load_state(stage)
    if budget['phases']['generation']['blocked']:
        raise Stopped('Generation failed/interrupted; preserve completed samples and report to parent, no retry')
    report = validate_report(stage)
    for clip in report['clips']:
        attempt = attempts['phases']['generation'][clip['id']]
        if attempt['count'] != 1 or attempt['status'] != 'completed' \
                or attempt.get('sha256') != clip['sha256'] or attempt.get('duration') != clip['duration']:
            raise Stopped('Completed audio lacks matching persistent attempts/SHA/duration')
    runs = budget['phases']['generation']['runs']
    if not runs or runs[-1]['status'] != 'completed' or report.get('generationRunId') != runs[-1]['id']:
        raise Stopped('Generation reservation is not settled or does not match the report')
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--plan', action='store_true', help='read-only fixed plan; no model loading')
    mode.add_argument('--generate', action='store_true', help='explicitly run the one fixed, bounded local job')
    mode.add_argument('--check-cache', action='store_true', help='read-only SHA/contract/record check, no inference')
    mode.add_argument('--_worker', nargs=2, metavar=('RUN_ID', 'LOCK_FD'), help=argparse.SUPPRESS)
    args = ap.parse_args()
    if args._worker:
        generate_worker(args._worker[0], int(args._worker[1]))
        return
    if args.plan:
        validate_model_config()
        print(json.dumps({**contract(), 'hash': fingerprint(contract()), 'modelPath': str(MODEL)}, ensure_ascii=False, indent=2))
        return
    def interrupted(*_):
        raise InterruptedError('Supervisor terminated; no retry')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    with ExclusiveLock() as fd:
        budget, attempts = load_state(create=args.generate)
        stop_abandoned()
        if args.check_cache or (STAGE / 'report.json').exists():
            report = cached_generation()
            print(json.dumps({'status': 'cached', 'clips': len(report['clips']),
                              'totalDurationSeconds': report['totalDurationSeconds'],
                              'modelLoaded': False, 'newAttempts': 0}, ensure_ascii=False))
            return
        if budget['phases']['generation']['blocked'] or budget['phases']['generation']['runs'] \
                or any(a['count'] for a in attempts['phases']['generation'].values()):
            raise Stopped('Existing generation history without report; preserve evidence, never reload/retry')
        save(STAGE / 'report.json', initial_report())
        try:
            run = run_supervised('generation', QWEN_PYTHON, Path(__file__).resolve(), fd)
        except BaseException as exc:
            report = read_json(STAGE / 'report.json')
            report.update(status='failed', supervisorError=f'{type(exc).__name__}: {exc}', stoppedAt=utc())
            save(STAGE / 'report.json', report)
            raise
        report = read_json(STAGE / 'report.json')
        report.update(elapsedSeconds=run['spentSeconds'], generationRunId=run['id'],
                      generationLog=run['log'] if 'log' in run else f'work/voice-palette/runs/generation-{run["id"]}.log')
        save(STAGE / 'report.json', report)
        cached_generation()
        print(json.dumps({'status': 'complete', 'clips': 3, 'totalDurationSeconds': report['totalDurationSeconds'],
                          'inferenceChargedSeconds': run['spentSeconds'], 'productionFilesChanged': False}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'STOP: {type(error).__name__}: {error}', file=sys.stderr, flush=True)
        raise SystemExit(1)
