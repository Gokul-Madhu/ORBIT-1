import unittest

from orbit1.scenarios import run_campaign, run_scenario


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

    def test_distributed_readings_share_frame_but_differ_by_location(self):
        self.config.update(sensor='strain_upper', expect='available')
        report = run_scenario(self.config)
        recording = report['baseline']
        initial = recording['frames'][0]['sensors']
        active = recording['frames'][100]['sensors']
        self.assertGreater(active['strain_lower'], active['strain_upper'])
        self.assertGreater(active['strain_upper'], initial['strain_upper'])
        self.assertGreater(active['vibration_lower'], active['vibration_upper'])
        self.assertGreater(active['skin_upper'], active['skin_lower'])
        packets = {row['source']: row for row in recording['transactions'] if row['t_s'] == 25}
        self.assertAlmostEqual(packets['strain_upper']['value'], active['strain_upper'], places=3)
        self.assertEqual(packets['vibration_lower']['bus'], 'CAN')
        self.assertTrue(all(check['passed'] for check in report['checks']))

    def test_rejects_unaligned_and_reversed_times(self):
        for changes in ({'inject_s': 25.1}, {'recover_s': 24}, {'sensor': 'missing'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                run_scenario({**self.config, **changes})

    def test_payload_branch_and_switch_record_their_own_channels(self):
        report = run_scenario(self.config)
        baseline = report['baseline']
        frames = baseline['frames']
        self.assertEqual(frames[0]['vectors']['payload_supply'], [0, 0])
        self.assertEqual(frames[220]['vectors']['payload_supply'], [5, .25])
        self.assertEqual(frames[239]['sensors']['payload_switch'], 0)
        self.assertEqual(frames[240]['sensors']['payload_switch'], 1)
        self.assertGreater(frames[100]['sensors']['heat_upper'], frames[100]['sensors']['heat_lower'])
        self.assertGreater(frames[100]['sensors']['sound_lower'], frames[100]['sensors']['sound_upper'])
        rows = [row for row in baseline['transactions'] if row['t_s'] == 55 and row['source'] == 'payload_supply']
        self.assertEqual([row['field'] for row in rows], ['voltage', 'current'])

    def test_auxiliary_instruments_capture_location_and_milestone_differences(self):
        report = run_scenario(self.config)
        frames = report['baseline']['frames']
        event = frames[140]['sensors']
        self.assertGreater(event['shock_lower'], event['shock_upper'])
        self.assertGreater(event['shock_upper'], frames[139]['sensors']['shock_upper'])
        self.assertGreater(event['gap_lower'], event['gap_upper'])
        self.assertNotEqual(event['humidity_upper'], event['humidity_lower'])
        self.assertNotEqual(frames[200]['sensors']['light_port'], frames[300]['sensors']['light_port'])
        self.assertGreater(frames[280]['sensors']['temp_payload'], frames[280]['sensors']['temperature'])
        self.assertEqual(report['baseline']['transactions'][0]['t_s'], 0)

    def test_diagnostic_readings_match_power_packets_and_ground_state(self):
        self.config.update(fault='radio', sensor='link_dropped', expect='available')
        report = run_scenario(self.config)
        baseline, trial = report['baseline'], report['trial']
        frame = trial['frames'][104]
        values = frame['sensors']
        self.assertEqual(values['supply_main'], frame['rail_v'])
        self.assertEqual(values['supply_backup'], frame['rail_v'])
        self.assertEqual(values['current_main'], .20)
        self.assertEqual(values['current_backup'], .12)
        self.assertGreater(values['loss_regulator'], 0)
        self.assertGreater(values['link_dropped'], baseline['frames'][104]['radio_dropped'])
        self.assertEqual(values['link_dropped'], frame['radio_dropped'])
        self.assertEqual(values['link_received'], frame['radio_received'])
        self.assertEqual(values['link_pending'], 1)
        from orbit1.instruments import DIAGNOSTICS
        packets = [row for row in trial['transactions'] if row['t_s'] == frame['t_s']
                   and row['source'] not in DIAGNOSTICS]
        expected = sum(row['wire_ms'] for row in packets if row['bus'] == 'I²C') / 2.5
        self.assertAlmostEqual(values['usage_i2c'], expected, places=4)

    def test_signal_age_and_errors_follow_fault_and_recovery(self):
        report = run_scenario(self.config)
        frames = report['trial']['frames']
        signals = frames[104]['sensors']
        self.assertEqual(signals['age_motion_a'], 1.25)
        self.assertEqual(signals['age_motion_b'], 0)
        self.assertEqual(signals['errors_spi'], 3)
        self.assertEqual(signals['errors_can'], 0)
        self.assertEqual(signals['rail_margin'], .3)
        self.assertEqual(signals['rail_adc'], 1023)
        self.assertAlmostEqual(signals['load_power'], frames[104]['load_w'], places=4)
        self.assertEqual(frames[120]['sensors']['age_motion_a'], 0)
        self.assertEqual(frames[120]['sensors']['errors_spi'], 0)
        self.assertEqual(report['trial']['transactions'][0]['t_s'], 0)

    def test_i2c_error_counter_remains_available_over_spi(self):
        self.config.update(fault='i2c', sensor='errors_i2c', expect='available')
        report = run_scenario(self.config)
        frame = report['trial']['frames'][100]
        self.assertGreater(frame['sensors']['errors_i2c'], 0)
        self.assertIsNone(frame['sensors']['rail_adc'])
        self.assertTrue(all(check['passed'] for check in report['checks']))

    def test_comparisons_use_delivered_readings_and_drop_missing_inputs(self):
        self.config.update(fault='disagreement', sensor='residual_total', expect='available')
        report = run_scenario(self.config)
        frame = report['trial']['frames'][104]
        values = frame['sensors']
        self.assertEqual(values['delta_pressure'], .4)
        self.assertAlmostEqual(values['delta_skin'], values['skin_upper'] - values['skin_lower'], places=4)
        self.assertAlmostEqual(values['residual_x'], frame['vectors']['sensor_a'][0] - frame['vectors']['sensor_b'][0], places=4)
        self.assertGreater(values['residual_total'], .45)
        self.assertTrue(all(check['passed'] for check in report['checks']))
        self.config.update(fault='imu', expect='unavailable')
        missing = run_scenario(self.config)
        self.assertNotIn('residual_total', missing['trial']['frames'][104]['sensors'])
        self.assertTrue(all(check['passed'] for check in missing['checks']))

    def test_overlapping_computer_faults_remove_controller_for_overlap_only(self):
        report = run_campaign({'schedule': [
            {'fault': 'watchdog', 'inject_s': 25, 'recover_s': 30},
            {'fault': 'backup', 'inject_s': 27, 'recover_s': 32},
        ]})
        self.assertEqual(report['metrics']['comparison']['no_controller_s'], 0)
        self.assertEqual(report['metrics']['trial']['no_controller_s'], 3)
        self.assertGreater(report['metrics']['trial']['missing_samples'], 0)
        self.assertEqual(report['metrics']['trial']['recovery_delay_s'], 0)
        trial = report['trial']['frames']
        self.assertEqual([trial[i]['controller'] for i in (100, 108, 119, 120)],
                         ['backup', 'none', 'none', 'primary'])

    def test_campaign_rejects_duplicates_and_invalid_windows(self):
        item = {'fault': 'watchdog', 'inject_s': 25, 'recover_s': 30}
        for schedule in ([item], [item, item], [item, {'fault': [], 'inject_s': 27, 'recover_s': 29}],
                         [item, {'fault': 'backup', 'inject_s': 27.1, 'recover_s': 32}]):
            with self.subTest(schedule=schedule), self.assertRaises(ValueError):
                run_campaign({'schedule': schedule})
