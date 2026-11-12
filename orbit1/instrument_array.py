"""Addressable simulation points derived from pairs of recorded source readings."""
from .instruments import DIAGNOSTICS

FAMILIES = (
    ('TEMP', 'Temperature', '°C', 64, 'skin_upper', 'skin_lower'),
    ('STRAIN', 'Strain', 'µε', 60, 'strain_upper', 'strain_lower'),
    ('VIB', 'Vibration', 'm/s² RMS', 48, 'vibration_upper', 'vibration_lower'),
    ('SOUND', 'Sound', 'dB rel.', 32, 'sound_upper', 'sound_lower'),
    ('PRESS', 'Pressure', 'kPa', 32, 'pressure_upper', 'pressure_lower'),
    ('LIGHT', 'Light', '% ref.', 27, 'light_port', 'light_starboard'),
)


def array_manifest(specs):
    points = [
        {'id': f'BASE-{i:03}', 'name': spec[0], 'family': 'Existing sensors',
         'unit': spec[1], 'location': 'Existing equipment model', 'source': key}
        for i, (key, spec) in enumerate(((key, spec) for key, spec in specs.items()
                                         if key not in DIAGNOSTICS), start=1)
    ]
    for code, family, unit, count, first, second in FAMILIES:
        for index in range(count):
            weight = (index + 1) / (count + 1)
            if code == 'LIGHT':
                location = f'Outer-shell light station {index + 1:02} (left to right)'
            else:
                location = f'{["Upper", "Middle", "Lower"][min(2, int(weight * 3))]} section · station {index + 1:02}'
            points.append({
                'id': f'{code}-{index + 1:03}', 'name': f'{family} point {index + 1:02}',
                'family': family, 'unit': unit, 'location': location,
                'inputs': [first, second], 'weight': round(weight, 8),
            })
    return {'schema': 'orbit1-array-v1', 'points': points, 'diagnostic_count': len(DIAGNOSTICS)}
