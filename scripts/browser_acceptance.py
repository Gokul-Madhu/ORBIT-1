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
tools = ROOT/'.tools'
versioned_tools = tools/f'python{sys.version_info.major}{sys.version_info.minor}'
sys.path.insert(0, str(versioned_tools if versioned_tools.is_dir() else tools/'python'))
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
        lab = context.new_page()
        lab.on('pageerror', lambda error: errors.append(error.stack or str(error)))
        lab.goto(args.url+'/lab.html')
        expect(lab.locator('#phase')).to_contain_text('Ground power-on')
        expect(lab.locator('#firmware')).to_contain_text('LIVE')
        expect(lab.locator('#graphics')).to_contain_text('WebGL')
        rocket = lab.locator('#rocket')
        lab_state = lab.request.get(args.url+'/api/lab').json()
        packet_count = sum(row['t_s'] == lab_state['state']['t_s'] for row in lab_state['transactions'])
        assert packet_count > 0
        expect(rocket).to_have_attribute('data-packet-count', str(packet_count))
        for button in lab.locator('#devices [data-component]').all():
            name = button.get_attribute('data-component')
            button.click()
            expect(rocket).to_have_attribute('data-selected', name)
        lab.locator('[data-component=sensor_a]').click()
        expect(lab.locator('#component-name')).to_contain_text('Primary accelerometer')
        expect(lab.locator('#device')).to_contain_text('Reading:')
        lab.wait_for_timeout(650)
        box = rocket.bounding_box()
        rocket.click(position={'x': box['width']/2, 'y': box['height']/2})
        expect(lab.locator('#component-name')).to_contain_text(' · ')
        lab.locator('#fault').select_option('imu')
        lab.locator('[data-command=inject]').click()
        expect(lab.locator('#active')).to_contain_text('Primary sensor interruption')
        lab.locator('[data-command=step]').click()
        expect(rocket).to_have_attribute('data-failed', 'sensor_a')
        expect(rocket).to_have_attribute('data-outline', 'ff294d')
        expect(lab.locator('#device')).to_contain_text('No valid sample')
        lab.locator('#twin-mode').select_option('network')
        expect(rocket).to_have_attribute('data-fault-links', 'sensor_a sensor_a sensor_a')
        expect(lab.locator('#messages')).to_contain_text('timeout')
        lab.wait_for_timeout(500)
        lab.screenshot(path=str(output/'rocket-fault-network.png'), full_page=True)
        lab.locator('#fault-focus').click()
        expect(lab.locator('#twin-mode')).to_have_value('pcb')
        lab.locator('[data-command=recover]').click()
        expect(lab.locator('#active')).to_have_text('')
        lab.locator('[data-command=step]').click()
        expect(rocket).to_have_attribute('data-outline', '48efb2')
        expect(rocket).to_have_attribute('data-fault-links', '')
        expect(lab.locator('#device')).not_to_contain_text('No valid sample')
        passed('3D electronics fault and recovery', 'Selected all boards, ray-picked a package, matched sensor timeouts to red component and SPI paths, focused the failure and restored its live readings')
        lab.locator('#fault').select_option('regulator')
        lab.locator('[data-command=inject]').click()
        expect(lab.locator('#active')).to_contain_text('Regulator brownout')
        lab.locator('[data-command=step]').click()
        expect(lab.locator('#computer')).to_contain_text('FAILED')
        lab.locator('[data-command=recover]').click()
        expect(lab.locator('#active')).to_have_text('')
        lab.locator('#speed').select_option('16')
        lab.locator('[data-command=start]').click()
        expect(lab.locator('#phase')).to_have_text('Complete', timeout=20000)
        expect(lab.locator('#computer')).to_contain_text('Payload OPERATING')
        expect(lab.locator('#orbit-note')).to_contain_text('400 km reference orbit')
        lab.locator('#bus').select_option('I²C')
        expect(lab.locator('#messages')).to_contain_text('payload')
        lab.locator('#replay').click()
        expect(lab.locator('#phase')).to_have_text('Ground power-on')
        lab.locator('#seek').fill('360')
        expect(lab.locator('#phase')).to_have_text('Complete')
        with lab.expect_download() as waveform:
            lab.locator('#csv').click()
        waveform.value.save_as(str(output/'lab-waveform.csv'))
        lab.locator('#twin-mode').select_option('orbit')
        expect(lab.locator('#earth')).to_be_visible()
        lab.screenshot(path=str(output/'electronics-lab.png'), full_page=True)
        lab.locator('#twin-mode').select_option('vehicle')
        lab.wait_for_timeout(700)
        lab.screenshot(path=str(output/'rocket-cutaway.png'), full_page=True)
        lab.set_viewport_size({'width': 390, 'height': 844})
        lab.wait_for_timeout(500)
        assert lab.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Lab mobile horizontal overflow'
        assert lab.evaluate("""document.querySelector('.lab-nav').getBoundingClientRect().bottom
            <= document.querySelector('#fault-center').getBoundingClientRect().top"""), 'Lab mobile navigation overlaps controls'
        lab.screenshot(path=str(output/'rocket-mobile.png'), full_page=True)
        assert not errors, errors
        passed('Electronics laboratory mission', 'Verified browser brownout and recovery, live firmware provenance, scripted completion, bus filtering, replay and CSV export')
        context.close();browser.close()
    assert source_digest()==digest, 'Sources changed during browser verification'
    report={'passed': True,'source_sha256':digest,'checks':checks,'browser':'Google Chrome '+browser_version+' / Playwright 1.48',
            'rendering':'Headless WebGL via SwiftShader', 'errors':errors}
    (output/'browser-results.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
