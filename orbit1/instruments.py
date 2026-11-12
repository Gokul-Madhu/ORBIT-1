"""Additional bench instruments and their prescribed signals."""
from math import cos, exp, hypot, sin


# Identifier: label, unit, display range, model, bus, nominal load in amps.
INSTRUMENTS = {
    'air_upper': ('Upper bay air temperature', '°C', '0–60', 'Illustrative bay air temperature', 'I²C', .003),
    'air_lower': ('Lower bay air temperature', '°C', '0–60', 'Illustrative bay air temperature', 'I²C', .003),
    'humidity_upper': ('Upper bay humidity', '% RH', '0–100', 'Prescribed humidity in the upper enclosure', 'I²C', .003),
    'humidity_lower': ('Lower bay humidity', '% RH', '0–100', 'Prescribed humidity in the lower enclosure', 'I²C', .003),
    'light_port': ('Port light sensor', '% ref.', '0–100', 'Synthetic illumination relative to the bench reference', 'I²C', .002),
    'light_starboard': ('Starboard light sensor', '% ref.', '0–100', 'Synthetic illumination relative to the bench reference', 'I²C', .002),
    'mag_upper': ('Upper magnetic field sensor', 'µT', '0–100', 'Prescribed field magnitude with no geographic field model', 'SPI', .004),
    'mag_lower': ('Lower magnetic field sensor', 'µT', '0–100', 'Prescribed field magnitude with illustrative local offset', 'SPI', .004),
    'shock_upper': ('Upper deck shock indicator', 'g peak', '0–12', 'Prescribed event peak envelope rather than sampled shock waveform', 'CAN', .004),
    'shock_lower': ('Lower deck shock indicator', 'g peak', '0–12', 'Prescribed event peak envelope rather than sampled shock waveform', 'CAN', .004),
    'gap_upper': ('Upper frame gap sensor', 'mm', '0–3', 'Illustrative change in a bench reference gap', 'CAN', .004),
    'gap_lower': ('Lower frame gap sensor', 'mm', '0–3', 'Illustrative change in a bench reference gap', 'CAN', .004),
    'temp_battery': ('Battery case temperature', '°C', '0–75', 'Host power-model temperature with an illustrative local offset', 'I²C', .003),
    'temp_regulator': ('Regulator case temperature', '°C', '0–75', 'Host power-model temperature with a modeled loss-dependent offset', 'I²C', .003),
    'temp_radio': ('Radio board temperature', '°C', '0–75', 'Host power-model temperature with an illustrative local offset', 'I²C', .003),
    'temp_payload': ('Payload board temperature', '°C', '0–75', 'Host power-model temperature plus a prescribed post-power-on rise', 'I²C', .003),
    'pressure_upper': ('Upper bay pressure', 'kPa', '0–105', 'Illustrative local offset from the prescribed chamber signal', 'I²C', .003),
    'pressure_lower': ('Lower bay pressure', 'kPa', '0–105', 'Illustrative local offset from the prescribed chamber signal', 'I²C', .003),
}

