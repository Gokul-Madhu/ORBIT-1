"""Deterministic electronics bench driven by scripted demonstration milestones."""
from collections import deque
from math import cos, exp, sin
import random
import struct
import time
from binascii import crc_hqx

from .engine import Orbit


PHASES = (
    (0, 'Ground power-on'), (5, 'Built-in self-test'),
    (10, 'Ground link checkout'), (15, 'Prelaunch monitoring'),
    (20, 'Liftoff cue'), (25, 'Atmospheric phase cue'),
    (35, 'Stage transition cue'), (40, 'Spaceflight cue'),
    (50, 'Orbit acquisition cue'), (55, 'Payload initialization'),
    (60, 'Virtual deployment'), (65, 'Orbital operations'), (90, 'Complete'),
)
FAULTS = {
    'battery': 'Battery voltage drop', 'regulator': 'Regulator brownout',
    'imu': 'Primary sensor interruption', 'disagreement': 'Sensor disagreement',
    'i2c': 'I²C timeout', 'spi': 'SPI integrity error',
    'uart': 'UART frame loss', 'can': 'CAN link failure',
    'watchdog': 'Primary heartbeat loss', 'backup': 'Backup unavailable',
    'radio': 'Ground link outage', 'thermal': 'Thermal drift',
    'payload': 'Payload initialization fault',
    'gyro': 'Gyroscope sample timeout', 'gnss': 'GNSS reference unavailable',
    'temperature': 'Temperature sensor open circuit',
}
DEVICES = {
    'primary': ('SPI', 0.20), 'backup': ('CAN', 0.12),
    'sensor_a': ('SPI', 0.045), 'sensor_b': ('CAN', 0.045),
    'temperature': ('I²C', 0.015), 'radio': ('UART', 0.15),
    'payload': ('I²C', 0.25), 'pressure': ('SPI', 0.025),
    'checkout_load': ('—', 0.08),
    'gyro': ('SPI', 0.020), 'gnss': ('CAN', 0.035),
}
BIT_RATES = {'SPI': 1_000_000, 'CAN': 250_000, 'I²C': 100_000, 'UART': 115_200}
SENSOR_SPECS = {
    'sensor_a': ('Primary accelerometer / IMU', 'm/s²', '±16 per axis', 'Seeded noise σ = 0.004 on X; thermal bias scenario'),
    'sensor_b': ('Redundant accelerometer', 'm/s²', '±16 per axis', 'Ideal backup bench channel; disagreement scenario offsets X'),
    'gyro': ('Angular-rate sensor', 'rad/s', '±2 per axis', 'Rates of the scripted orientation reference'),
    'gnss': ('GNSS reference receiver', 'km', '400 km orbital reference', 'Ideal orbital state; receiver geometry and uncertainty are unmodeled'),
    'temperature': ('Board temperature sensor', '°C', '−40 to 125 display range', 'Lumped regulator losses and ambient cooling'),
    'pressure': ('Pressure transducer', 'kPa', '0.2–101.3', 'Scripted chamber profile independent of physical altitude'),
    'monitor': ('Power monitor', 'V / A', '0–9 V / 0–2 A display range', 'Direct model taps for battery, rail, and supply current'),
}


