"""Own the local server and a single isolated QEMU simulation process."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
from http.server import ThreadingHTTPServer
from .dashboard import ROOT, Mission, make_handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8780)
    parser.add_argument('--no-qemu', action='store_true', help='Host simulation only; QEMU stays disconnected')
    parser.add_argument('--open-browser', action='store_true', help='Open the workbench in Windows after startup')
    parser.add_argument('--skip-build', action='store_true', help='Use existing mission build')
    parser.add_argument('--build-dir', help='Project-local Zephyr build directory (defaults to one per port)')
    args = parser.parse_args()
    default_build = 'zephyr/build-mission' if args.port == 8780 else f'zephyr/build-mission-{args.port}'
    build_dir = (ROOT/(args.build_dir or default_build)).resolve()
    if not build_dir.is_relative_to((ROOT/'zephyr').resolve()) or not build_dir.name.startswith('build'):
        parser.error('Build directory must be zephyr/build* inside this project')
    runtime = ROOT / '.runtime'
    runtime.mkdir(exist_ok=True)
    lock = (runtime/f'app-{args.port}.lock').open('a+')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.exit(1, f'ORBIT-1 is already running. Open http://localhost:{args.port}.\n')
    lock.seek(0)
    lock.truncate()
    lock.write(str(os.getpid()))
    lock.flush()
    build_lock = None
    if not args.no_qemu:
        build_key = hashlib.sha256(os.fsencode(build_dir)).hexdigest()
        build_lock = (runtime/f'build-{build_key}.lock').open('a')
        try:
            fcntl.flock(build_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.exit(1, f'Another ORBIT-1 instance is using {build_dir}. Choose a separate --build-dir.\n')
    mission = Mission(run_tests=True)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(mission))
    server.timeout = .25
    stop = threading.Event()
    process = None
    reader = None
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')

    def shutdown(*_):
        stop.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    try:
        if not args.no_qemu:
            if not os.environ.get('ZEPHYR_BASE'):
                raise RuntimeError('ZEPHYR_BASE is unset; use scripts/launch.sh')
            if not args.skip_build:
                print('Building isolated Zephyr/QEMU mission firmware…', flush=True)
                qemu_binary = Path(os.environ.get('QEMU_BIN_PATH', '/usr/bin'))/'qemu-system-i386'
                if not qemu_binary.is_file():
                    raise RuntimeError(f'QEMU executable not found: {qemu_binary}')
                build_log = runtime/('build.log' if args.port == 8780 else f'build-{args.port}.log')
                with build_log.open('w') as output:
                    build = subprocess.run(['west', 'build', '-b', 'qemu_x86/atom', '-d', str(build_dir),
                                            str(ROOT/'zephyr'), '--', f'-DQEMU={qemu_binary}'], cwd=ROOT, stdout=output,
                                           stderr=subprocess.STDOUT, timeout=240)
                if build.returncode:
                    raise RuntimeError(f'Firmware build failed; see {build_log}')
            if not (build_dir/'zephyr'/'zephyr.elf').is_file():
                raise RuntimeError('Firmware artifact missing; run without --skip-build')
            process = subprocess.Popen(['west', 'build', '-d', str(build_dir), '-t', 'run'],
                                       cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                       text=True, bufsize=1, start_new_session=True)
            mission.qemu_log = str(runtime/f'qemu-{stamp}.log')

            def receive():
                with Path(mission.qemu_log).open('w', buffering=1) as log:
                    for line in process.stdout:
                        log.write(line)
                        mission.ingest(line)
                with mission.lock:
                    mission.note('Managed QEMU process exited', 'warning')

            reader = threading.Thread(target=receive, daemon=True)
            reader.start()
        mission.start()
        print(f'ORBIT-1 ready: http://localhost:{args.port}', flush=True)
        if args.open_browser:
            explorer = Path('/mnt/c/Windows/explorer.exe')
            if explorer.is_file():
                subprocess.Popen([str(explorer), f'http://localhost:{args.port}/lab.html'],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('SIMULATION ONLY · Ctrl+C stops this server and its managed QEMU.', flush=True)
        while not stop.is_set():
            server.handle_request()
    finally:
        server.server_close()
        if process is not None:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=8)
            if reader:
                reader.join(timeout=2)
            process.stdout.close()
        mission.close()
        (runtime/f'session-{stamp}.json').write_text(json.dumps(mission.session()), encoding='utf-8')
        if build_lock is not None:
            build_lock.close()
        lock.close()
        print('ORBIT-1 stopped; recording saved.', flush=True)


if __name__ == '__main__':
    main()
