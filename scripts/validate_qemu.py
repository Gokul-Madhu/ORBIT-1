"""Bounded, simulation-only integration check of an existing Zephyr build (Linux)."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from orbit1.dashboard import Mission
from orbit1.telemetry import parse_line


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir', default='zephyr/build-validation')
    parser.add_argument('--output', help='Optional JSON result file')
    args = parser.parse_args()
    if not os.environ.get('ZEPHYR_BASE'):
        parser.error('Set ZEPHYR_BASE to your existing Zephyr checkout first')
    # Keep each capture, preserving earlier runs and any existing QEMU logs.
    with tempfile.NamedTemporaryFile(mode='w', prefix='qemu-validation-', suffix='.log',
                                     dir=ROOT, delete=False) as output:
        log = Path(output.name)
        mission = Mission(str(log), run_tests=False)
        time.sleep(.4)  # allow the follower to seek past pre-existing contents
        process = subprocess.Popen(
            ['west', 'build', '-d', args.build_dir, '-t', 'run'],
            cwd=ROOT, stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
        )
        try:
            deadline = time.monotonic() + 40
            degraded = False
            recovered = False
            live = False
            while time.monotonic() < deadline:
                status = mission.snapshot()['qemu']
                live |= status['status'] == 'LIVE'
                packet = status['packet']
                if packet:
                    degraded |= packet['health'] == 'DEGRADED' and packet['fault_flags'] == 1
                    recovered |= degraded and packet['health'] == 'OK' and packet['fault_flags'] == 0
                if recovered or process.poll() is not None:
                    break
                time.sleep(.1)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
    packets = [p for line in log.read_text().splitlines() if (p := parse_line(line))]
    assert live and degraded and recovered, 'Missing LIVE / DEGRADED / recovered transition'
    assert mission.snapshot()['qemu']['parser_errors'] == 0
    assert len(packets) >= 25, f'Only {len(packets)} packets received'
    gaps = [b.uptime_ms-a.uptime_ms for a, b in zip(packets, packets[1:])]
    assert all(900 <= gap <= 1200 for gap in gaps), gaps
    assert all(p.sim_alt_m == 400000 and p.sim_speed_mps == 7669 for p in packets)
    time.sleep(5.1)
    assert mission.snapshot()['qemu']['status'] == 'STALE'
    result = {'passed': True, 'packets': len(packets), 'uptime_gaps_ms': [min(gaps), max(gaps)],
                      'transitions': ['LIVE', 'DEGRADED', 'OK', 'STALE'], 'parser_errors': 0,
                      'log': str(log)}
    mission.close()
    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
