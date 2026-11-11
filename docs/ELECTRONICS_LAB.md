# ORBIT-1 electronics laboratory

Run `./start.ps1` from the Windows project directory. The launcher starts the
existing Ubuntu-24.04 environment and opens the workbench when the server is
ready. Use `./start.ps1 --no-qemu` for a host-only session. The firmware panel
then reports its disconnected state. Use the Mission Control link for the
independent orbital sandbox and its verification tab.

In the workbench, choose a simulation rate and press **Run / resume**.
Click a board in the 3D cutaway or use the matching component button.
The isolated PCB view shows selectable packages and a live sensor inspector.
Use the view selector for the avionics bay, bus network, ground and flight
reference, or Earth and orbit. The shell toggle, opacity, and exploded view
change the display geometry. Fault Focus opens the first failed component.
Pause
and use **Step 250 ms** to inspect one acquisition cycle. Inject or recover a
fault, then step or resume to apply its effects on the next frame. **Review
recording** freezes the displayed frame and unlocks the seek slider and
playback controls. Export
the recording to JSON or export the active power plot to CSV before resetting.
The host may continue advancing while you inspect the frozen recording.

To reproduce the 3D fault demonstration, reset the lab, select **Primary
accelerometer / IMU**, choose **Primary sensor interruption**, and press
**Inject**, then **Step 250 ms**. The PCB outline turns red and the inspector
shows that its sample is unavailable. Switch to **Bus network** to see the
failed SPI route. **Fault Focus** returns the camera to the failed board.
Press **Recover selected fault**, then step again to restore valid readings.

## Model and data flow

The laboratory has a 250 ms fixed simulation step and a deterministic noise
source. The 90-second demonstration timeline is a sequence of scripted
electronics test cues. The bench excitation and pressure chamber reference
change during those cues. At the stage cue a checkout load disconnects.
At orbit acquisition the existing Kepler engine begins a separate 400 km
circular reference, followed by payload initialization and virtual deployment.
The cues are arbitrary bench timing. There is no continuous ascent trajectory
or computed orbital insertion.

Battery open-circuit voltage and internal resistance feed a current-load
approximation, a regulator with dropout and efficiency, and a shared rail.
The power model uses volts, amperes, watts, a 2 Ah reference capacity, and a
lumped temperature in degrees Celsius. When the rail crosses the 4.7 V
threshold the powered components stop delivering data. The waveform viewer
uses the closed-form first-order RC step response with a 2 ms time constant.
Its second view plots battery and rail history. Loads are nominal constant
current abstractions, including during brownout.

The two three-axis accelerometer channels, gyro, GNSS reference, and
pressure/temperature channels share the
power state. The first reference channel includes seeded Gaussian noise and
an optional temperature-dependent offset. The gyro reports derivatives of
the illustrative angle reference, approximated as component-wise rates.
GNSS reports ideal inertial position after orbit acquisition. Measurement
uncertainty, satellite geometry and RF signal strength are unmodeled.
Measurements produce inspectable
SPI, CAN, I²C and UART transactions with little-endian float32 payloads,
modeled CRC-16, and a calculated wire time. The bus labels identify virtual
interfaces. They use a common test packet envelope and do not reproduce
protocol-specific electrical timing or arbitration. The virtual ground link
delivers a successful UART sample one simulation tick later unless a radio
outage drops it.

Controller selection uses virtual power, watchdog and backup availability.
Sensor and bus faults affect the delivered readings. A payload fault prevents
the model from reporting payload operation. The QEMU panel reads real packet
receipt, uptime and synthetic health from the running Zephyr instance.
Firmware time remains independent of the lab clock. The host model does not
write to firmware or substitute its values for firmware measurements.

The lab endpoint shares the server's mission lock and worker. Its clock is
separate from the original orbital sandbox. `GET /api/lab` returns live state
and bounded summaries, `GET /api/lab/recording` returns the recorded run, and
`POST /api/lab` accepts lab controls. A run holds at most 361 snapshots,
8,192 transactions, and 150 events. Live polling retrieves 32 recent
transactions. JSON export captures the full current in-memory recording.

## Verification and remaining fidelity

Run `./verify.ps1` against the running application. It checks Python models,
builds and runs QEMU, and exercises browser interactions. The lab tests
cover deterministic mission completion, electrical response, protocol
integrity, clock controls, and 16 fault/recovery cases.

The original workbench passed `./verify.ps1` on 10 November 2026 with **29
Python tests**, **12 Chrome acceptance checks**, and **17 total verification
entries**. The QEMU 8.2.2 run received 25 firmware packets at 1020–1030 ms
intervals with zero parser errors and observed live, degraded, recovered,
and stale states. Browser acceptance exercised a regulator brownout and
recovery, completion at the orbital reference, packet filtering, replay,
and waveform download. A separate live host-only check confirmed that
the lab runs with the firmware state disconnected and no firmware packet.
See the [verification JSON](../.runtime/verification.json),
[Python log](../.runtime/python-tests.log), and
[workbench screenshot](../test-results/electronics-lab.png).

The earlier delivery report describes the original orbital sandbox.
The verification JSON reflects the extended release.

The 3D release added an interactive cutaway, PCB inspection, sensor plots,
animated bus paths, fault focus, and variable-rate replay. On 11 November
2026 the Python suite passed 30 tests and Chrome passed 13 acceptance checks
with no page errors. The browser test selected each modeled board, ray-picked
a PCB package, matched failed SPI transactions to the red IMU outline and
connection, and verified that recovery restored valid readings and green
highlighting. Desktop and 390 px screenshots were inspected after correcting
camera clipping and mobile navigation overlap.

- [Desktop cutaway](../test-results/rocket-cutaway.png)
- [IMU failure and bus network](../test-results/rocket-fault-network.png)
- [Mobile workbench](../test-results/rocket-mobile.png)
- [Browser acceptance results](../test-results/browser-results.json)

On this Windows installation the browser harness uses a project-local
Playwright package for Python 3.12. To recreate it, run
`py -3.12 -m pip install --target .tools/python312 playwright==1.48.0`.
The `verify.ps1` script selects that runtime when the directory exists.

The workbench consolidates multiple requested instruments into one page.
Still outstanding are detailed terrain and transition cinematics, GNSS
constellation geometry, protocol-specific framing, retries and arbitration,
multiple independent power rails, ngspice netlists and a circuit editor,
oscilloscope triggering, GPIO/ADC/logic analysis, and a bidirectional
firmware bridge with measured RTOS task, CPU and stack instrumentation.
The ground view uses normalized display progress and an illustrative pad.
Orbit is propagated by the separate Kepler reference. The packet animations
show transactions from the displayed simulation tick with an expanded visual
duration. At high acceleration, polls can skip intermediate ticks. The
recording retains the full transaction history of a nominal run. Host-side
failure outlines use applied faults, transaction outcomes, and power
dependencies. QEMU status remains independent of the host model.

Extended operation, physical GPU performance and hardware validation have
not been established. All modeled dimensions are illustrative.

## Next integration milestones

1. Expand the virtual peripheral bridge so Zephyr can consume host bench
   samples and expose measured scheduling, stack and CPU instrumentation.
   Verify the bridge independently from the displayed host-side controller.
2. Add circuit-solver exports and validate selected power and signal models
   against reference waveforms. Extend the analyzer with protocol-specific
   framing, retries and bus contention.
3. Expand the illustrative pad environment and mission cameras, then verify
   frame pacing on the target RTX 3050 and interactions on a touch device.
