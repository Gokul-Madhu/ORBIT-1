from binascii import crc_hqx
import unittest

from orbit1.lab import ElectronicsLab, FAULTS, PHASES


class ElectronicsLabTests(unittest.TestCase):
    def test_complete_reference_and_deterministic_replay(self):
        first, second = ElectronicsLab(), ElectronicsLab()
        for _ in range(360):
            first.step()
            second.step()
        recording = first.snapshot(recording=True)
        self.assertEqual(recording, second.snapshot(recording=True))
        self.assertEqual(len(recording['frames']), 361)
        self.assertEqual({f['phase'] for f in recording['frames']}, {label for _, label in PHASES})
        final = recording['state']
        self.assertEqual(final['phase'], 'Complete')
        self.assertEqual(final['payload'], 'OPERATING')
        self.assertAlmostEqual(final['orbital_reference']['altitude_km'], 400)
        self.assertIsNone(recording['frames'][199]['orbital_reference'])
        self.assertFalse(recording['frames'][140]['devices']['checkout_load']['powered'])
        self.assertLess(recording['frames'][140]['sensors']['pressure'], 101.3)
        self.assertLess(final['charge_pct'], 100)

    def test_packet_crc_and_power_to_waveform(self):
        lab = ElectronicsLab()
        packet = lab.transactions[0]
        self.assertEqual(crc_hqx(bytes.fromhex(packet['hex']), 0xffff), int(packet['crc16'], 16))
        lab.command('inject', 'regulator')
        lab.step()
        frame = lab.frames[-1]
        self.assertEqual(frame['waveform'][0], [0, 5, 5])
        self.assertAlmostEqual(frame['waveform'][-1][2], frame['rail_v'], places=3)
        self.assertFalse(frame['devices']['sensor_a']['powered'])

    def test_fault_propagation_and_recovery(self):
        outcomes = {
            'battery': lambda f: f['rail_v'] < 4.7 and not f['sensors'],
            'regulator': lambda f: f['controller'] == 'none',
            'imu': lambda f: f['sensors']['sensor_a'] is None,
            'disagreement': lambda f: f['disagreement'],
            'i2c': lambda f: f['sensors']['temperature'] is None,
            'spi': lambda f: f['sensors']['sensor_a'] is None,
            'uart': lambda f: f['radio_received'] == 1,
            'can': lambda f: f['sensors']['sensor_b'] is None,
            'watchdog': lambda f: f['controller'] == 'backup' and f['watchdog_resets'] == 1,
            'backup': lambda f: f['controller'] == 'primary' and f['health'] == 'DEGRADED',
            'radio': lambda f: f['radio_dropped'] == 2,
            'thermal': lambda f: f['disagreement'],
            'payload': lambda f: f['payload'] == 'FAILED',
            'gyro': lambda f: f['vectors']['gyro'] is None,
            'gnss': lambda f: f['vectors']['gnss'] is None,
            'temperature': lambda f: f['sensors']['temperature'] is None,
        }
        self.assertEqual(set(outcomes), set(FAULTS))
        for key, check in outcomes.items():
            with self.subTest(fault=key):
                lab = ElectronicsLab()
                if key in ('payload', 'gnss'):
                    for _ in range(220):
                        lab.step()
                lab.command('inject', key)
                lab.step()
                lab.step()
                self.assertTrue(check(lab.frames[-1]), lab.frames[-1])
                lab.command('recover', key)
                lab.step()
                self.assertEqual(lab.frames[-1]['health'], 'NORMAL')
                self.assertEqual(lab.frames[-1]['controller'], 'primary')

    def test_sensor_fault_marks_only_source_and_preserves_receiver(self):
        lab = ElectronicsLab()
        lab.command('inject', 'imu')
        lab.step()
        frame = lab.frames[-1]
        self.assertEqual(frame['devices']['sensor_a']['health'], 'FAILED')
        self.assertEqual(frame['devices']['primary']['health'], 'HEALTHY')
        self.assertEqual(frame['devices']['sensor_b']['health'], 'HEALTHY')
        self.assertIsNone(frame['orientation_rad'])
        attempts = [p for p in lab.transactions if p['t_s'] == frame['t_s'] and p['source'] == 'sensor_a']
        self.assertEqual(len(attempts), 3)
        self.assertTrue(all(p['result'] == 'timeout' and p['value'] is None for p in attempts))
        lab.command('recover', 'imu')
        lab.step()
        self.assertEqual(lab.frames[-1]['devices']['sensor_a']['health'], 'HEALTHY')
        self.assertIsNotNone(lab.frames[-1]['orientation_rad'])

    def test_clock_starts_pauses_steps_and_resets(self):
        lab = ElectronicsLab()
        wall = lab.wall
        lab.command('speed', 4)
        lab.command('start', None)
        lab.advance(wall + 0.5)
        self.assertEqual(lab.frames[-1]['t_s'], 2)
        with self.assertRaises(ValueError):
            lab.command('step', None)
        lab.command('pause', None)
        lab.advance(wall + 1)
        self.assertEqual(lab.frames[-1]['t_s'], 2)
        lab.command('step', None)
        self.assertEqual(lab.frames[-1]['t_s'], 2.25)
        lab.command('reset', None)
        self.assertEqual(lab.frames[-1]['t_s'], 0)
