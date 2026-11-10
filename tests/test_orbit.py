import math
import unittest
from orbit1.orbit import MU,R_EARTH,circular_state,orbital_period,propagate

class OrbitTest(unittest.TestCase):
    def test_reference_speed_and_period(self):
        s=circular_state()
        self.assertAlmostEqual(s.speed,math.sqrt(MU/(R_EARTH+400_000)),places=6)
        self.assertTrue(5500 < orbital_period(s) < 5600)

    def test_energy_and_one_orbit_closure(self):
        s=circular_state()
        last=list(propagate(s,orbital_period(s),1))[-1]
        self.assertLess(abs(last.radius-s.radius),40)
        self.assertLess(abs(last.specific_energy/s.specific_energy-1),1e-5)
        self.assertLess(math.hypot(last.x-s.x,last.y-s.y),100)

    def test_reject_atmosphere(self):
        with self.assertRaises(ValueError):circular_state(90_000)

if __name__=='__main__':unittest.main()
