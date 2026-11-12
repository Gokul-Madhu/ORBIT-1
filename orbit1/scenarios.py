"""Repeatable host simulation experiments with frame-level assertions."""
import argparse
import hashlib
import json
from pathlib import Path

from .lab import ElectronicsLab, FAULTS, SENSOR_SPECS

OUTCOMES = ('unavailable', 'available', 'failed', 'healthy', 'rail below threshold', 'rail nominal')


def measurement(frame, sensor):
    if sensor == 'monitor':
        return [frame['battery_v'], frame['rail_v'], frame['battery_a']]
    return frame['vectors'].get(sensor, frame['sensors'].get(sensor))


def satisfies(frame, sensor, outcome):
    if outcome == 'unavailable':
        return measurement(frame, sensor) is None
    if outcome == 'available':
        return measurement(frame, sensor) is not None
    if outcome == 'failed':
        return frame['devices'][sensor]['health'] == 'FAILED'
    if outcome == 'healthy':
        return frame['devices'][sensor]['health'] == 'HEALTHY'
    if outcome == 'rail below threshold':
        return frame['rail_v'] < 4.7
    return frame['rail_v'] >= 4.7


def fault_window(config):
    if not isinstance(config, dict) or not isinstance(config.get('fault'), str) or config['fault'] not in FAULTS:
        raise ValueError('Select a supported fault')
    injection = config.get('inject_s')
    recovery = config.get('recover_s')
    for name, value in (('Injection', injection), ('Recovery', recovery)):
        if type(value) not in (int, float) or not 0.25 <= value <= 90 or value * 4 % 1:
            raise ValueError(f'{name} time must be a quarter-second step between 0.25 and 90 seconds')
    if injection >= recovery:
        raise ValueError('Recovery must come after injection')
    return int(injection * 4), int(recovery * 4)


def record_schedule(schedule):
    lab = ElectronicsLab()
    for tick in range(1, 361):
        for fault, start, end in schedule:
            if tick == start:
                lab.command('inject', fault)
            elif tick == end:
                lab.command('recover', fault)
        lab.step()
    return lab.snapshot(recording=True)


def run_campaign(config):
    schedule = config.get('schedule') if isinstance(config, dict) else None
    if not isinstance(schedule, list) or not 2 <= len(schedule) <= 4:
        raise ValueError('Schedule two to four distinct faults')
    windows = []
    for item in schedule:
        start, end = fault_window(item)
        windows.append((item['fault'], start, end))
    if len({fault for fault, _, _ in windows}) != len(windows):
        raise ValueError('Schedule each fault at most once')
    start = min(item[1] for item in windows)
    end = max(item[2] for item in windows)
    baseline = record_schedule([])
    comparison = record_schedule(windows[:1])
    trial = record_schedule(windows)

    def summarize(recording):
        frames = recording['frames']
        expected = baseline['frames']
        def unavailable(index):
            return sum(measurement(expected[index], sensor) is not None
                       and measurement(frames[index], sensor) is None for sensor in SENSOR_SPECS)
        def restored(index):
            return frames[index]['controller'] == expected[index]['controller'] and unavailable(index) == 0
        restored_at = next((index for index in range(end, len(frames)) if restored(index)), None)
        return {
            'no_controller_s': sum(frame['controller'] == 'none' for frame in frames[start:end]) / 4,
            'missing_samples': sum(unavailable(index) for index in range(start, end)),
            'restored_at_s': None if restored_at is None else restored_at / 4,
            'recovery_delay_s': None if restored_at is None else (restored_at - end) / 4,
        }
    return {'schema': 'orbit1-campaign-v1', 'seed': 42, 'schedule': schedule,
            'window_s': [start / 4, end / 4],
            'metrics': {'comparison': summarize(comparison), 'trial': summarize(trial)},
            'comparison': comparison, 'trial': trial}


def run_scenario(config):
    if not isinstance(config, dict):
        raise ValueError('Scenario must be an object')
    fault = config.get('fault')
    sensor = config.get('sensor')
    outcome = config.get('expect')
    if not isinstance(fault, str) or fault not in FAULTS:
        raise ValueError('Select a supported fault')
    if not isinstance(sensor, str) or sensor not in SENSOR_SPECS:
        raise ValueError('Select a modeled sensor')
    if outcome not in OUTCOMES:
        raise ValueError('Select a supported expectation')
    injection_tick, recovery_tick = fault_window(config)
    reference = record_schedule([])
    experiment = record_schedule([(fault, injection_tick, recovery_tick)])
    failed_tick = next((i for i in range(injection_tick, recovery_tick)
                        if not satisfies(experiment['frames'][i], sensor, outcome)), None)
    recovery_frame = experiment['frames'][recovery_tick]
    reference_frame = reference['frames'][recovery_tick]
    checks = [
        {'label': f'{sensor}: {outcome} throughout the fault window', 'passed': failed_tick is None,
         'frame': failed_tick if failed_tick is not None else injection_tick},
        {'label': f'{sensor}: health and availability return to the baseline at recovery',
         'passed': recovery_frame['devices'][sensor]['health'] == reference_frame['devices'][sensor]['health']
         and (measurement(recovery_frame, sensor) is None) == (measurement(reference_frame, sensor) is None),
         'frame': recovery_tick},
    ]
    model_hash = hashlib.sha256(Path(__file__).with_name('lab.py').read_bytes()).hexdigest()
    return {'schema': 'orbit1-scenario-v1', 'source': 'Deterministic host simulation', 'seed': 42,
            'model_sha256': model_hash, 'scenario': config, 'checks': checks,
            'baseline': reference, 'trial': experiment}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scenario', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = run_scenario(json.loads(args.scenario.read_text(encoding='utf-8-sig')))
    args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    return 0 if all(check['passed'] for check in result['checks']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
