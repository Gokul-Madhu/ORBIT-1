# ORBIT-1 Mission Control 1.0

The **Electronics lab** opens automatically when launched from Windows. It is also
available at `http://localhost:8780/lab.html`, with a link back to orbital
Mission Control. See [the electronics laboratory guide](docs/ELECTRONICS_LAB.md)
for controls, models, and fidelity limits.
See the [scenario test bench guide](docs/SCENARIO_TEST_BENCH.md) to compare
normal operation against a fault and reproduce the separate Zephyr UART test.

A complete **local, simulation-only** orbital laboratory: Python Kepler mechanics, an interactive WebGL Earth, recorded mission replay, and synthetic Zephyr RTOS telemetry from QEMU. There are no physical measurements, vehicle commands, actuators, propulsion, launch sequences, or flight-control outputs.

## Start the application

From this folder in Windows PowerShell:

```powershell
.\start.ps1
```

Open **http://localhost:8780**. This command explicitly uses **WSL Ubuntu-24.04**, activates the existing `~/zephyrproject/.venv`, runs the Python tests, builds the firmware into `zephyr/build-mission`, and starts its own QEMU process and localhost server. No browser-side downloads, npm install, cloud account, or Python web framework are required. Three.js 0.170.0 and its MIT license are included under `orbit1/web/vendor`.

Keep the launcher running. Ctrl+C performs a clean shutdown and saves the session. From another PowerShell window, `./stop.ps1` stops this project's managed instance. Existing unrelated QEMU processes and other WSL distributions are left alone.

In Ubuntu-24.04, the equivalent one-command launch is `bash scripts/launch.sh`. Set `ORBIT_ZEPHYR_WORKSPACE` if your existing Zephyr workspace is elsewhere. The launcher uses project-local build directories and never reinstalls or replaces Zephyr.

Useful optional flags:

- `./start.ps1 --skip-build`: reuse the already built mission firmware.
- `./start.ps1 --no-qemu`: analytical model only; firmware status remains disconnected.
- `./start.ps1 --port 8790`: use another local port. Stop it with `./stop.ps1 --port 8790`.

The default launch starts paused. Press **Run** or Space to advance the reference orbit.

## What is interactive

- **3D Earth:** drag to orbit the camera, scroll to zoom, follow the spacecraft, or reset the camera. The atmosphere and land surface are illustrative, generated locally. Earth and orbital radii share a common scale; the spacecraft symbol is enlarged for visibility.
- **Calculated motion:** circular or elliptical orbits, 150–20,000 km perigee, eccentricity 0–0.6, inclination 0–180 degrees, and configurable ascending node. Apply resets the model clock and current recording.
- **Time:** run, pause, reset, and 1x/10x/30x/60x/300x acceleration. The Python worker advances even without a browser polling it.
- **Model faults:** inject a synthetic sensor timeout and recover it. These controls affect only the Python demonstration, never QEMU or hardware.
- **Firmware telemetry:** actual received records from running Zephyr/QEMU, explicitly synthetic. Uptime, sensor sequence, fault flags, fixed reference altitude/speed, parser errors, restart count, packet age, and health history are shown independently of the Python orbit.
- **Automatic firmware recovery:** firmware deliberately misses sensor updates during cycles 20–23 of each 30-cycle period. Two missed updates set fault bit 0; fresh samples restore OK.
- **Graphs:** orbital altitude, speed, or latitude against simulation time; a separate firmware health timeline; and a predicted one-orbit Earth-fixed ground track.
- **Replay:** scrub and play the rolling recording, export it as JSON, and import a saved session. Replay uses recorded states and telemetry; live operation continues separately. Live model controls are disabled while reviewing a replay. Reset or reconfiguration clears the current model recording.
- **Verification:** view actual Python test output, rerun tests without blocking telemetry, inspect repository milestones, and inspect saved acceptance evidence. Evidence is marked STALE when source contents change.

## Architecture

```text
Windows start.ps1
  -> WSL Ubuntu-24.04 / scripts/launch.sh
  -> orbit1.launcher
       |-- West -> isolated Zephyr build -> managed QEMU process
       |              stdout TELEM CSV -> strict parser -> mission telemetry
       |-- Python Kepler model -> background state/history/session recorder
       `-- localhost HTTP API -> WebGL UI + charts + session replay
