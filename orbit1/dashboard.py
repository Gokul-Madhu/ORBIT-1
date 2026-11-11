"""ORBIT-1 laboratory mission-control dashboard (simulations only).

Stdlib-only localhost web server. Does not communicate with flight hardware,
issue commands to Zephyr/QEMU, or model a rocket launch or control system.
"""
from __future__ import annotations

import argparse
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from math import pi, sqrt
from pathlib import Path
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse

from .orbit import MU, R_EARTH
from .telemetry import parse_line
from .engine import Orbit
from .lab import ElectronicsLab
from .scenarios import run_scenario
from .verification import read_evidence
from dataclasses import asdict
import mimetypes
import os

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(__file__).with_name('web')
OMEGA_EARTH = 7.2921159e-5  # rad / s; illustrative Earth rotation
ALTITUDE_M = 400_000.0
INCLINATION_DEG = 51.6
PERIOD_S = 2*pi*sqrt((R_EARTH+ALTITUDE_M)**3 / MU)


def orbital_sample(t: float) -> dict:
    """Default circular reference; configurable missions use their own Orbit."""
    return Orbit().sample(t)


def ground_track(t: float, step=55, duration=None) -> list:
    orbit = Orbit()
    duration = orbit.period if duration is None else duration
    points = [orbit.sample(t+i*duration/step) for i in range(step+1)]
    return [[p['longitude_deg'], p['latitude_deg']] for p in points]


