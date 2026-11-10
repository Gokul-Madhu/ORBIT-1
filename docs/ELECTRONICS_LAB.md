# ORBIT-1 electronics laboratory

Run `./start.ps1` from the Windows project directory. The launcher starts the
existing Ubuntu-24.04 environment and opens the workbench when the server is
ready. Use `./start.ps1 --no-qemu` for a host-only session. The firmware panel
then reports its disconnected state. Use the Mission Control link for the
independent orbital sandbox and its verification tab.

In the workbench, choose a simulation rate and press **Run / resume**. Pause
and use **Step 250 ms** to inspect one acquisition cycle. Inject or recover a
fault, then step or resume to apply its effects on the next frame. **Review
recording** freezes the displayed frame and unlocks the seek slider. Export
the recording to JSON or export the active power plot to CSV before resetting.
The host may continue advancing while you inspect the frozen recording.

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

The two reference channels and pressure/temperature channels share the
power state. The first reference channel includes seeded Gaussian noise and
an optional temperature-dependent offset. Measurements produce inspectable
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
2,048 transactions, and 150 events. Live polling retrieves 32 recent
transactions. JSON export captures the full current in-memory recording.

## Verification and remaining fidelity

Run `./verify.ps1` against the running application. It checks Python models,
builds and runs QEMU, and exercises browser interactions. The lab tests
cover deterministic mission completion, electrical response, protocol
integrity, clock controls, and 13 fault/recovery cases.

The extended release passed `./verify.ps1` on 10 November 2026 with **29
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

The workbench consolidates multiple requested instruments into one page.
Still outstanding are a detailed pre-orbit vehicle animation, modeled GNSS
and multi-axis inertial sensors, protocol-specific framing and arbitration,
multiple independent power rails, ngspice netlists and a full circuit editor,
oscilloscope triggering and adjustable scales, automatic replay playback
for lab frames, and a bidirectional firmware bridge with measured RTOS task
and stack instrumentation. Extended operation and hardware validation have
not been established. This release is an electronics demonstration, not a
validated vehicle model.
