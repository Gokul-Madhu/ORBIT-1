# Fault investigation and scenario testing

Open the workbench and select **Test bench**. The default experiment interrupts
motion sensor A from 25 to 30 simulation seconds. Both runs start with the
same model and random seed. The trial applies the fault at the selected frame.
The live mission keeps its own state while the test runs.

Choose a fault, sensor, injection time, recovery time, and expected outcome.
The runner checks the expectation on every frame in the fault window. The
recovery check compares the selected sensor’s health and reading availability
with the baseline at the recovery frame. It does not compare numeric readings
or assert full-system recovery. Click a result to move the shared comparison
cursor to its evidence. The comparison shows rail voltage, the selected
reading, and packet outcomes at the same timestamp. Optional side-by-side
3D views use those same recorded frames.

Use **Open trial in replay**, select the motion sensor, and click **Trace this
reading**. The trace shows power, component status, the latest recorded message
and the outcome. Its replay button opens the first frame of the current
unavailable interval with the same component status. The guide announces
observable rail drops, sensor failures and recovery as the displayed state
changes.

Try a second run with **Regulator brownout** and the same expected outcome.
The SPI interruption leaves the rail at 5 V and logs an attempted timeout.
The brownout drops the rail to 3.5 V and the unpowered sensor sends no packet.
Both experiments produce unavailable readings for different reasons.

## Repeatable evidence

**Export test evidence** saves the input configuration, seed, model hash,
assertion results and frame indices, plus both recordings. To run the same
scenario outside the browser, create a JSON file such as:

```json
{"fault":"imu","sensor":"sensor_a","inject_s":25,"recover_s":30,"expect":"unavailable"}
```

From the project root in Ubuntu-24.04:

```bash
python3 -m orbit1.scenarios scenario.json --output .runtime/scenario-report.json
```

The command exits with code 1 if an expectation fails. Use the report's frame
index and recorded timestamp to inspect the evidence.

## Separate Zephyr firmware experiment

Run from the project root in Windows PowerShell:

```powershell
wsl -d Ubuntu-24.04 -- bash scripts/firmware_bench.sh
```

This builds a separate Zephyr image and starts its own QEMU process. The test
sends ASCII sample 3 through the emulated serial console, withholds input,
waits for the firmware to report STALE, then sends sample 7 and checks
recovery. The report contains actual firmware uptime, sequence, reported
state and firmware image hash. It is displayed with **Load firmware test
report** and saved in `.runtime/firmware-bench.json`. The verified run
reported WAITING, VALID 3, STALE after 1,000 ms, and VALID 7.

The browser comparisons use the host model. The UART test measures a narrow
firmware behavior separately. It does not feed the full rocket model into
Zephyr or claim equivalence between the two executions.
