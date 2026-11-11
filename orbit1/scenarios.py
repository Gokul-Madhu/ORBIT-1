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


def run_scenario(config):
    if not isinstance(config, dict):
        raise ValueError('Scenario must be an object')
    fault = config.get('fault')
    sensor = config.get('sensor')
    outcome = config.get('expect')
    injection = config.get('inject_s')
    recovery = config.get('recover_s')
    if not isinstance(fault, str) or fault not in FAULTS:
        raise ValueError('Select a supported fault')
    if not isinstance(sensor, str) or sensor not in SENSOR_SPECS:
        raise ValueError('Select a modeled sensor')
    if outcome not in OUTCOMES:
        raise ValueError('Select a supported expectation')
    for name, value in (('Injection', injection), ('Recovery', recovery)):
        if type(value) not in (int, float) or not 0.25 <= value <= 90 or value * 4 % 1:
            raise ValueError(f'{name} time must be a quarter-second step between 0.25 and 90 seconds')
    if injection >= recovery:
        raise ValueError('Recovery must come after injection')
    baseline, trial = ElectronicsLab(), ElectronicsLab()
    injection_tick, recovery_tick = int(injection * 4), int(recovery * 4)
    for tick in range(1, 361):
        if tick == injection_tick:
            trial.command('inject', fault)
        elif tick == recovery_tick:
            trial.command('recover', fault)
        baseline.step()
        trial.step()
    reference = baseline.snapshot(recording=True)
    experiment = trial.snapshot(recording=True)
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