```

- `orbit1/engine.py`: analytical 3D Kepler solution, inertial state, ground track, parameter validation.
- `orbit1/orbit.py`: independent velocity-Verlet reference propagator and CSV export.
- `orbit1/dashboard.py`: synchronized mission state, bounded recording, log follower, telemetry ingestion, HTTP API.
- `orbit1/launcher.py`: build/run lifecycle, per-port duplicate lock, owned-process shutdown, session persistence.
- `orbit1/telemetry.py`: strict synthetic CSV parser.
- `orbit1/web/scene.js`: Three.js renderer; ECI `(x,y,z)` maps to scene `(x,z,-y)`.
- `orbit1/web/main.js`: controls, graphs, telemetry, replay, verification workspace.
- `orbit1/web/model.js`: display interpolation and recorded-session validation. Authoritative live state comes from Python.
- `zephyr/src/main.c`: synthetic firmware sensor health demonstration; no hardware outputs.
- `scripts/verify_backend.py`, `scripts/validate_qemu.py`, `scripts/browser_acceptance.py`: real acceptance checks.

The Kepler engine uses Earth's gravitational parameter 3.986004418e14 m^3/s^2 and equatorial radius 6,378,137 m. Perigee defines semimajor axis `a = (R + perigee) / (1-e)`. Newton iteration solves Kepler's equation; rotation by inclination and RAAN produces ECI position and velocity. Earth-fixed longitude includes Earth rotation. The independent numerical propagator tests energy and orbit closure.

## Automated verification

With the application running, execute from Windows:

```powershell
.\verify.ps1
```

This runs:

1. Node model/replay validation checks.
2. Python unit and HTTP integration tests in Ubuntu-24.04.
3. A real Zephyr build in `zephyr/build-validation`.
4. A bounded QEMU run checking packet cadence, synthetic degradation, recovery, malformed-record count, and stale-link detection.
5. A separate managed application on port 8781, verifying live QEMU, duplicate-launch rejection, clean HTTP/QEMU shutdown, and saved recording.
6. Actual headless Chrome interactions: WebGL rendering, spacecraft motion, camera drag, time controls, faults, orbit configuration, charts, replay, export/import, offline recovery, test rerun, responsive layout, and renderer failure fallback.

The browser harness uses an installed Windows Chrome and Playwright. The development environment has Playwright in `.tools/python`; for a fresh checkout install it with `python -m pip install --target .tools/python playwright==1.48.0`. The application itself does not need Playwright or Node. `--executable` and `--url` can be passed to `verify.ps1` for another browser executable or application URL. Port 8781 must be free for the isolated lifecycle check.

For backend-only verification in Ubuntu use `bash scripts/verify.sh`. For the quick offline Python suite use `bash scripts/run_tests.sh`.

Machine-readable results live in `.runtime/verification.json`, `.runtime/backend-results.json`, `.runtime/qemu-results.json`, `.runtime/model-results.json`, and `test-results/browser-results.json`. Browser screenshots are in `test-results/`. Source hashes associate saved acceptance results with the tested code; source edits require rerunning verification.

## Data and API

The server binds only `127.0.0.1`. All assets are served locally. There are no telemetry uploads or third-party requests.

- `GET /api/status`: analytical state, calculated trajectory, bounded history, received QEMU state, events, test status, verification evidence.
- `GET /api/session`: `orbit1-session-v1` recording for replay/export.
- `GET /api/test-output`: real last Python test output.
- `POST /api/command`: start, pause, reset, speed, configure, inject_fault, clear_fault, test. Commands affect only the local analytical model or test runner.

Firmware records use `TELEM,uptime_ms,SIM_ORBIT,sensor_sequence,health,fault_flags,altitude_m,speed_mps`. Firmware altitude and speed are fixed demonstration values. They do not drive the analytical spacecraft and are not sensor measurements.

The recorder holds up to 3,600 frames at approximately 0.6-second wall intervals (about 36 minutes), a bounded orbital history, 1,800 firmware packets, and 70 recent events. The UI plots recent subsets. A clean shutdown saves `.runtime/session-<UTC timestamp>.json`; use Import to review it. Runtime files and test screenshots are generated artifacts. Export important sessions before resetting or ending a long run. Recordings are best-effort local laboratory data, not an audit trail.

## Limits and unverified areas

This is not flight software. The model excludes atmosphere, oblateness, third-body forces, drag, thrust, maneuvers, and real navigation. Surface geometry, lighting and spacecraft scale are illustrative. No hardware-in-the-loop or real vehicle qualification is included. Automated browser acceptance uses headless Chrome software WebGL; physical GPU performance and other browser engines require separate validation. Long-duration unattended operation is not certified by the short acceptance runs.

See `docs/DELIVERY_REPORT.md` for the actual final verification results and environment observations.
