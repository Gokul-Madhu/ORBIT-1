"""Evidence is tied to source contents, so edits cannot silently inherit a PASS."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source_digest():
    paths = set()
    for pattern in ('orbit1/*.py', 'orbit1/web/*.js', 'orbit1/web/*.html', 'orbit1/web/*.css',
                    'tests/*.py', 'tests/*.mjs', 'scripts/*.py', 'scripts/*.sh', '*.ps1',
                    'zephyr/src/*.c', 'zephyr/prj.conf', 'zephyr/CMakeLists.txt',
                    'zephyr/bench/*.c', 'zephyr/bench/prj.conf', 'zephyr/bench/CMakeLists.txt'):
        paths.update(ROOT.glob(pattern))
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda path: path.relative_to(ROOT).as_posix()):
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def read_evidence():
    try:
        result = json.loads((ROOT/'.runtime'/'verification.json').read_text())
        result['stale'] = result.get('source_sha256') != source_digest()
        return result
    except (OSError, ValueError):
        return {'checks': [], 'stale': False, 'note': 'No persisted acceptance results yet'}
