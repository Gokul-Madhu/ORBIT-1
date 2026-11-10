"""Combine completed backend/browser checks with the current source digest."""
import json
from pathlib import Path
import sys
import hashlib

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from orbit1.verification import source_digest

backend=json.loads((root/'.runtime'/'backend-results.json').read_text())
assert backend['source_sha256']==source_digest(), 'Sources changed since backend verification'
browser=json.loads((root/'test-results'/'browser-results.json').read_text())
assert browser['passed'] and not browser['errors']
assert browser['source_sha256']==source_digest(), 'Sources changed since browser verification'
model=json.loads((root/'.runtime'/'model-results.json').read_text())
assert model['passed'] and model['module_sha256']==hashlib.sha256((root/'orbit1'/'web'/'model.js').read_bytes()).hexdigest()
backend['checks'].extend(browser['checks'])
backend['checks'].append({'name':'Browser model checks','passed':True,
                          'detail':'Node model tests passed (run by verify.ps1 before combining evidence)',
                          'timestamp':model['timestamp']})
(root/'.runtime'/'verification.json').write_text(json.dumps(backend,indent=2))
print('Combined',len(backend['checks']),'actual verification checks.')
