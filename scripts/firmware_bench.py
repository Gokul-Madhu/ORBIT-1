"""Build and test the independent Zephyr sample-timeout bench in Linux."""
import hashlib
import json
import os
from pathlib import Path
from queue import Empty, Queue
import signal
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'zephyr' / 'build-sensor-bench'
RUNTIME = ROOT / '.runtime'


def main():
    RUNTIME.mkdir(exist_ok=True)
    qemu = Path(os.environ.get('QEMU_BIN_PATH', '/usr/bin')) / 'qemu-system-i386'
    with (RUNTIME / 'firmware-bench-build.log').open('w') as log:
        subprocess.run(['west', 'build', '-b', 'qemu_x86/atom', '-d', str(BUILD),
                        str(ROOT / 'zephyr' / 'bench'), '--', f'-DQEMU={qemu}'],
                       cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=240)
    process = subprocess.Popen(['west', 'build', '-d', str(BUILD), '-t', 'run'],
                               cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, start_new_session=True)
    records = Queue()
    trace = []

    def read():
        with (RUNTIME / 'firmware-bench.log').open('wb') as log:
            for line in process.stdout:
                log.write(line)
                log.flush()
                if b'BENCH,' in line:
                    _, clock, state, value, sequence = line[line.index(b'BENCH,'):].strip().decode().split(',')
                    records.put({'uptime_ms': int(clock), 'state': state, 'value': int(value),
                                 'sequence': int(sequence)})

    reader = threading.Thread(target=read, daemon=True)
    reader.start()

    def expect(state, value, sequence, timeout=10):
        try:
            row = records.get(timeout=timeout)
        except Empty:
            raise AssertionError(f'Firmware did not report {state}') from None
        if (row['state'], row['value'], row['sequence']) != (state, value, sequence):
            raise AssertionError(f'Unexpected firmware record: {row}')
        trace.append(row)
        return row

    try:
        expect('WAITING', -1, 0)
        process.stdin.write(b'3')
        process.stdin.flush()
        first = expect('VALID', 3, 1)
        stale = expect('STALE', -1, 1)
        delay = stale['uptime_ms'] - first['uptime_ms']
        if not 1000 <= delay <= 1250:
            raise AssertionError(f'Firmware timeout outside expected window: {delay} ms')
        process.stdin.write(b'7')
        process.stdin.flush()
        expect('VALID', 7, 2)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=8)
        reader.join(timeout=3)
        process.stdin.close()
        process.stdout.close()
    image = BUILD / 'zephyr' / 'zephyr.elf'
    report = {'passed': True, 'source': 'Zephyr UART in QEMU', 'timeout_ms': delay,
              'firmware_sha256': hashlib.sha256(image.read_bytes()).hexdigest(), 'trace': trace}
    target = RUNTIME / 'firmware-bench.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(report, indent=2))
    temporary.replace(target)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
