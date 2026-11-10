import math
import unittest
from orbit1.engine import Orbit
from orbit1.orbit import MU, R_EARTH
from orbit1.dashboard import Mission


class KeplerTests(unittest.TestCase):
    def test_elliptical_perigee_apogee_and_closure(self):
        orbit = Orbit(400, .2, 63, 32)
        perigee, apogee = orbit.sample(0), orbit.sample(orbit.period/2)
        self.assertAlmostEqual(perigee['altitude_km'], 400, places=3)
        self.assertAlmostEqual(apogee['altitude_km'], (orbit.a*1.2-R_EARTH)/1000, places=3)
        self.assertGreater(perigee['speed_kms'], apogee['speed_kms'])
        self.assertEqual(perigee['position_eci_km'], orbit.sample(orbit.period)['position_eci_km'])

    def test_energy_and_angular_momentum_conserved(self):
        orbit = Orbit(500, .4, 110, 250)
        momenta = []
        for i in range(101):
            sample = orbit.sample(orbit.period*i/100)
            r = [v*1000 for v in sample['position_eci_km']]
            v = [v*1000 for v in sample['velocity_eci_kms']]
            radius = math.sqrt(sum(x*x for x in r))
            energy = sum(x*x for x in v)/2-MU/radius
            self.assertAlmostEqual(energy, -MU/(2*orbit.a), delta=2)
            cross = [r[1]*v[2]-r[2]*v[1], r[2]*v[0]-r[0]*v[2], r[0]*v[1]-r[1]*v[0]]
            momenta.append(math.sqrt(sum(x*x for x in cross)))
        self.assertLess((max(momenta)-min(momenta))/momenta[0], 1e-6)

    def test_invalid_orbits(self):
        for kwargs in ({'altitude_km': 0}, {'eccentricity': .9}, {'inclination_deg': 181},
                       {'raan_deg': -1}, {'altitude_km': float('nan')}, {'eccentricity': True}):
            with self.assertRaises(ValueError):
                Orbit(**kwargs)

    def test_configuration_and_recording(self):
        mission = Mission(run_tests=False)
        mission.command({'command': 'configure', 'value': {'eccentricity': .2}})
        snapshot = mission.snapshot()
        self.assertEqual(snapshot['config']['eccentricity'], .2)
        self.assertEqual(len(snapshot['trajectory']), 181)
        mission.last_record_wall = 0
        mission.snapshot()
        session = mission.session()
        self.assertEqual(session['schema'], 'orbit1-session-v1')
        self.assertGreater(len(session['frames']), 0)
        self.assertIn('qemu', session['frames'][0])
        with self.assertRaises(ValueError):
            mission.command({'command': 'configure', 'value': {'bad': 1}})

    def test_ingestion_health_recovery_and_restart(self):
        mission = Mission(run_tests=False)
        for line in ('TELEM,1000,SIM_ORBIT,1,OK,0,400000,7669',
                     'TELEM,2000,SIM_ORBIT,1,DEGRADED,1,400000,7669',
                     'TELEM,3000,SIM_ORBIT,2,OK,0,400000,7669',
                     'TELEM,0,SIM_ORBIT,1,OK,0,400000,7669', 'TELEM,broken'):
            mission.ingest(line)
        qemu = mission.snapshot()['qemu']
        self.assertEqual(qemu['received'], 4)
        self.assertEqual(qemu['restarts'], 1)
        self.assertEqual(qemu['parser_errors'], 1)
        self.assertTrue(any('DEGRADED' in e['message'] for e in mission.events))

    def test_worker_stops_cleanly(self):
        mission = Mission(run_tests=False)
        mission.start()
        mission.close()
        self.assertFalse(mission._worker.is_alive())
