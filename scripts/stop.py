"""Stop only the launcher holding this project's application lock (Linux)."""
import fcntl
import os
from pathlib import Path
import signal
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8780)
args = parser.parse_args()
path = root/'.runtime'/f'app-{args.port}.lock'
if not path.exists():
    print('ORBIT-1 is not running.')
    raise SystemExit(0)
with path.open('r') as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        pid = int(lock.read())
        command = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
        cwd = Path(f'/proc/{pid}/cwd').resolve()
        if b'orbit1.launcher' not in command or cwd != root:
            raise SystemExit('Lock owner does not match this project; refusing to signal it.')
        os.kill(pid, signal.SIGTERM)
        print('Requested clean ORBIT-1 shutdown.')
    else:
        print('ORBIT-1 is not running.')
