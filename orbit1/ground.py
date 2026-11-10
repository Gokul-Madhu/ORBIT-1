"""Ground monitor: run with --mock or --stdin; no flight control interfaces."""
import argparse
import queue
import subprocess
import sys
import threading
import time
from .telemetry import parse_line


def start_reader(stream, out):
    def worker():
        try:
            for line in stream:
                try:
                    packet=parse_line(line)
                except ValueError as e:
                    out.put(('error',str(e)))
                    continue
                if packet:
                    out.put(('packet',packet))
        finally:
            out.put(('closed',None))
    thread=threading.Thread(target=worker,daemon=True)
    thread.start()
    return thread


def console_run(stream):
    for line in stream:
        try:
            p=parse_line(line)
        except ValueError as e:
            print(f'Invalid telemetry: {e}', file=sys.stderr)
            continue
        if p:
            print(f'{p.uptime_ms/1000:6.1f}s  {p.mode:10s}  {p.health:8s}  '
                  f'seq={p.sensor_seq:4d}  h={p.sim_alt_m/1000:.1f} km  v={p.sim_speed_mps} m/s')


def gui_run(stream):
    try:
        import pygame
    except ImportError as exc:
        raise SystemExit('Install pygame with: python3 -m pip install pygame (or use --console)') from exc
    pygame.init()
    screen=pygame.display.set_mode((900,560),pygame.RESIZABLE)
    pygame.display.set_caption('ORBIT-1 R0.1 | Synthetic telemetry monitor')
    clock=pygame.time.Clock()
    title=pygame.font.SysFont('dejavusans',28,bold=True)
    font=pygame.font.SysFont('dejavusans',20)
    small=pygame.font.SysFont('dejavusans',15)
    packets=queue.Queue()
    start_reader(stream,packets)
    last=None; errors=[]; samples=[]; closed=False; wall_time=None
    running=True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT: running=False
        while not packets.empty():
            typ,v=packets.get_nowait()
            if typ=='packet':
                last=v;wall_time=time.monotonic();samples.append(v)
                samples=samples[-140:]
            elif typ=='error': errors.append(v);errors=errors[-3:]
            elif typ=='closed':closed=True
        width,height=screen.get_size()
        screen.fill((10,17,30))
        def draw(t,x,y,f=font,c=(224,236,250)):
            screen.blit(f.render(t,True,c),(x,y))
        draw('ORBIT-1 / FLIGHT COMPUTER MONITOR',24,22,title)
        draw('LAB SIMULATION ONLY  •  NOT FOR REAL FLIGHT',26,63,small,(247,175,86))
        pygame.draw.line(screen,(56,75,102),(25,98),(width-25,98),2)
        if last:
            age=time.monotonic()-wall_time
            link='STALE' if age>3 else 'RECEIVING'
            draw(f'Link: {link}'+(' (stream closed)' if closed else ''),25,117,c=(251,169,107) if age>3 else (122,225,169))
            draw(f'Health: {last.health}',25,168,title,c=(251,132,114) if last.health!='OK' else (122,225,169))
            draw(f'Elapsed: {last.uptime_ms/1000:.1f} s',25,228)
            draw(f'Sensor sequence: {last.sensor_seq}',25,267)
            draw(f'Simulated altitude: {last.sim_alt_m/1000:.1f} km',25,306)
            draw(f'Simulated speed: {last.sim_speed_mps:,} m/s',25,345)
            draw(f'Fault flags: 0x{last.fault_flags:02X}',25,384)
            # Graph records sensor sequence growth to highlight synthetic stalls.
            gx,gy=width//2,180;gw=max(60,width-gx-28);gh=200
            pygame.draw.rect(screen,(19,33,52),(gx,gy,gw,gh))
            draw('SENSOR SEQUENCE TREND',gx,148,small)
            if len(samples)>1:
                low=min(x.sensor_seq for x in samples); high=max(x.sensor_seq for x in samples)
                points=[(gx+int(i*(gw-10)/max(1,len(samples)-1))+5,
                         gy+gh-8-int((p.sensor_seq-low)/max(1,high-low)*(gh-16)))
                        for i,p in enumerate(samples)]
                if len(points)>1:pygame.draw.lines(screen,(96,200,246),False,points,2)
        else:
            draw('WAITING FOR TELEM CSV STREAM...',25,156,title,(251,187,116))
        draw('Source: '+('EOF' if closed else 'connected')+'  |  Press window X to exit',25,height-63,small,(149,167,190))
        if errors:draw('Last parser error: '+errors[-1][:90],25,height-37,small,(245,144,144))
        pygame.display.flip()
        clock.tick(30)
    pygame.quit()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--mock',action='store_true',help='Start synthetic local data generator')
    source.add_argument('--stdin',action='store_true',help='Read TELEM records from stdin')
    parser.add_argument('--console',action='store_true',help='No GUI required')
    args=parser.parse_args()
    proc=None
    if args.mock:
        proc=subprocess.Popen([sys.executable,'-m','orbit1.mock_stream'],stdout=subprocess.PIPE,
                              text=True,bufsize=1)
        stream=proc.stdout
    else:
        stream=sys.stdin
    try:
        (console_run if args.console else gui_run)(stream)
    finally:
        if proc and proc.poll() is None:
            proc.terminate()
            try:proc.wait(timeout=2)
            except subprocess.TimeoutExpired:proc.kill()

if __name__ == '__main__':
    main()
