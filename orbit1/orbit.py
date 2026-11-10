"""Two-body Earth orbit reference model (NOT a launch trajectory or guidance model)."""
from dataclasses import dataclass
from math import sqrt, pi
import csv
import argparse

MU = 3.986004418e14  # m^3/s^2, Earth gravitational parameter
R_EARTH = 6378137.0 # m, WGS84 equatorial radius

@dataclass(frozen=True)
class State:
    t: float
    x: float
    y: float
    vx: float
    vy: float

    @property
    def radius(self):
        return sqrt(self.x*self.x + self.y*self.y)

    @property
    def altitude(self):
        return self.radius - R_EARTH

    @property
    def speed(self):
        return sqrt(self.vx*self.vx + self.vy*self.vy)

    @property
    def specific_energy(self):
        return 0.5*self.speed**2 - MU/self.radius


def acceleration(x, y):
    radius = sqrt(x*x + y*y)
    if radius <= R_EARTH / 2:
        raise ValueError('State radius is physically invalid for this model')
    factor = -MU/(radius**3)
    return factor*x, factor*y


def circular_state(altitude_m=400_000.0):
    if altitude_m < 100_000:
        raise ValueError('This reference model is intended for space orbits, not atmospheric flight')
    r = R_EARTH + altitude_m
    return State(0., r, 0., 0., sqrt(MU/r))


def orbital_period(state):
    # Only for bound Keplerian orbits.
    a = -MU / (2*state.specific_energy)
    if a <= 0:
        raise ValueError('Orbit is not bound')
    return 2*pi*sqrt(a**3/MU)


def propagate(initial, duration_s, dt_s=5.0):
    """Velocity-Verlet symplectic integration. Does not represent atmospheric ascent."""
    if dt_s <= 0 or duration_s < 0:
        raise ValueError('Expected dt > 0 and duration >= 0')
    state = initial
    yield state
    while state.t < duration_s - 1e-9:
        step = min(dt_s, duration_s - state.t)
        ax, ay = acceleration(state.x, state.y)
        nx = state.x + state.vx*step + 0.5*ax*step*step
        ny = state.y + state.vy*step + 0.5*ay*step*step
        nax, nay = acceleration(nx, ny)
        state = State(state.t+step, nx, ny,
                      state.vx+0.5*(ax+nax)*step,
                      state.vy+0.5*(ay+nay)*step)
        yield state


def write_csv(path, states):
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow(['t_s','x_m','y_m','vx_mps','vy_mps','altitude_m','speed_mps','specific_energy_jpkg'])
        for s in states:
            writer.writerow([f'{v:.6f}' for v in (s.t,s.x,s.y,s.vx,s.vy,s.altitude,s.speed,s.specific_energy)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--altitude-km', type=float, default=400.0)
    parser.add_argument('--orbits', type=float, default=1.0)
    parser.add_argument('--step', type=float, default=5.0, help='Integration time step in seconds')
    parser.add_argument('--output', default='orbit.csv')
    args = parser.parse_args()
    if not 0 < args.orbits <= 100:
        parser.error('--orbits must be between 0 and 100')
    s = circular_state(args.altitude_km*1000)
    period = orbital_period(s)
    samples = list(propagate(s, period*args.orbits, args.step))
    write_csv(args.output, samples)
    error = abs(samples[-1].specific_energy/s.specific_energy-1)*100
    print(f'ORBIT-1 | h={args.altitude_km:.1f} km | v={s.speed:.2f} m/s | period={period/60:.2f} min')
    print(f'Saved {len(samples)} states to {args.output} | relative energy drift {error:.6f}%')

if __name__ == '__main__':
    main()
