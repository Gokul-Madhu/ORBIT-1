# ORBIT-1 requirements and acceptance mapping

All spacecraft, orbit and sensor data are simulated. No propulsion, launch,
staging, ignition, real navigation or physical flight-control interfaces exist.

| Requirement | Implementation | Automated evidence |
| --- | --- | --- |
| Interactive 3D Earth | WebGL sphere, local illustrative surface, atmosphere, drag/zoom/follow | Chrome frame rendering and pointer interaction |
| Calculated spacecraft orbit | Python Kepler ellipse, ECI position/velocity and predicted track | Closure, perigee/apogee, vis-viva energy, angular momentum tests; Chrome motion |
| Independent numerical reference | Velocity-Verlet two-body propagator and CSV | Energy conservation and one-orbit closure tests |
| Synthetic RTOS flight computer | Zephyr 4.5.99, qemu_x86/atom, system QEMU 8.2.2 | Real West build and bounded firmware run |
| Live telemetry | Managed QEMU stdout -> strict parser -> mission API -> browser | Real packet receipt, cadence, health, stale link, Chrome live status |
| Sensor health and recovery | Firmware missed-sample scenario; separate model fault controls | Firmware DEGRADED/OK transitions, model and browser fault tests |
| Detailed graphs | Altitude, speed, latitude, firmware health, predicted track | Model histories and Chrome graph controls |
| Mission replay | Bounded session recording, play/scrub, JSON import/export | Session schema tests, Chrome download/import/play/scrub |
| Verification workspace | Real test output and source-hashed acceptance evidence | Browser-triggered test rerun and output inspection |
| One-command lifecycle | start.ps1 / launch.sh, per-port locks, owned QEMU shutdown | Managed launcher integration, duplicate rejection, process exit and saved recording |
| Simulation provenance | Explicit model vs synthetic firmware labels | API provenance and visible source labels |

## Telemetry schema

`TELEM,uptime_ms,SIM_ORBIT,sensor_sequence,health,fault_flags,altitude_m,speed_mps`

Example: `TELEM,24000,SIM_ORBIT,21,DEGRADED,1,400000,7669`

- All five numeric fields must be nonnegative integers.
- Mode is `SIM_ORBIT`; health is `OK` or `DEGRADED`.
- `fault_flags` bit 0 reports two or more missed synthetic updates.
- Firmware reference altitude and speed are fixed demonstration values, independent of the analytical model.
- Unrelated boot/build output is ignored. Malformed TELEM increments the parser-error counter.
- A link is LIVE only after an actual received packet, STALE after five seconds without another, and NOT CONNECTED before any receipt.
- Dashboard backend loss is shown separately as OFFLINE and firmware link UNKNOWN, preserving last received values.

## Model limits

The analytical model starts already in orbit. It uses a spherical Earth for surface coordinates and ideal two-body gravity for motion. It excludes atmosphere, oblateness, third bodies, thrust and maneuvers. Display interpolation uses the same Kepler equations while Python remains authoritative. The visible spacecraft is enlarged and surface geometry is illustrative. No hardware-in-the-loop or real-flight qualification is claimed.
