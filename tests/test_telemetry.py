import unittest
from orbit1.telemetry import parse_line
from orbit1.mock_stream import lines

class TelemetryTest(unittest.TestCase):
    def test_parse_mock(self):
        p=parse_line(next(iter(lines())))
        self.assertEqual(p.sim_alt_m,400000)
        self.assertEqual(p.mode,'SIM_ORBIT')
    def test_ignore_debug(self):
        self.assertIsNone(parse_line('*** Booting Zephyr ***'))
    def test_prefix(self):
        self.assertEqual(parse_line('[00:01:01] <inf> TELEM,1000,SIM_ORBIT,1,OK,0,400000,7669').sensor_seq,1)
    def test_bad_format(self):
        with self.assertRaises(ValueError): parse_line('TELEM,broken')
    def test_fault_scenario(self):
        p=[parse_line(x) for x in lines(30)]
        self.assertTrue(any(x.health=='DEGRADED' and x.fault_flags==1 for x in p))

if __name__=='__main__':unittest.main()
