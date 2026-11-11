"""Run local audio checks within the approved cumulative 30-minute allowance."""
import fcntl, json, os, signal, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'work/reference-voice'

def save(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    temporary.replace(path)

def main():
    command = sys.argv[1:]
    if command[:1] == ['--']: command.pop(0)
    if not command: raise SystemExit('Usage: bounded-verification.py -- <local check command>')
    STAGE.mkdir(parents=True, exist_ok=True)
    with (STAGE / 'verification.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        path = STAGE / 'verification-budget.json'
        budget = json.loads(path.read_text()) if path.exists() else {'limitSeconds': 1800, 'chargedSeconds': 0, 'runs': []}
        remaining = budget['limitSeconds'] - budget['chargedSeconds']
        if remaining < 1: raise RuntimeError('Cumulative audio verification allowance exhausted')
        run = {'command': command, 'reservedSeconds': remaining, 'status': 'reserved'}
        budget['runs'].append(run); budget['chargedSeconds'] += remaining; save(path, budget)
        started = time.monotonic()
        process = None
        try:
            process = subprocess.Popen(command, cwd=ROOT, start_new_session=True)
            try: code = process.wait(timeout=max(.1, remaining-5))
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try: process.wait(timeout=min(4, remaining))
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL); process.wait()
                raise TimeoutError('Cumulative audio verification allowance reached')
            run['exitCode'] = code
            if code: raise SystemExit(code)
        finally:
            spent = min(remaining, time.monotonic()-started)
            run.update({'status': 'finished', 'spentSeconds': round(spent, 3)})
            budget['chargedSeconds'] = round(budget['chargedSeconds'] - remaining + spent, 3)
            save(path, budget)

if __name__ == '__main__': main()
