# ORBIT-1 delivery report

Completed and verified on **10 November 2026**, in the project at `D:\ORBIT-1\ORBIT-1-R0.1`.

The application is running at **http://localhost:8780**. The completed source, browser assets, synthetic firmware, test harnesses, and launch/stop/verification scripts are in this folder.

## Delivered behavior

- Interactive WebGL Earth, atmosphere, spacecraft, calculated orbit line, drag/zoom/follow camera, and an Earth-fixed ground track.
- Python circular/elliptical Kepler mechanics with configurable perigee, eccentricity, inclination and RAAN; separate numerical propagation reference.
- Real Zephyr RTOS firmware execution in QEMU with strict live CSV ingestion, health and fault registers, packet history, restart detection, parser-error counts, and stale-link reporting.
- Separate Python-model fault injection and recovery, event log, time acceleration, pause, reset, altitude/speed/latitude graphs, and firmware health visualization.
- Rolling session recording, replay playback/scrubbing, JSON export/import, and clean-shutdown persistence. Replay is isolated from live model controls.
- Verification workspace with actual Python test output, background test execution, engineering milestones, and saved acceptance evidence marked stale after source edits.
- One-command Windows launcher: `./start.ps1`. Ubuntu equivalent: `bash scripts/launch.sh`. Stop with Ctrl+C or `./stop.ps1`.

## Actual verification results

The final `./verify.ps1` completed with **exit code 0**. It produced **16 passing verification entries**, including the following suites and checks:

| Verification | Actual result |
| --- | --- |
| Python unit and HTTP integration suite | **25 tests passed** in Ubuntu-24.04 / Python 3.12.3 |
| Browser model checks | Passed: clock, escaping, Kepler interpolation/closure, ground-track bounds, valid session acceptance and malformed session rejection |
| Zephyr build | Passed: `qemu_x86/atom`, Zephyr 4.5.99, West 1.5.0 |
| Bounded real QEMU telemetry run | **25 packets**, **zero parser errors**, firmware intervals **1020–1030 ms** |
| Firmware transitions | Observed **LIVE → DEGRADED → OK → STALE** |
| Managed launcher lifecycle | Real QEMU connected; duplicate launcher rejected; SIGTERM closed HTTP and owned QEMU; session JSON saved |
| Chrome acceptance | **11 checks passed**, zero JavaScript page errors |
| Desktop/mobile layout | Actual screenshots at 1600px and 390px widths; no horizontal mobile overflow |
| Renderer failure path | Blocking the 3D module displayed an explicit warning while backend controls remained available |

Chrome checks exercised calculated 3D motion, pointer camera control, 300x time, pause, model fault/recovery, an eccentric orbit at 63 degrees inclination, graph selection, replay/play/scrub, download/import, backend connection loss/recovery, and a newly completed Python test run triggered through the UI.

Final tested source SHA-256:

`a17ca6b22644d8f6d677fb4918fa5deaed538675ac5fc395ae610943b65292ca`

Evidence:

- [Combined verification JSON](../.runtime/verification.json)
- [Python test log](../.runtime/python-tests.log)
- [Firmware build log](../.runtime/verify-build.log)
- [QEMU results](../.runtime/qemu-results.json)
- [Launcher lifecycle log](../.runtime/launcher-lifecycle.log)
- [Browser results](../test-results/browser-results.json)
- [Desktop screenshot](../test-results/mission-control-desktop.png)
- [Mobile screenshot](../test-results/mission-control-mobile.png)
- [Verification workspace screenshot](../test-results/verification.png)

## Environment observations

Development and all Python/firmware acceptance ran in **WSL Ubuntu-24.04**, with the project kept on D:. VirtualEdge-Ubuntu was not used.

The Zephyr SDK initially selected bundled QEMU 10.0.2. The launcher/build/verification scripts now explicitly select the installed **Ubuntu QEMU 8.2.2** at `/usr/bin/qemu-system-i386`, including the CMake cache override. The final full verification used QEMU 8.2.2.

Browser acceptance used installed **Google Chrome 157.0.8103.39**, Playwright 1.48, and headless software WebGL (SwiftShader). The browser-test adapter ran under the available Windows Python; application code and Python tests ran under WSL Python 3.12.3. Browser assets are locally bundled, including Three.js 0.170.0 and its MIT license.

Build configuration emitted Zephyr board/devicetree and test random-generator warnings. These did not fail compilation. The synthetic application does not use randomness for security, and no cryptographic or flight qualification is claimed.

## Explicit limits and unverified work

- Physical GPU rendering/performance, Firefox/WebKit, touch-device interaction and extended unattended runs were not tested.
- Automated browser coverage includes the default circular LEO and a configured eccentric/inclined case; it does not exhaust every allowed parameter combination.
- This is an ideal two-body orbital model. Perturbations, atmosphere, drag, thrust and maneuvers are excluded. Surface geography and lighting are illustrative; the spacecraft symbol is enlarged.
- Firmware altitude/speed are fixed **synthetic reference values**, independent of the calculated Python orbit. No physical measurements are presented as real sensor data.
- Recordings are bounded laboratory buffers. Reset/reconfigure clears the current model recording; a clean shutdown saves it. Abrupt power loss is not a guaranteed persistence path.
- There are no real rocket outputs, propulsion, launch, staging, physical flight-control commands, hardware-in-the-loop validation, or real-flight qualification.

Full usage, architecture, API and rerun instructions are in [README.md](../README.md).
