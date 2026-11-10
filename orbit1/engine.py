"""Analytical Kepler orbit in ECI; ideal Earth, no atmosphere or control outputs."""
from dataclasses import dataclass, asdict
from math import asin, atan2, cos, degrees, isfinite, pi, radians, sin, sqrt
from .orbit import MU, R_EARTH

EARTH_RATE = 7.2921159e-5


@dataclass(frozen=True)
class Orbit:
    altitude_km: float = 400
    eccentricity: float = 0
    inclination_deg: float = 51.6
    raan_deg: float = 0

    def __post_init__(self):
        for value in asdict(self).values():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
                raise ValueError('Orbit parameters must be finite numbers')
        if not 150 <= self.altitude_km <= 20000:
            raise ValueError('Perigee altitude must be 150–20000 km')
        if not 0 <= self.eccentricity <= .6:
            raise ValueError('Eccentricity must be 0–0.6')
        if not 0 <= self.inclination_deg <= 180 or not 0 <= self.raan_deg <= 360:
            raise ValueError('Inclination must be 0–180°, RAAN 0–360°')

    @property
    def a(self):
        return (R_EARTH + self.altitude_km * 1000) / (1 - self.eccentricity)

    @property
    def period(self):
        return 2 * pi * sqrt(self.a**3 / MU)

    def sample(self, t):
        e = self.eccentricity
        n = sqrt(MU / self.a**3)
        mean = (n * t) % (2 * pi)
        eccentric = mean
        for _ in range(16):
            correction = (eccentric - e*sin(eccentric) - mean) / (1-e*cos(eccentric))
            eccentric -= correction
            if abs(correction) < 1e-13:
                break
        x, y = self.a*(cos(eccentric)-e), self.a*sqrt(1-e*e)*sin(eccentric)
        rate = n / (1-e*cos(eccentric))
        vx, vy = -self.a*sin(eccentric)*rate, self.a*sqrt(1-e*e)*cos(eccentric)*rate
        inc, node = radians(self.inclination_deg), radians(self.raan_deg)

        def rotate(u, v):
            return [u*cos(node)-v*cos(inc)*sin(node),
                    u*sin(node)+v*cos(inc)*cos(node), v*sin(inc)]

        position, velocity = rotate(x, y), rotate(vx, vy)
        radius = sqrt(sum(v*v for v in position))
        speed = sqrt(sum(v*v for v in velocity))
        longitude = (degrees(atan2(position[1], position[0])-EARTH_RATE*t)+180) % 360 - 180
        return {'t_s': round(t, 3), 'altitude_km': round((radius-R_EARTH)/1000, 3),
                'speed_kms': round(speed/1000, 5), 'period_min': round(self.period/60, 4),
                'inclination_deg': self.inclination_deg, 'eccentricity': e,
                'position_eci_km': [round(v/1000, 5) for v in position],
                'velocity_eci_kms': [round(v/1000, 7) for v in velocity],
                'latitude_deg': round(degrees(asin(position[2]/radius)), 4),
                'longitude_deg': round(longitude, 4), 'phase_deg': round(degrees(mean), 3),
                'orbit_number': int(t // self.period)+1,
                'specific_energy_jpkg': -MU/(2*self.a)}

    def trajectory(self, steps=180):
        return [self.sample(i*self.period/steps)['position_eci_km'] for i in range(steps+1)]

    def track(self, t, steps=90):
        points = [self.sample(t+i*self.period/steps) for i in range(steps+1)]
        return [[p['longitude_deg'], p['latitude_deg']] for p in points]