class ElectronicsLab:
    """All public operations are serialized by the owning Mission lock."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.tick = 0
        self.running = False
        self.speed = 1
        self.wall = time.monotonic()
        self.credit = 0.0
        self.soc = 1.0
        self.temperature = 22.0
        self.resets = 0
        self.previous_controller = 'none'
        self.watchdog_active = False
        self.faults = set()
        self.frames = deque(maxlen=361)
        self.events = deque(maxlen=150)
        self.transactions = deque(maxlen=8192)
        self.waveform = []
        self.rng = random.Random(42)
        self.orbit = Orbit()
        self.trajectory = self.orbit.trajectory()
        self.previous_phase = None
        self.pending_radio = None
        self.received = 0
        self.dropped = 0
        self.step(initial=True)

    def advance(self, now):
        if self.running:
            self.credit += min(now - self.wall, 2) * self.speed
            while self.credit >= 0.25 and self.running:
                self.credit -= 0.25
                self.step()
        self.wall = now

    def event(self, message):
        self.events.append({'t_s': self.tick / 4, 'message': message})

    def exchange(self, protocol, sender, receiver, value, fault=None, field=None):
        payload = struct.pack('<f', value)
        checksum = crc_hqx(payload, 0xffff)
        wire = payload
        if fault == 'integrity error':
            wire = bytes([payload[0] ^ 1]) + payload[1:]
            assert crc_hqx(wire, 0xffff) != checksum
        bits = (len(wire) + 2) * (10 if protocol == 'UART' else 8)
        self.transactions.append({
            't_s': self.tick / 4, 'bus': protocol, 'source': sender,
            'destination': receiver, 'hex': wire.hex(' '), 'crc16': f'{checksum:04x}',
            'wire_ms': 1000 * bits / BIT_RATES[protocol], 'result': fault or 'ok',
            'rate_bps': BIT_RATES[protocol], 'field': field,
            'value': struct.unpack('<f', wire)[0] if not fault else None,
        })
        return None if fault else value

    def step(self, initial=False):
        if not initial and self.tick >= 360:
            return
        if not initial:
            self.tick += 1
        t = self.tick / 4
        phase = next(label for start, label in reversed(PHASES) if t >= start)
        if phase != self.previous_phase:
            self.event(phase)
            self.previous_phase = phase
        fault = self.faults
        enabled = {name for name in DEVICES if (name != 'payload' or t >= 55)
                   and (name != 'gnss' or t >= 50)}
        if t >= 35:
            enabled.remove('checkout_load')
        current = sum(DEVICES[name][1] for name in enabled)
        ocv = 6.0 if 'battery' in fault else 7.2 + 1.2 * self.soc
        efficiency = 0.88
        # Solve V_terminal = OCV - R*I, with I = P/V_terminal.
        demand = 5 * current / efficiency
        terminal = (ocv + (ocv**2 - 4 * 0.35 * demand)**0.5) / 2
        rail = min(5.0, max(0, terminal - 1.1))
        if 'regulator' in fault:
            rail *= 0.7
        battery_current = rail * current / (efficiency * terminal)
        self.soc = max(0, self.soc - battery_current * 0.25 / 7200)
        losses = rail * current * (1 / efficiency - 1) + 0.35 * battery_current**2
        self.temperature += 0.25 * (losses * 0.6 - (self.temperature - 22) / 60)
        powered = rail >= 4.7
        watchdog = 'watchdog' in fault and powered
        if watchdog and not self.watchdog_active:
            self.resets += 1
            self.event('Primary virtual watchdog reset')
        self.watchdog_active = watchdog
        primary = powered and not watchdog
        backup = powered and 'backup' not in fault
        controller = 'primary' if primary else 'backup' if backup else 'none'
        if controller != self.previous_controller:
            self.event(f'Active virtual controller: {controller}')
            self.previous_controller = controller
        # A bench excitation waveform used to exercise data acquisition.
        stimulus = sin(t * 2) if 20 <= t < 50 else 0
        chamber_kpa = 101.3 if t < 20 else max(0.2, 101.3 * exp(-(t - 20) / 7))
        drift = 0.15 + (self.temperature - 22) * 0.02 if 'thermal' in fault else 0
        channels = {}
        vectors = {}
        orbital = self.orbit.sample(t - 50) if t >= 50 else None
        moving = 20 <= t < 50
        orientation = [0.12 * sin(t * 2), 0.08 * sin(t), 0.04 * sin(t * .5)] if moving else [0, 0, 0]
        rates = [0.24 * cos(t * 2), 0.08 * cos(t), 0.02 * cos(t * .5)] if moving else [0, 0, 0]
        if powered and controller != 'none':
            a = round(stimulus + drift + self.rng.gauss(0, 0.004), 3)
            b = round(stimulus + (0.5 if 'disagreement' in fault else 0), 3)
            channels['sensor_a'] = self.exchange('SPI', 'sensor_a', controller, a,
                'timeout' if 'imu' in fault else 'integrity error' if 'spi' in fault else None)
            channels['sensor_b'] = self.exchange('CAN', 'sensor_b', controller, b,
                'link unavailable' if 'can' in fault else None)
            channels['temperature'] = self.exchange('I²C', 'temperature', controller,
                round(self.temperature, 2), 'timeout' if 'i2c' in fault or 'temperature' in fault else None)
            channels['pressure'] = self.exchange('SPI', 'pressure', controller,
                round(chamber_kpa, 2), 'integrity error' if 'spi' in fault else None)
            for name, bus, issue in (
                ('sensor_a', 'SPI', 'timeout' if 'imu' in fault else 'integrity error' if 'spi' in fault else None),
                ('sensor_b', 'CAN', 'link unavailable' if 'can' in fault else None),
            ):
                # X uses the existing sample; Y and Z have independent test excitation.
                other_axes = (0.25 * sin(t), 0.1 * cos(t * 2)) if moving else (0, 0)
                tail = [self.exchange(bus, name, controller, value, issue, axis)
                        for axis, value in zip(('Y', 'Z'), other_axes)]
                vectors[name] = [channels[name], *tail] if not issue else None
            gyro_issue = 'timeout' if 'gyro' in fault else 'integrity error' if 'spi' in fault else None
            vectors['gyro'] = [self.exchange('SPI', 'gyro', controller, value, gyro_issue, axis)
                               for axis, value in zip('XYZ', rates)]
            if gyro_issue:
                vectors['gyro'] = None
            if orbital:
                gnss_issue = 'link unavailable' if 'gnss' in fault or 'can' in fault else None
                vectors['gnss'] = [self.exchange('CAN', 'gnss', controller, value, gnss_issue, axis)
                                   for axis, value in zip('XYZ', orbital['position_eci_km'])]
                if gnss_issue:
                    vectors['gnss'] = None
        disagreement = all(channels.get(k) is not None for k in ('sensor_a', 'sensor_b')) and abs(
            channels['sensor_a'] - channels['sensor_b']) > 0.1
        payload = 'OFF'
        if t >= 55 and powered:
            payload = 'FAILED' if 'payload' in fault or 'i2c' in fault else 'OPERATING' if t >= 60 else 'INITIALIZING'
            if controller != 'none':
                self.exchange('I²C', 'payload', controller, float(payload == 'OPERATING'),
                              'timeout' if 'i2c' in fault else None)
        if self.pending_radio is not None:
            if 'radio' in fault:
                self.dropped += 1
            else:
                self.received += 1
            self.pending_radio = None
        if powered and controller != 'none':
            self.pending_radio = self.exchange('UART', controller, 'radio', rail,
                                               'frame lost' if 'uart' in fault else None)
        if t == 90:
            self.running = False
        previous_rail = self.frames[-1]['rail_v'] if self.frames else 0.0
        self.waveform = [[ms, previous_rail, rail + (previous_rail - rail) * exp(-ms / 2)]
                         for ms in range(21)]
        devices = {name: {'bus': bus, 'load_a': load, 'powered': powered and name in enabled}
                   for name, (bus, load) in DEVICES.items()}
        devices.update({
            'battery': {'bus': 'DC supply', 'load_a': None, 'powered': True},
            'regulator': {'bus': 'DC supply', 'load_a': None, 'powered': True},
            'monitor': {'bus': 'Model taps', 'load_a': None, 'powered': True},
        })
        failed = set(enabled) if not powered else set()
        for row in reversed(self.transactions):
            if row['t_s'] != t:
                break
            if row['result'] != 'ok':
                failed.add(row['destination'] if row['bus'] == 'UART' else row['source'])
        for name, condition in (
            ('battery', 'battery' in fault), ('regulator', not powered),
            ('primary', watchdog), ('backup', 'backup' in fault),
            ('radio', 'radio' in fault), ('payload', payload == 'FAILED'),
        ):
            if condition:
                failed.add(name)
        for name, component in devices.items():
            if name in failed:
                component['health'] = 'FAILED'
            elif not component['powered']:
                component['health'] = 'OFF'
            elif name in ('sensor_a', 'sensor_b') and disagreement:
                component['health'] = 'WARNING'
            else:
                component['health'] = 'HEALTHY'
        previous_devices = self.frames[-1]['devices'] if self.frames else devices
        for name, component in devices.items():
            old, new = previous_devices[name]['health'], component['health']
            if old != new and ('FAILED' in (old, new) or 'WARNING' in (old, new)):
                self.event(f'{name}: {old} → {new}')
        self.frames.append({
            't_s': t, 'phase': phase, 'battery_v': terminal, 'rail_v': rail,
            'battery_a': battery_current, 'load_w': rail * current,
            'charge_pct': self.soc * 100, 'loss_w': losses, 'temperature_c': self.temperature,
            'controller': controller, 'watchdog_resets': self.resets, 'sensors': channels,
            'payload': payload, 'health': 'FAILED' if controller == 'none' else
                'DEGRADED' if fault or disagreement else 'NORMAL',
            'disagreement': disagreement, 'devices': devices,
            'radio_received': self.received, 'radio_dropped': self.dropped,
            'faults': sorted(fault), 'waveform': self.waveform,
            'orbital_reference': orbital, 'vectors': vectors,
            'orientation_rad': orientation if vectors.get('sensor_a') is not None else None,
            'mission_display': min(1, max(0, (t - 20) / 30)),
        })

    def command(self, command, value):
        if command == 'start':
            self.running = self.tick < 360
        elif command == 'pause':
            self.running = False
        elif command == 'reset':
            self.reset()
        elif command == 'step':
            if self.running:
                raise ValueError('Pause before stepping')
            self.step()
        elif command == 'speed' and type(value) is int and value in (1, 4, 16):
            self.speed = value
        elif command in ('inject', 'recover') and isinstance(value, str) and value in FAULTS:
            if command == 'inject':
                self.faults.add(value)
            else:
                self.faults.discard(value)
            self.event(f'{command.title()}: {FAULTS[value]}')
        else:
            raise ValueError('Invalid electronics laboratory command')

    def snapshot(self, recording=False):
        return {
            'state': self.frames[-1], 'running': self.running, 'speed': self.speed,
            'available_faults': FAULTS, 'active_faults': sorted(self.faults),
            'trajectory': self.trajectory,
            'sensor_specs': SENSOR_SPECS,
            'transactions': list(self.transactions) if recording else list(self.transactions)[-32:],
            'events': list(self.events)[-(150 if recording else 20):],
            'frames': list(self.frames) if recording else [
                {k: f[k] for k in ('t_s', 'rail_v', 'battery_v', 'battery_a', 'load_w', 'sensors', 'vectors')}
                for f in self.frames],
        }
