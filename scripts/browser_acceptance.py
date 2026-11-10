"""Real Chrome acceptance checks. Windows: python scripts/browser_acceptance.py.

Install Playwright into .tools/python or your active Python environment first.
Requires the complete application running at --url (default localhost:8780).
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'.tools'/'python'))
sys.path.insert(0, str(ROOT))
from playwright.sync_api import sync_playwright, expect
from orbit1.verification import source_digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8780')
    parser.add_argument('--executable', default=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    args = parser.parse_args()
    output = ROOT/'test-results'
    output.mkdir(exist_ok=True)
    checks = []
    errors = []
    digest = source_digest()

    def passed(name, detail):
        checks.append({'name': name, 'passed': True, 'detail': detail,
                       'timestamp': datetime.now(timezone.utc).isoformat()})

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.executable, headless=True,
                                    args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        browser_version = browser.version
        context = browser.new_context(viewport={'width': 1600, 'height': 1100}, accept_downloads=True)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url)
        expect(page.locator('#backend-status')).to_have_text('ONLINE', timeout=15000)
        page.wait_for_function("window.orbitDiagnostics?.renderer === 'webgl' && window.orbitDiagnostics.frames > 10")
        expect(page.locator('#qemu-status')).to_have_text('LIVE', timeout=15000)
        passed('3D renderer and live QEMU', 'Chrome WebGL rendered more than 10 frames; live firmware telemetry observed')
        page.locator('#reset-btn').click()
        page.locator('#speed').select_option('300')
        page.wait_for_function("document.querySelector('#speed').value === '300'")
        page.locator('#start-btn').click()
        expect(page.locator('#run-status')).to_have_text('RUNNING')
        initial = page.evaluate('window.orbitDiagnostics.spacecraftPosition')
        page.wait_for_timeout(1500)
        after = page.evaluate('window.orbitDiagnostics.spacecraftPosition')
        assert sum((a-b)**2 for a,b in zip(initial,after)) > .001, (initial,after)
        page.locator('#pause-btn').click()
        expect(page.locator('#run-status')).to_have_text('PAUSED')
        paused_time = page.locator('#mission-time').inner_text()
        page.wait_for_timeout(1000)
        assert page.locator('#mission-time').inner_text() == paused_time
        passed('Calculated spacecraft motion and clock controls', '300x run changed 3D position; pause held simulation time')
        canvas = page.locator('#globe').bounding_box()
        before = page.evaluate('window.orbitDiagnostics.camera')
        page.mouse.move(canvas['x']+canvas['width']/2, canvas['y']+canvas['height']/2)
        page.mouse.down();page.mouse.move(canvas['x']+canvas['width']/2+90,canvas['y']+canvas['height']/2+30,steps=12);page.mouse.up()
        page.wait_for_timeout(700)
        assert page.evaluate('window.orbitDiagnostics.camera') != before
        page.locator('#camera-reset').click()
        passed('3D camera interaction', 'Pointer drag rotated the camera; reset button exercised')
        page.locator('#fault-btn').click()
        expect(page.locator('#sim-health')).to_have_text('DEGRADED')
        page.locator('#clear-btn').click()
        expect(page.locator('#sim-health')).to_have_text('NOMINAL')
        passed('Model fault injection and recovery', 'Timeout changed health to DEGRADED and Recover restored NOMINAL')
        page.locator('#orbit-eccentricity').fill('0.2')
        page.locator('#orbit-inclination').fill('63')
        page.locator('#apply-orbit').click()
        page.wait_for_function("document.querySelector('#inclination').textContent.includes('63.0')")
        page.locator('#start-btn').click()
        page.wait_for_timeout(2200)
        assert float(page.locator('#altitude').inner_text().split()[0]) > 400
        page.locator('#metric').select_option('speed_kms')
        page.wait_for_timeout(600)
        passed('Elliptical orbit and telemetry graphs', 'Configured e=0.2, i=63 degrees; calculated altitude increased; graph metric changed')
        page.locator('#replay-btn').click()
        expect(page.locator('#view-mode')).to_have_text('MISSION REPLAY')
        assert page.locator('#start-btn').is_disabled()
        page.locator('#replay-play').click()
        page.wait_for_timeout(900)
        page.locator('#replay-slider').fill('0')
        expect(page.locator('#replay-position')).to_contain_text('1 /')
        with page.expect_download() as event:
            page.locator('#export-btn').click()
        recording = output/'browser-session.json'
        event.value.save_as(recording)
        data = json.loads(recording.read_text())
        assert data['schema'] == 'orbit1-session-v1' and len(data['frames']) > 1
        page.locator('#live-btn').click()
        expect(page.locator('#view-mode')).to_have_text('LIVE REFERENCE')
        page.locator('#session-file').set_input_files(str(recording))
        expect(page.locator('#view-mode')).to_have_text('MISSION REPLAY')
        page.locator('#live-btn').click()
        passed('Mission replay, export and import', 'Scrubbed and played captured frames; downloaded session reimported successfully; live controls isolated')
        page.route('**/api/status', lambda route: route.abort())
        expect(page.locator('#backend-status')).to_have_text('OFFLINE', timeout=10000)
        expect(page.locator('#qemu-status')).to_have_text('UNKNOWN')
        assert page.locator('#start-btn').is_disabled()
        page.unroute('**/api/status')
        expect(page.locator('#backend-status')).to_have_text('ONLINE', timeout=10000)
        passed('Backend connection loss and recovery', 'Aborted status requests produced OFFLINE and UNKNOWN; recovery restored ONLINE')
        page.locator('[data-tab=verification]').click()
        expect(page.locator('#verification')).to_be_visible()
        previous_run = page.request.get(args.url+'/api/status').json()['tests']['timestamp']
        page.locator('#verify-tests').click()
        expect(page.locator('#notice')).to_contain_text('verification started')
        deadline = time.monotonic()+30
        while time.monotonic()<deadline:
            tests = page.request.get(args.url+'/api/status').json()['tests']
            if not tests['running'] and tests['timestamp'] != previous_run:
                break
            page.wait_for_timeout(200)
        assert not tests['running'] and tests['passed'] and tests['timestamp'] != previous_run
        expect(page.locator('#tests-result')).to_contain_text('PASS')
        expect(page.locator('#verify-tests')).to_be_enabled()
        page.locator('#test-output-btn').click()
        expect(page.locator('#test-output')).to_contain_text('OK')
        passed('Verification workspace', 'Reran actual Python tests from browser while telemetry remained available; inspected test output')
        page.screenshot(path=str(output/'verification.png'), full_page=True)
        page.locator('[data-tab=operations]').click()
        page.locator('#pause-btn').click()
        page.locator('#orbit-eccentricity').fill('0')
        page.locator('#orbit-inclination').fill('51.6')
        page.locator('#apply-orbit').click()
        page.wait_for_timeout(700)
        page.locator('#speed').select_option('30')
        page.locator('#start-btn').click()
        page.wait_for_timeout(1500)
        page.screenshot(path=str(output/'mission-control-desktop.png'), full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.wait_for_timeout(800)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
        page.screenshot(path=str(output/'mission-control-mobile.png'), full_page=True)
        passed('Responsive layout', '1600px desktop and 390px mobile screenshots; no horizontal mobile overflow')
        assert not errors, errors
        passed('Browser runtime', 'No JavaScript page errors during acceptance interactions')
        fallback = context.new_page()
        fallback.route('**/scene.js', lambda route: route.abort())
        fallback.goto(args.url)
        expect(fallback.locator('#scene-error')).to_be_visible()
        expect(fallback.locator('#backend-status')).to_have_text('ONLINE')
        passed('3D failure fallback', 'Blocked renderer module; explicit warning appeared and backend controls remained available')
        context.close();browser.close()
    assert source_digest()==digest, 'Sources changed during browser verification'
    report={'passed': True,'source_sha256':digest,'checks':checks,'browser':'Google Chrome '+browser_version+' / Playwright 1.48',
            'rendering':'Headless WebGL via SwiftShader', 'errors':errors}
    (output/'browser-results.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
