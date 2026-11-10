"""Run actual offline, build, QEMU and managed-launcher acceptance checks in WSL."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from orbit1.verification import source_digest


def main():
    runtime = ROOT/'.runtime'
    runtime.mkdir(exist_ok=True)
    checks = []
    digest = source_digest()

    def check(name, detail):
        entry = {'name': name, 'passed': True, 'detail': detail,
                 'timestamp': datetime.now(timezone.utc).isoformat()}
        checks.append(entry)
        print(json.dumps(entry), flush=True)

    def run(command, filename, timeout=240):
        with (runtime/filename).open('w') as output:
            result = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT,
                                    timeout=timeout)
        text = (runtime/filename).read_text()
        if result.returncode:
            raise AssertionError(f'{filename}: command failed ({result.returncode})\n{text[-3000:]}')
        return text

    try:
        output = run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 'python-tests.log')
        count = re.search(r'Ran (\d+) tests?', output).group(1)
        check('Python unit and HTTP integration', f'{count} tests passed in Ubuntu-24.04 / Python {sys.version.split()[0]}')
        qemu_binary = str(Path(os.environ.get('QEMU_BIN_PATH', '/usr/bin'))/'qemu-system-i386')
        run(['west', 'build', '-b', 'qemu_x86/atom', '-d', 'zephyr/build-validation', 'zephyr', '--',
             f'-DQEMU={qemu_binary}'], 'verify-build.log')
        version = subprocess.check_output([qemu_binary, '--version'], text=True).splitlines()[0]
        check('Zephyr firmware build', f'qemu_x86/atom compiled and linked; {version}; see .runtime/verify-build.log')
        run([sys.executable, 'scripts/validate_qemu.py', '--output', str(runtime/'qemu-results.json')], 'qemu-validation.log', 55)
        qemu = json.loads((runtime/'qemu-results.json').read_text())
        check('QEMU telemetry and automatic recovery', f"{qemu['packets']} packets; cadence {qemu['uptime_gaps_ms']} ms; zero parser errors; LIVE → DEGRADED → OK → STALE")

        # A separate port and build preserve the primary application instance.
        host = 'http://127.0.0.1:8781'
        child = None
        with (runtime/'launcher-lifecycle.log').open('w') as log:
            try:
                child = subprocess.Popen([sys.executable, '-m', 'orbit1.launcher', '--port', '8781',
                                          '--build-dir', 'zephyr/build-validation', '--skip-build'],
                                         cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                deadline = time.monotonic()+20
                status = None
                while time.monotonic()<deadline:
                    try:
                        with urlopen(host+'/api/status', timeout=2) as response:
                            status = json.load(response)
                        if status['qemu']['status']=='LIVE':
                            break
                    except OSError:
                        pass
                    if child.poll() is not None:
                        raise AssertionError('Lifecycle launcher exited before becoming ready')
                    time.sleep(.2)
                assert status and status['qemu']['status']=='LIVE', 'Managed QEMU did not connect'
                duplicate = subprocess.run([sys.executable, '-m', 'orbit1.launcher', '--port', '8781', '--no-qemu'],
                                           cwd=ROOT, capture_output=True, text=True, timeout=5)
                assert duplicate.returncode != 0 and 'already running' in duplicate.stderr
                processes = subprocess.check_output(['ps', '-eo', 'pid=,pgid=,args='], text=True)
                managed = []
                for line in processes.splitlines():
                    parts = line.split(None, 2)
                    if len(parts)==3 and 'qemu-system' in parts[2] and '/zephyr/build-validation/' in parts[2] and '-kernel' in parts[2]:
                        managed.append(int(parts[0]))
                assert managed, 'Managed QEMU process was not found'
                child.send_signal(signal.SIGTERM)
                assert child.wait(timeout=10)==0
                for pid in managed:
                    assert not Path(f'/proc/{pid}').exists(), f'Owned QEMU PID {pid} survived shutdown'
                try:
                    urlopen(host+'/api/status', timeout=1)
                except OSError:
                    pass
                else:
                    raise AssertionError('Lifecycle HTTP server survived shutdown')
                sessions = list(runtime.glob('session-*.json'))
                assert sessions and any(json.loads(p.read_text()).get('schema')=='orbit1-session-v1' for p in sessions)
                check('Managed application lifecycle', 'Real launcher connected its own QEMU; duplicate rejected; SIGTERM stopped HTTP and owned QEMU; recording saved')
            finally:
                if child is not None and child.poll() is None:
                    child.send_signal(signal.SIGTERM)
                    child.wait(timeout=10)
        assert source_digest()==digest, 'Source changed during verification; rerun acceptance tests'
    except Exception as error:
        checks.append({'name':'Acceptance failure','passed':False,'detail':str(error),
                       'timestamp':datetime.now(timezone.utc).isoformat()})
        raise
    finally:
        report={'source_sha256':digest,'checks':checks,'timestamp':datetime.now(timezone.utc).isoformat()}
        (runtime/'backend-results.json').write_text(json.dumps(report,indent=2))
        (runtime/'verification.json').write_text(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