def run_existing_tests() -> dict:
    """Run the repository's unit tests and return their *real* exit result."""
    try:
        p = subprocess.run(
            [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'],
            cwd=ROOT, capture_output=True, text=True, timeout=25, check=False,
        )
        output = p.stdout + p.stderr
        import re
        match = re.search(r'Ran (\d+) tests?', output)
        return {'passed': p.returncode == 0, 'count': int(match.group(1)) if match else None,
                'summary': output[-1200:], 'timestamp': datetime.now(timezone.utc).isoformat()}
    except (OSError, subprocess.TimeoutExpired) as e:
        return {'passed': False, 'count': None, 'summary': str(e), 'timestamp': datetime.now(timezone.utc).isoformat()}


class Mission:
    def __init__(self, qemu_log: str | None = None, run_tests: bool = True):
        self.lock = threading.RLock()
        self.lab = ElectronicsLab()
        self.orbit = Orbit()
        self.trajectory = self.orbit.trajectory()
        self.frames = deque(maxlen=3600)
        self.telemetry_history = deque(maxlen=1800)
        self.received = 0
        self.restarts = 0
        self._stop = threading.Event()
        self._tail_ready = threading.Event()
        self._worker = None
        self._tail = None
        self.tests_running = False
        self.t_sim = 0.0
        self.speed = 30
        self.running = False
        self.last_wall = time.monotonic()
        self.fault = False
        self.events = deque(maxlen=70)
        self.samples = deque(maxlen=240)
        self.last_record_wall = 0.0
        self.qemu_last = None
        self.qemu_packet = None
        self.qemu_errors = 0
        self.qemu_log = str(Path(qemu_log).expanduser().resolve()) if qemu_log else None
        self.tests = run_existing_tests() if run_tests else {'passed': False, 'count': None, 'summary': 'Not run', 'timestamp': ''}
        self.note('Dashboard server started', 'info')
        self.note(f'Python unit tests: {"PASS" if self.tests["passed"] else "FAIL"} ({self.tests["count"] if self.tests["count"] is not None else "unknown"} cases)',
                  'success' if self.tests['passed'] else 'warning')
        if qemu_log:
            self._tail = threading.Thread(target=self._tail_file, daemon=True)
            self._tail.start()
            self.note('QEMU log tail configured; waiting for new TELEM records', 'info')

    def start(self):
        if self._worker is None:
            self._worker = threading.Thread(target=self._loop, daemon=True)
            self._worker.start()

    def close(self):
        self._stop.set()
        for thread in (self._worker, self._tail):
            if thread:
                thread.join(timeout=2)

    def _loop(self):
        while not self._stop.wait(.1):
            with self.lock:
                self._advance()

    def session(self):
        with self.lock:
            return {'schema': 'orbit1-session-v1', 'mode': 'SIMULATION ONLY',
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'trajectory': self.trajectory, 'config': asdict(self.orbit),
                    'frames': list(self.frames), 'events': list(self.events)}

    def _simulation(self):
        return {'running': self.running, 'speed': self.speed, **self.orbit.sample(self.t_sim),
                'fault': self.fault, 'health': 'DEGRADED' if self.fault else 'NOMINAL',
                'payload_kg': 1}

    def _qemu(self):
        age = None if self.qemu_last is None else time.monotonic()-self.qemu_last
        return {'status': 'LIVE' if age is not None and age < 5 else ('STALE' if age is not None else 'NOT CONNECTED'),
                'configured': bool(self.qemu_log), 'source': 'QEMU synthetic firmware; no physical measurements',
                'age_s': round(age, 2) if age is not None else None, 'parser_errors': self.qemu_errors,
                'received': self.received, 'restarts': self.restarts,
                'packet': asdict(self.qemu_packet) if self.qemu_packet else None}

    def note(self, text, level='info'):
        self.events.appendleft({'at': datetime.now(timezone.utc).strftime('%H:%M:%S UTC'),
                                'message': text, 'level': level, 'recorded_s': time.monotonic()})

    def _advance(self):
        now = time.monotonic()
        self.lab.advance(now)
        dt = max(0, now-self.last_wall)
        self.last_wall = now
        if self.running:
            self.t_sim += dt * self.speed
        if now - self.last_record_wall >= 0.6:
            obj = self.orbit.sample(self.t_sim)
            self.samples.append({'t_s': round(self.t_sim, 1), 'altitude_km': obj['altitude_km'],
                                 'speed_kms': obj['speed_kms'], 'latitude_deg': obj['latitude_deg']})
            self.last_record_wall = now
            self.frames.append({'recorded_s': now, 'simulation': self._simulation(), 'qemu': self._qemu()})

    def command(self, body: dict) -> dict:
        if not isinstance(body, dict):
            raise ValueError('Command payload must be a JSON object')
        with self.lock:
            self._advance()
            cmd = body.get('command')
            if cmd == 'start':
                self.running = True
                self.note('Orbital reference simulation started', 'success')
            elif cmd == 'pause':
                self.running = False
                self.note('Orbital reference simulation paused')
            elif cmd == 'reset':
                self.running = False
                self.t_sim = 0
                self.samples.clear()
                self.frames.clear()
                self.fault = False
                self.note('Simulation reset to initial orbital state')
            elif cmd == 'configure':
                config = body.get('value')
                if not isinstance(config, dict) or set(config) - set(asdict(self.orbit)):
                    raise ValueError('Expected orbit parameter object')
                orbit = Orbit(**{**asdict(self.orbit), **config})
                self.orbit = orbit
                self.trajectory = orbit.trajectory()
                self.t_sim = 0
                self.running = False
                self.samples.clear()
                self.frames.clear()
                self.note('Analytical orbit reconfigured; recording reset')
            elif cmd == 'speed':
                speed = body.get('value')
                if type(speed) not in (int, float) or speed not in (1, 10, 30, 60, 300):
                    raise ValueError('Speed must be 1, 10, 30, 60 or 300')
                self.speed = int(speed)
                self.note(f'Simulation time warp set to {self.speed}×')
            elif cmd == 'inject_fault':
                self.fault = True
                self.note('Synthetic sensor timeout injected (dashboard model only)', 'warning')
            elif cmd == 'clear_fault':
                self.fault = False
                self.note('Synthetic fault cleared', 'success')
            elif cmd == 'test':
                if not self.tests_running:
                    self.tests_running = True
                    threading.Thread(target=self._run_tests, daemon=True).start()
            else:
                raise ValueError('Unknown command')
        return {'ok': True}

    def _run_tests(self):
        result = run_existing_tests()
        with self.lock:
            self.tests = result
            self.tests_running = False
            self.note(f'Tests: {"PASS" if result["passed"] else "FAIL"}',
                      'success' if result['passed'] else 'warning')

    def ingest(self, line):
        try:
            packet = parse_line(line)
        except ValueError:
            with self.lock:
                self.qemu_errors += 1
            return
        if packet is None:
            return
        with self.lock:
            previous = self.qemu_packet
            now = time.monotonic()
            if self.qemu_last is None or now-self.qemu_last >= 5:
                self.note('QEMU synthetic telemetry detected', 'success')
            if previous and packet.uptime_ms < previous.uptime_ms:
                self.restarts += 1
                self.note('QEMU firmware restart detected', 'warning')
            if previous is None or previous.health != packet.health:
                self.note('Firmware sensor health: '+packet.health,
                          'warning' if packet.fault_flags else 'success')
            self.qemu_packet, self.qemu_last = packet, now
            self.received += 1
            self.telemetry_history.append({'received_s': now, **asdict(packet)})

    def _tail_file(self):
        """Follow only newly appended log lines; a stale existing file is not live data."""
        path = Path(self.qemu_log)
        skip_existing = path.exists()
        while not self._stop.is_set():
            try:
                with path.open('r', encoding='utf-8', errors='replace') as f:
                    if skip_existing:
                        f.seek(0, 2)
                        skip_existing = False
                    identity = os.fstat(f.fileno()).st_ino
                    self._tail_ready.set()
                    pending = ''
                    while not self._stop.is_set():
                        line = f.readline()
                        if not line:
                            if not path.exists() or path.stat().st_size < f.tell() or path.stat().st_ino != identity:
                                break  # re-open rotated/truncated log
                            self._stop.wait(0.1)
                            continue
                        pending += line
                        if len(pending) > 8192:
                            pending = ''
                            with self.lock:
                                self.qemu_errors += 1
                            continue
                        if not pending.endswith('\n'):
                            continue  # a producer may flush part of a CSV record
                        line, pending = pending, ''
                        self.ingest(line)
            except OSError:
                self._stop.wait(0.25)

    def progress(self):
        # Explicit and conservative: code present != build validated or HIL verified.
        files = {
            'docs': ROOT/'docs'/'REQUIREMENTS.md',
            'orbital': ROOT/'orbit1'/'orbit.py',
            'zephyr': ROOT/'zephyr'/'src'/'main.c',
            'sensors': ROOT/'orbit1'/'mock_stream.py',
            'telemetry': ROOT/'orbit1'/'telemetry.py',
            'viewer': ASSETS/'index.html',
        }
        p = lambda f: files[f].is_file()
        build_dir = ROOT/'zephyr'/'build-mission'
        image_present = any((build_dir/n).exists() for n in ('zephyr/zephyr.elf', 'zephyr/zephyr.exe'))
        checks = [
            ('req', 'Requirements specification', 'source' if p('docs') else 'pending'),
            ('orb', 'Orbital reference model', 'tested' if p('orbital') and self.tests['passed'] else ('source' if p('orbital') else 'pending')),
            ('fc', 'Zephyr flight computer', 'source' if p('zephyr') else 'pending'),
            ('sensors', 'Synthetic sensor stream', 'tested' if p('sensors') and self.tests['passed'] else ('source' if p('sensors') else 'pending')),
            ('telemetry', 'Telemetry parser', 'tested' if p('telemetry') and self.tests['passed'] else ('source' if p('telemetry') else 'pending')),
            ('viewer', 'Web mission control', 'source' if p('viewer') else 'pending'),
            ('qemu', 'QEMU firmware build', 'artifact' if image_present else 'pending'),
            ('replay', 'Session recorder / replay', 'source'),
        ]
        weights = {'tested': 1, 'source': 0.5, 'artifact': 0.75, 'pending': 0}
        percent = round(100 * sum(weights[s] for _,_,s in checks)/len(checks))
        return {'percent':percent, 'milestones': [{'id':i,'label':label,'status':status} for i,label,status in checks],
                'description':'Repository maturity estimate; not flight readiness or launch progress.'}

    def snapshot(self):
        with self.lock:
            self._advance()
            sample = self.orbit.sample(self.t_sim)
            return {
                'service':'ORBIT-1 Mission Control / 1.0', 'mode':'LAB SIMULATION ONLY',
                'config': asdict(self.orbit), 'trajectory': self.trajectory,
                'recording': {'frames': len(self.frames), 'capacity': self.frames.maxlen},
                'simulation': {'running':self.running,'speed':self.speed, **sample,
                               'payload_kg':1, 'fault':self.fault,
                               'health':'DEGRADED' if self.fault else 'NOMINAL',
                               'track':self.orbit.track(self.t_sim)},
                'telemetry_history': list(self.telemetry_history)[-360:],
                'tests': {**{k:v for k,v in self.tests.items() if k!='summary'}, 'running': self.tests_running},
                'progress':self.progress(),
                'events':list(self.events)[:12],
                'history':list(self.samples)[-180:],
                'qemu': self._qemu(),
                'verification': self.verification(),
            }

    def verification(self):
        return read_evidence()


def make_handler(mission):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'ORBIT-1-Dashboard/1.0'

        def _respond(self, code, content, content_type='application/json; charset=utf-8'):
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            try:
                self.wfile.write(content)
            except (BrokenPipeError, ConnectionResetError):
                pass  # a polling browser may disconnect before receiving a response

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/api/lab/firmware-bench':
                report = ROOT / '.runtime' / 'firmware-bench.json'
                try:
                    return self._respond(200, report.read_bytes())
                except FileNotFoundError:
                    return self._respond(404, b'{"error":"No firmware bench report has been recorded"}')
            if path in ('/api/lab', '/api/lab/recording'):
                with mission.lock:
                    mission._advance()
                    result = mission.lab.snapshot(recording=path.endswith('/recording'))
                    if path == '/api/lab':
                        result['firmware'] = mission._qemu()
                return self._respond(200, json.dumps(result, allow_nan=False).encode())
            if path == '/api/status':
                return self._respond(200,json.dumps(mission.snapshot()).encode())
            if path == '/api/test-output':
                return self._respond(200,json.dumps(mission.tests).encode())
            if path == '/api/session':
                return self._respond(200,json.dumps(mission.session(), allow_nan=False).encode())
            assets = {'/': ('index.html', 'text/html; charset=utf-8')}
            if path in assets:
                filename, typ = assets[path]
                try:
                    return self._respond(200, (ASSETS/filename).read_bytes(), typ)
                except FileNotFoundError:
                    return self._respond(404,b'File unavailable','text/plain')
            # Resolve every asset inside the fixed web root; never serve project files.
            candidate = (ASSETS / path.lstrip('/')).resolve()
            if candidate.is_relative_to(ASSETS.resolve()) and candidate.is_file():
                typ = mimetypes.guess_type(str(candidate))[0] or 'application/octet-stream'
                if candidate.suffix == '.js':
                    typ = 'application/javascript'
                return self._respond(200, candidate.read_bytes(), typ)
            return self._respond(404,b'Not found','text/plain')

        def do_POST(self):
            path = urlparse(self.path).path
            if path not in ('/api/command', '/api/lab', '/api/lab/scenario'):
                return self._respond(404,b'{"error":"Unknown endpoint"}')
            origin = self.headers.get('Origin')
            # Localhost only; additionally reject browser writes from other origins.
            if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
                return self._respond(403,b'{"error":"Origin forbidden"}')
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 8192:
                    raise ValueError('Payload too large or empty')
                data=json.loads(self.rfile.read(length))
                if path == '/api/lab/scenario':
                    result = run_scenario(data)
                elif path == '/api/lab':
                    if not isinstance(data, dict):
                        raise ValueError('Expected a JSON object')
                    with mission.lock:
                        mission._advance()
                        mission.lab.command(data.get('command'), data.get('value'))
                    result = {'ok': True}
                else:
                    result = mission.command(data)
                return self._respond(200,json.dumps(result).encode())
            except (ValueError, TypeError, json.JSONDecodeError) as e:
                return self._respond(400,json.dumps({'error':str(e)}).encode())

        def log_message(self, fmt, *args):
            if self.path.startswith('/api/'):
                return  # avoid per-second polling spam
            super().log_message(fmt,*args)
    return Handler


def main():
    parser=argparse.ArgumentParser(description='Local ORBIT-1 simulated mission-control dashboard')
    parser.add_argument('--port',type=int,default=8765,help='Local browser port (default 8765)')
    parser.add_argument('--qemu-log',help='Optional append-only QEMU stdout log to monitor (read-only)')
    args=parser.parse_args()
    mission=Mission(args.qemu_log)
    mission.start()
    server=ThreadingHTTPServer(('127.0.0.1',args.port), make_handler(mission))
    print(f'ORBIT-1 mission control: http://localhost:{args.port}', flush=True)
    print('SIMULATION ONLY. No hardware control. Press Ctrl+C to stop.',flush=True)
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        mission.close()

if __name__ == '__main__':
    main()
