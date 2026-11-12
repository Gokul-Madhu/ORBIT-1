import unittest

from orbit1.instrument_array import array_manifest
from orbit1.lab import SENSOR_SPECS


class InstrumentArrayTests(unittest.TestCase):
    def test_manifest_has_300_unique_points_and_valid_sources(self):
        manifest = array_manifest(SENSOR_SPECS)
        points = manifest['points']
        self.assertEqual(len(points), 300)
        self.assertEqual(len({point['id'] for point in points}), 300)
        self.assertEqual(sum('source' in point for point in points), 37)
        self.assertEqual(manifest['diagnostic_count'], 34)
        for point in points:
            if 'source' in point:
                self.assertIn(point['source'], SENSOR_SPECS)
            else:
                self.assertTrue(all(source in SENSOR_SPECS for source in point['inputs']))
                self.assertTrue(0 < point['weight'] < 1)
        self.assertEqual(manifest, array_manifest(SENSOR_SPECS))
