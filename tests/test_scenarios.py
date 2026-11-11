import unittest

from orbit1.scenarios import run_scenario


class ScenarioTests(unittest.TestCase):
    def setUp(self):
        self.config = {'fault': 'imu', 'sensor': 'sensor_a', 'expect': 'unavailable',
                       'inject_s': 25, 'recover_s': 30}

    def test_isolated_timeout_and_recovery(self):
        report = run_scenario(self.config)
        self.assertTrue(all(check['passed'] for check in report['checks']))
        baseline = report['baseline']['frames']
        trial = report['trial']['frames']
        self.assertEqual(baseline[:100], trial[:100])
        self.assertEqual(trial[100]['rail_v'], baseline[100]['rail_v'])
        self.assertIsNone(trial[100]['vectors']['sensor_a'])
        self.assertIsNotNone(trial[100]['vectors']['sensor_b'])
        self.assertIsNotNone(trial[120]['vectors']['sensor_a'])

    def test_failed_expectation_points_to_first_frame(self):
        self.config['expect'] = 'available'
        report = run_scenario(self.config)
        self.assertFalse(report['checks'][0]['passed'])
        self.assertEqual(report['checks'][0]['frame'], 100)

    def test_brownout_changes_multiple_sensors(self):
        self.config['fault'] = 'regulator'
        report = run_scenario(self.config)
        trial = report['trial']['frames'][100]
        self.assertLess(trial['rail_v'], 4.7)
        self.assertEqual(trial['devices']['sensor_a']['health'], 'FAILED')
        self.assertEqual(trial['devices']['sensor_b']['health'], 'FAILED')
        self.assertTrue(all(check['passed'] for check in report['checks']))

    def test_rejects_unaligned_and_reversed_times(self):
        for changes in ({'inject_s': 25.1}, {'recover_s': 24}, {'sensor': 'missing'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                run_scenario({**self.config, **changes})
