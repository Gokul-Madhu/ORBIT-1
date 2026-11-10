"""Generate synthetic flight computer telemetry for viewer development."""
import argparse
import sys
import time


def lines(count=120):
    for n in range(count):
        # Deliberate sensor-stall exercise: every 30s a temporary dropout.
        seq = n - min(max(n%30 - 19, 0), 4)
        health = 'DEGRADED' if n % 30 in (22,23) else 'OK'
        flags = 1 if health == 'DEGRADED' else 0
        yield f'TELEM,{n*1000},SIM_ORBIT,{seq},{health},{flags},400000,7669'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--count',type=int,default=120)
    p.add_argument('--interval',type=float,default=0.25)
    a=p.parse_args()
    for line in lines(a.count):
        print(line,flush=True)
        time.sleep(max(0,a.interval))

if __name__ == '__main__':
    main()
