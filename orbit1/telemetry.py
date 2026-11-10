"""Strict telemetry parser for the synthetic Zephyr/QEMU demonstration."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Telemetry:
    uptime_ms: int
    mode: str
    sensor_seq: int
    health: str
    fault_flags: int
    sim_alt_m: int
    sim_speed_mps: int


def parse_line(line):
    """Returns None for unrelated build and QEMU output; raises on malformed TELEM."""
    # Zephyr logger may precede the CSV with timestamps.
    pos = line.find('TELEM,')
    if pos < 0:
        return None
    fields = line[pos:].strip().split(',')
    if len(fields) != 8 or fields[0] != 'TELEM':
        raise ValueError(f'Expected 8 CSV fields: {line.strip()}')
    _, uptime, mode, seq, health, faults, altitude, speed = fields
    if mode not in {'SIM_ORBIT'} or health not in {'OK','DEGRADED'}:
        raise ValueError('Invalid mode or health label')
    numeric = [int(x) for x in (uptime,seq,faults,altitude,speed)]
    if any(x < 0 for x in numeric):
        raise ValueError('Expected nonnegative fields')
    return Telemetry(numeric[0],mode,numeric[1],health,numeric[2],numeric[3],numeric[4])
