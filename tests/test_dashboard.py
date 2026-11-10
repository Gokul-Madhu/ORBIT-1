import json
import math
import threading
import tempfile
import time
from pathlib import Path
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from orbit1.dashboard import Mission, make_handler, orbital_sample, ground_track, PERIOD_S


class DashboardModelTests(unittest.TestCase):
    def test_simulation_clock_survives_polling_gap(self):
        with patch('orbit1.dashboard.time.monotonic', return_value=100) as clock:
            mission = Mission(run_tests=False)
            mission.command({'command': 'start'})
            clock.return_value = 110
            self.assertEqual(mission.snapshot()['simulation']['t_s'], 300)
            mission.command({'command': 'pause'})
            clock.return_value = 130
            self.assertEqual(mission.snapshot()['simulation']['t_s'], 300)

    def test_command_rejects_non_object_json(self):
        mission = Mission(run_tests=False)
        for payload in (None, [], 'start', 42):
            with self.assertRaisesRegex(ValueError, 'JSON object'):
                mission.command(payload)

    def test_circular_orbit(self):
        first = orbital_sample(0)
        self.assertAlmostEqual(first['altitude_km'], 400, places=3)
        self.assertAlmostEqual(first['speed_kms'], 7.6686, delta=.004)
        self.assertAlmostEqual(first['latitude_deg'], 0, places=2)

    def test_periodic_inertial_position(self):
        a = orbital_sample(0)
        b = orbital_sample(PERIOD_S)
        for x, y in zip(a['position_eci_km'], b['position_eci_km']):
            self.assertAlmostEqual(x, y, delta=.05)

    def test_ground_track_valid(self):
        t = ground_track(100)
        self.assertEqual(len(t), 56)
        self.assertTrue(all(-180 <= lo <= 180 and -90 <= la <= 90 for lo,la in t))

    def test_start_pause_reset_and_fault(self):
        mission = Mission(run_tests=False)
        mission.command({'command':'start'})
        self.assertTrue(mission.snapshot()['simulation']['running'])
        mission.command({'command':'inject_fault'})
        self.assertEqual(mission.snapshot()['simulation']['health'], 'DEGRADED')
        mission.command({'command':'clear_fault'})
        self.assertEqual(mission.snapshot()['simulation']['health'], 'NOMINAL')
        mission.command({'command':'pause'})
        mission.command({'command':'reset'})
        self.assertFalse(mission.snapshot()['simulation']['running'])
        self.assertEqual(mission.snapshot()['simulation']['t_s'], 0)

    def test_speed_validation(self):
        mission = Mission(run_tests=False)
        for x in ('bad', 3, 1000000, None):
            with self.assertRaises(ValueError):
                mission.command({'command':'speed', 'value':x})
        mission.command({'command':'speed', 'value':60})
        self.assertEqual(mission.snapshot()['simulation']['speed'], 60)

    def test_qemu_not_connected_by_default(self):
        self.assertEqual(Mission(run_tests=False).snapshot()['qemu']['status'], 'NOT CONNECTED')

    def test_qemu_log_receives_only_new_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / 'qemu.log'
            log.write_text('TELEM,1000,SIM_ORBIT,1,OK,0,400000,7669\n')
            mission = Mission(qemu_log=str(log), run_tests=False)
            self.addCleanup(mission.close)
            self.assertTrue(mission._tail_ready.wait(2))
            self.assertEqual(mission.snapshot()['qemu']['status'], 'NOT CONNECTED')
            with log.open('a') as out:
                out.write('TELEM,2000,SIM_ORBIT,2,DEGRADED,1,400000,7669\n')
                out.flush()
            for i in range(20):
                if mission.snapshot()['qemu']['status'] == 'LIVE':
                    break
                time.sleep(.1)
            self.assertEqual(mission.snapshot()['qemu']['status'], 'LIVE')
            self.assertEqual(mission.snapshot()['qemu']['packet']['health'], 'DEGRADED')
            with log.open('a') as out:
                out.write('TELEM,3000,SIM_ORBIT,3,OK,0,')
            time.sleep(.4)
            self.assertEqual(mission.snapshot()['qemu']['parser_errors'], 0)
            self.assertEqual(mission.snapshot()['qemu']['packet']['sensor_seq'], 2)
            with log.open('a') as out:
                out.write('400000,7669\n')
            for _ in range(20):
                if mission.snapshot()['qemu']['packet']['sensor_seq'] == 3:
                    break
                time.sleep(.1)
            self.assertEqual(mission.snapshot()['qemu']['packet']['sensor_seq'], 3)
            self.assertEqual(mission.snapshot()['qemu']['parser_errors'], 0)

    def test_log_rotation_reads_new_file_from_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp)/'qemu.log'
            log.write_text('old output\n')
            mission = Mission(str(log), run_tests=False)
            self.addCleanup(mission.close)
            self.assertTrue(mission._tail_ready.wait(2))
            log.rename(Path(tmp)/'old.log')
            log.write_text('TELEM,1000,SIM_ORBIT,1,OK,0,400000,7669\n')
            for _ in range(30):
                if mission.snapshot()['qemu']['received']:
                    break
                time.sleep(.1)
            self.assertEqual(mission.snapshot()['qemu']['received'], 1)
            mission.close()

    def test_server_endpoints(self):
        server = ThreadingHTTPServer(('127.0.0.1',0),make_handler(Mission(run_tests=False)))
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        host = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(host+'/api/status',timeout=3) as r:
                data=json.load(r)
            self.assertIn('simulation',data)
            self.assertIn('progress',data)
            with urlopen(host+'/',timeout=3) as r:
                self.assertIn(b'MISSION CONTROL',r.read())
            req=Request(host+'/api/command', data=b'{"command":"start"}',headers={'Content-Type':'application/json'},method='POST')
            with urlopen(req,timeout=3) as r:
                self.assertEqual(json.load(r),{'ok':True})
            with urlopen(host+'/api/status',timeout=3) as r:
                self.assertTrue(json.load(r)['simulation']['running'])
            with urlopen(host+'/main.js',timeout=3) as r:
                self.assertIn('javascript', r.headers['Content-Type'])
            with urlopen(host+'/api/session',timeout=3) as r:
                self.assertEqual(json.load(r)['schema'], 'orbit1-session-v1')
            for payload, origin, code in ((b'[]', None, 400), (b'{"command":"bad"}', None, 400),
                                          (b'{"command":"start"}', 'https://example.com', 403)):
                headers={'Content-Type':'application/json'}
                if origin:
                    headers['Origin'] = origin
                request=Request(host+'/api/command',data=payload,headers=headers,method='POST')
                with self.assertRaises(HTTPError) as raised:
                    urlopen(request,timeout=3)
                self.assertEqual(raised.exception.code, code)
            with self.assertRaises(HTTPError) as raised:
                urlopen(host+'/../README.md',timeout=3)
            self.assertEqual(raised.exception.code, 404)
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