DIAGNOSTICS = {
    'supply_main': ('Main computer input voltage', 'V', '0–5', 'Shared rail at the main branch; branch voltage drop is unmodeled', 'I²C', .003),
    'supply_backup': ('Backup computer input voltage', 'V', '0–5', 'Shared rail at the backup branch; branch voltage drop is unmodeled', 'I²C', .003),
    'current_main': ('Main computer branch current', 'A', '0–0.20', 'Nominal main computer load in the host power model', 'I²C', .003),
    'current_backup': ('Backup computer branch current', 'A', '0–0.12', 'Nominal backup computer load in the host power model', 'I²C', .003),
    'loss_regulator': ('Regulator conversion loss', 'W', '0–2', 'Estimated power lost during conversion; excludes battery losses', 'I²C', .003),
    'usage_spi': ('SPI activity monitor', '% of tick', '0–100', 'Modeled attempted transfer time before diagnostic messages', 'I²C', .002),
    'usage_can': ('CAN activity monitor', '% of tick', '0–100', 'Modeled attempted transfer time before diagnostic messages', 'I²C', .002),
    'usage_i2c': ('I²C activity monitor', '% of tick', '0–100', 'Modeled attempted transfer time before diagnostic messages', 'I²C', .002),
    'usage_uart': ('UART activity monitor', '% of tick', '0–100', 'Modeled attempted transfer time before diagnostic messages', 'I²C', .002),
    'link_received': ('Ground link received counter', 'packets', 'Cumulative', 'Host-modeled successful radio deliveries since reset', 'I²C', .002),
    'link_dropped': ('Ground link dropped counter', 'packets', 'Cumulative', 'Host-modeled radio losses since reset; excludes UART failures', 'I²C', .002),
    'link_pending': ('Radio pending message indicator', 'packets', '0 or 1', 'Host-model radio queue depth after this tick', 'I²C', .002),
    'rail_margin': ('Shared rail voltage margin', 'V', 'Relative to 4.7 V', 'Rail voltage minus the modeled operating threshold', 'I²C', .002),
    'battery_sag': ('Battery voltage sag', 'V', '0–1', 'Difference between open-circuit and loaded battery voltage in the host model', 'I²C', .002),
    'battery_loss': ('Battery internal power loss', 'W', '0–2', 'Power dissipated in the modeled battery resistance', 'I²C', .002),
    'load_power': ('Shared rail load power', 'W', '0–10', 'Rail voltage times the modeled downstream load current', 'I²C', .002),
    'rail_adc': ('Rail voltage ADC code', 'code', '0–1023', 'Illustrative 10-bit conversion with a fixed 5 V reference', 'I²C', .002),
    'battery_charge': ('Battery charge remaining', '%', '0–100', 'State of charge from the modeled current draw', 'I²C', .002),
    'age_motion_a': ('Main motion sample age', 's', 'Since last accepted sample', 'Time since the main motion sensor last delivered a valid sample', 'I²C', .002),
    'age_motion_b': ('Backup motion sample age', 's', 'Since last accepted sample', 'Time since the backup motion sensor last delivered a valid sample', 'I²C', .002),
    'errors_spi': ('SPI failed transfers', 'attempts', 'Per tick', 'Failed SPI attempts in this simulation tick', 'I²C', .002),
    'errors_can': ('CAN failed transfers', 'attempts', 'Per tick', 'Failed CAN attempts in this simulation tick', 'I²C', .002),
    'errors_i2c': ('I²C failed transfers', 'attempts', 'Per tick', 'Failed I²C attempts before diagnostic messages in this tick', 'SPI', .002),
    'errors_uart': ('UART failed transfers', 'attempts', 'Per tick', 'Failed UART attempts in this simulation tick', 'I²C', .002),
    'delta_pressure': ('Bay pressure difference', 'kPa', 'Lower minus upper', 'Derived from the two delivered bay pressure samples', 'I²C', .002),
    'delta_air': ('Bay air temperature difference', '°C difference', 'Upper minus lower', 'Derived from the two delivered bay air temperature samples', 'I²C', .002),
    'residual_x': ('Motion sensor X disagreement', 'm/s²', 'A minus B', 'Difference between the two delivered X-axis readings', 'I²C', .002),
    'residual_y': ('Motion sensor Y disagreement', 'm/s²', 'A minus B', 'Difference between the two delivered Y-axis readings', 'I²C', .002),
    'residual_z': ('Motion sensor Z disagreement', 'm/s²', 'A minus B', 'Difference between the two delivered Z-axis readings', 'I²C', .002),
    'residual_total': ('Motion sensor total disagreement', 'm/s²', 'Vector magnitude', 'Magnitude of the difference between the two delivered motion vectors', 'I²C', .002),
    'delta_regulator': ('Regulator above local air', '°C difference', 'Regulator minus lower air', 'Derived from regulator case and lower bay air readings', 'I²C', .002),
    'delta_battery': ('Battery above local air', '°C difference', 'Battery minus lower air', 'Derived from battery case and lower bay air readings', 'I²C', .002),
    'delta_payload': ('Payload above local air', '°C difference', 'Payload minus upper air', 'Derived from payload board and upper bay air readings', 'I²C', .002),
    'delta_skin': ('Skin temperature difference', '°C difference', 'Upper minus lower', 'Derived from both delivered surface temperature readings', 'I²C', .002),
}


def comparison_readings(channels, vectors):
    pairs = {
        'delta_pressure': ('pressure_lower', 'pressure_upper'),
        'delta_air': ('air_upper', 'air_lower'),
        'delta_regulator': ('temp_regulator', 'air_lower'),
        'delta_battery': ('temp_battery', 'air_lower'),
        'delta_payload': ('temp_payload', 'air_upper'),
        'delta_skin': ('skin_upper', 'skin_lower'),
    }
    readings = {name: channels[first] - channels[second] for name, (first, second) in pairs.items()
                if channels.get(first) is not None and channels.get(second) is not None}
    first, second = vectors.get('sensor_a'), vectors.get('sensor_b')
    if first is not None and second is not None:
        residual = [a - b for a, b in zip(first, second)]
        readings.update({f'residual_{axis}': value for axis, value in zip('xyz', residual)})
        readings['residual_total'] = hypot(*residual)
    return readings


def auxiliary_readings(t, temperature, loss_w):
    elapsed = max(0, t - 20)
    warm = (1 - exp(-elapsed / 12)) * exp(-elapsed / 32)
    pulse = max(0, 1 - abs(t - 35) / 1.25)
    flex = (1 - exp(-elapsed / 3)) * exp(-elapsed / 13)
    orbital_time = max(0, t - 50)
    light = cos(orbital_time / 6)
    payload_warm = 1 - exp(-max(0, t - 55) / 9)
    return {
        'air_upper': 21 + 15 * warm,
        'air_lower': 22 + 10 * warm,
        'humidity_upper': 44 - 20 * warm,
        'humidity_lower': 51 - 12 * warm,
        'light_port': 50 + 45 * light,
        'light_starboard': 50 - 45 * light,
        'mag_upper': 43 + 4 * sin(t / 7),
        'mag_lower': 47 + 6 * sin(t / 7 + .4),
        'shock_upper': .04 + 3.2 * pulse,
        'shock_lower': .08 + 7.6 * pulse,
        'gap_upper': 1.15 + .23 * flex + .14 * pulse,
        'gap_lower': 1.25 + .46 * flex + .26 * pulse,
        'temp_battery': temperature + .8,
        'temp_regulator': temperature + 4 * loss_w,
        'temp_radio': temperature + 1.8,
        'temp_payload': temperature + 3.5 * payload_warm,
    }
