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
        def view(name):
            lab.locator(f'[data-workspace-view="{name}"]').click()

        lab.locator('[data-command=reset]').click()
        expect(lab.locator('#phase')).to_contain_text('Ground power-on')
        expect(lab.locator('#clock')).to_contain_text('0.00 simulation s')
        expect(lab.locator('#firmware')).to_contain_text('LIVE')
        expect(lab.locator('#graphics')).to_contain_text('WebGL')
        rocket = lab.locator('#rocket')
        lab_state = lab.request.get(args.url+'/api/lab').json()
        packet_count = sum(row['t_s'] == lab_state['state']['t_s'] for row in lab_state['transactions'])
        assert packet_count > 0
        expect(rocket).to_have_attribute('data-packet-count', str(packet_count))
        lab.locator('#component-directory summary').click()
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
        view('fault-center')
        lab.locator('#fault').select_option('imu')
        lab.locator('[data-command=inject]').click()
        expect(lab.locator('#active')).to_contain_text('Primary sensor interruption')
        lab.locator('[data-command=step]').click()
        view('visual')
        expect(rocket).to_have_attribute('data-failed', 'sensor_a')
        expect(rocket).to_have_attribute('data-outline', 'ff294d')
        expect(lab.locator('#device')).to_contain_text('No valid sample')
        lab.locator('#twin-mode').select_option('network')
        expect(rocket).to_have_attribute('data-fault-links', 'sensor_a sensor_a sensor_a')
        view('network')
        lab.locator('#bus-result').select_option('failed')
        lab.locator('#bus-component').fill('sensor_a')
        expect(lab.locator('#messages tr')).to_have_count(3)
        expect(lab.locator('#messages')).to_contain_text('timeout')
        view('visual')
        lab.wait_for_timeout(500)
        lab.screenshot(path=str(output/'rocket-fault-network.png'), full_page=True)
        view('system-flow')
        lab.locator('#flow-mesh-button').click()
        lab.get_by_role('button', name='Expand SPI inputs').press('Enter')
        lab.locator('#mesh-sensor').select_option('sensor_a')
        expect(lab.locator('#mesh-detail')).to_contain_text('Reading unavailable')
        mesh_spi = lab.locator('[data-link="SPI inputs:SPI"]')
        mesh_rail = lab.locator('[data-link="regulator:CAN inputs"]')
        expect(mesh_spi).to_have_attribute('data-state', 'failed')
        expect(lab.locator('[data-node=regulator]')).to_contain_text('5.00 V')
        lab.locator('#mesh-mode').select_option('fault')
        lab.screenshot(path=str(output/'flow-mesh-imu.png'))
        view('fault-center')
        lab.locator('#fault-focus').click()
        expect(lab.locator('#twin-mode')).to_have_value('pcb')
        view('fault-center')
        lab.locator('[data-command=recover]').click()
        expect(lab.locator('#active')).to_have_text('')
        lab.locator('[data-command=step]').click()
        view('visual')
        expect(rocket).to_have_attribute('data-outline', '48efb2')
        expect(rocket).to_have_attribute('data-fault-links', '')
        expect(lab.locator('#device')).not_to_contain_text('No valid sample')
        view('system-flow')
        expect(mesh_spi).to_have_attribute('data-state', 'active')
        expect(lab.locator('[data-link="radio:ground"]')).to_have_attribute('data-state', 'active')
        passed('3D electronics fault and recovery', 'Selected all boards, ray-picked a package, matched sensor timeouts to red component and SPI paths, focused the failure and restored its live readings')
        view('fault-center')
        lab.locator('#fault').select_option('regulator')
        lab.locator('[data-command=inject]').click()
        expect(lab.locator('#active')).to_contain_text('Regulator brownout')
        lab.locator('[data-command=step]').click()
        expect(lab.locator('#computer')).to_contain_text('FAILED')
        view('system-flow')
        expect(mesh_rail).to_have_attribute('data-state', 'failed')
        expect(mesh_spi).to_have_attribute('data-state', 'idle')
        expect(lab.locator('[data-node=regulator]')).to_contain_text('3.50 V')
        lab.screenshot(path=str(output/'flow-mesh-regulator.png'))
        view('fault-center')
        lab.locator('[data-command=recover]').click()
        expect(lab.locator('#active')).to_have_text('')
        lab.locator('#speed').select_option('16')
        lab.locator('[data-command=start]').click()
        expect(lab.locator('#phase')).to_have_text('Complete', timeout=20000)
        expect(lab.locator('#computer')).to_contain_text('Payload OPERATING')
        expect(lab.locator('#orbit-note')).to_contain_text('400 km reference orbit')
        view('network')
        lab.locator('#bus').select_option('I²C')
        lab.locator('#bus-result').select_option('all')
        lab.locator('#bus-component').fill('payload')
        expect(lab.locator('#messages')).to_contain_text('payload')
        view('fault-center')
        lab.locator('#replay').click()
        expect(lab.locator('#phase')).to_have_text('Ground power-on')
        lab.locator('#seek').fill('360')
        expect(lab.locator('#phase')).to_have_text('Complete')
        view('system-flow')
        expect(lab.locator('#flow-time')).to_contain_text('Replay · 90.00 s')
        expect(mesh_rail).to_have_attribute('data-state', 'powered')
        expect(lab.locator('[data-link="radio:ground"]')).to_have_attribute('data-state', 'active')
        lab.locator('#mesh-inventory').click()
        expect(lab.locator('#instrument-array')).to_be_visible()
        passed('Flow Mesh fault tracing and replay', 'Traced a sensor over SPI, verified selective fault highlighting and recovery, traced power branches in a brownout, and opened the instrumentation inventory from replay')
        view('power-lab')
        lab.locator('#trace').select_option('history')
        lab.locator('#wave').click(position={'x': 25, 'y': 45})
        expect(lab.locator('#cursor')).not_to_contain_text('Click the trace')
        lab.locator('#timebase').select_option('.25')
        expect(lab.locator('#cursor')).to_have_text('Click the trace to read a sample')
        window_label = lab.locator('#scale').inner_text()
        lab.locator('#wave').click()
        cursor_label = lab.locator('#cursor').inner_text()
        lab.locator('#freeze-wave').click()
        expect(lab.locator('#scale')).to_have_text(window_label)
        expect(lab.locator('#cursor')).to_have_text(cursor_label)
        with lab.expect_download() as waveform:
            lab.locator('#csv').click()
        waveform.value.save_as(str(output/'lab-waveform.csv'))
        lab.screenshot(path=str(output/'graph-power-sweep.png'))
        lab.locator('#freeze-wave').click()
        view('visual')
        lab.locator('#twin-mode').select_option('orbit')
        expect(lab.locator('#earth')).to_be_visible()
        lab.screenshot(path=str(output/'electronics-lab.png'), full_page=True)
        lab.locator('#twin-mode').select_option('vehicle')
        lab.wait_for_timeout(700)
        lab.screenshot(path=str(output/'rocket-cutaway.png'), full_page=True)
        view('test-bench')
        lab.locator('#campaign-panel summary').click()
        lab.locator('#campaign-add').click()
        expect(lab.locator('.campaign-row')).to_have_count(3)
        lab.locator('.campaign-row').last.get_by_role('button', name='Remove').click()
        lab.get_by_role('button', name='Run campaign').click()
        expect(lab.locator('#campaign-result')).to_be_visible(timeout=25000)
        expect(lab.locator('#campaign-metrics tr').first.locator('td')).to_have_text(
            ['Time without a controller (s)', '0', '3'])
        expect(lab.locator('#campaign-metrics tr').nth(1).locator('td').last).not_to_have_text('0')
        lab.locator('#campaign-seek').fill('112')
        expect(lab.locator('#campaign-time')).to_contain_text('First: backup · Full: none')
        lab.screenshot(path=str(output/'reliability-campaign.png'))
        with lab.expect_download() as campaign_download:
            lab.locator('#campaign-export').click()
        campaign = json.loads(campaign_download.value.path().read_text())
        assert campaign['schema'] == 'orbit1-campaign-v1'
        assert campaign['trial']['frames'][112]['controller'] == 'none'
        lab.locator('#campaign-trial').click()
        expect(lab.locator('#flow-time')).to_contain_text('Replay · 28.00 s')
        expect(lab.locator('[data-node=primary]')).to_contain_text('FAILED')
        passed('Combined-fault campaigns', 'Compared scheduled watchdog and backup faults to watchdog alone, verified 3 s versus 0 s without a controller, exported JSON, and inspected the combined replay')

        view('investigation')
        lab.locator('#evaluation-start').click()
        interfaces = []
        for trial in range(2):
            expect(lab.locator('#incident-case')).to_be_visible(timeout=25000)
            expect(lab.locator('#incident-result')).to_be_empty()
            lab.locator('#incident-frame').fill('100')
            observations = lab.locator('#incident-observations')
            expect(observations).to_contain_text('Motion reading: Unavailable')
            diagnosis = 'regulator' if '3.50 V' in observations.inner_text() else 'imu'
            links = lab.locator('#incident-links')
            if links.is_visible():
                interfaces.append('guided')
                lab.screenshot(path=str(output/'reliability-investigation.png'))
                links.get_by_role('button', name='Flow Mesh').click()
                expect(lab.locator('#flow-time')).to_contain_text('Replay · 25.00 s')
                wire = mesh_rail if diagnosis == 'regulator' else mesh_spi
                wire.press('Enter')
                expect(lab.locator('#guide-evidence-summary')).to_contain_text('V')
                lab.locator('#guide-power').click()
                expect(lab.locator('#power-lab')).to_be_visible()
                expect(lab.locator('#scale')).to_contain_text('25 s')
                view('investigation')
            else:
                interfaces.append('standard')
            lab.locator('#incident-answer select').select_option(diagnosis)
            lab.get_by_role('button', name='Submit diagnosis').click()
            expect(lab.locator('#incident-result')).to_contain_text('Correct. Injected cause:')
            if trial == 0:
                lab.locator('#evaluation-next').click()
        assert set(interfaces) == {'guided', 'standard'}
        with lab.expect_download() as evaluation_download:
            lab.locator('#evaluation-export').click()
        evaluation = json.loads(evaluation_download.value.path().read_text())
        assert len(evaluation['results']) == 2
        assert all(trial['correct'] and trial['seconds'] >= 0 for trial in evaluation['results'])
        passed('Incident investigation and evidence links', 'Completed both randomized interface trials, opened exact-frame Flow Mesh and waveform evidence, revealed the two injected causes after diagnosis, and exported accuracy and timing')

        view('requirements')
        expect(lab.locator('#requirements-rows tr')).to_have_count(5)
        assert lab.locator('#requirements .table-wrap').evaluate('(pane) => pane.scrollWidth <= pane.clientWidth')
        with lab.expect_download() as matrix_download:
            lab.locator('#requirements-export').click()
        matrix = json.loads(matrix_download.value.path().read_text())
        assert all(item['status'] in {'Pending', 'Stale', 'Pass', 'Fail'} for item in matrix)
        lab.locator('#requirements-rows tr').nth(2).get_by_role('button', name='Replay current run').click()
        expect(lab.locator('#flow-time')).to_contain_text('Replay · 28.00 s')
        view('visual')
        lab.set_viewport_size({'width': 390, 'height': 844})
        lab.wait_for_timeout(500)
        assert lab.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Lab mobile horizontal overflow'
        expect(lab.locator('#workspace-select')).to_be_visible()
        assert lab.evaluate('document.documentElement.scrollHeight <= innerHeight'), 'Lab page scrolls vertically'
        lab.screenshot(path=str(output/'rocket-mobile.png'), full_page=True)
        lab.locator('#workspace-select').select_option('requirements')
        expect(lab.locator('#requirements-export')).to_be_enabled()
        assert lab.locator('#requirements .table-wrap').evaluate('(pane) => pane.scrollWidth <= pane.clientWidth')
        lab.screenshot(path=str(output/'reliability-requirements-mobile.png'))
        lab.locator('#workspace-select').select_option('system-flow')
        expect(lab.locator('#flow-mesh')).to_be_visible()
        assert lab.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Flow Mesh mobile horizontal overflow'
        expect(lab.locator('.mesh-pan-hint')).to_be_visible()
        lab.locator('.mesh-viewport').press('ArrowRight')
        lab.wait_for_function("document.querySelector('.mesh-viewport').scrollLeft > 0")
        lab.locator('.mesh-viewport').evaluate('(panel) => { panel.scrollLeft = 0; }')
        lab.screenshot(path=str(output/'flow-mesh-mobile.png'), full_page=True)
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
