import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {clock,interpolate,validateSession,escapeHtml,groundTrack} from '../orbit1/web/model.js';
assert.equal(clock(3661),'T+01:01:01');assert.equal(escapeHtml('<script>'),'&lt;script&gt;');
const config={altitude_km:400,eccentricity:.2,inclination_deg:51.6,raan_deg:0};
const initial={t_s:0,position_eci_km:[6778.137,0,0]};
const p=interpolate(initial,0,config);assert.ok(Math.abs(p.position_eci_km[0]-6778.137)<1e-7);
const next=interpolate(initial,100,config);assert.notDeepEqual(next.position_eci_km,p.position_eci_km);
const period=2*Math.PI*Math.sqrt(((6378.137+config.altitude_km)/(1-config.eccentricity))**3/398600.4418);
assert.ok(Math.hypot(...interpolate(initial,period,config).position_eci_km.map((v,i)=>v-p.position_eci_km[i]))<1e-6);
const track=groundTrack(initial,config);assert.equal(track.length,91);assert.ok(track.every(([lo,la])=>Math.abs(lo)<=180&&Math.abs(la)<=90));
for(const bad of [null,{}, {schema:'orbit1-session-v1',config,trajectory:[],frames:[]}])assert.throws(()=>validateSession(bad));
const sample={t_s:0,position_eci_km:[6778.137,0,0],velocity_eci_kms:[0,4.7,6],altitude_km:400,speed_kms:7.669,latitude_deg:0,longitude_deg:0,period_min:92.56,orbit_number:1,inclination_deg:51.6,speed:30,running:false,fault:false,health:'NOMINAL'};
const session={schema:'orbit1-session-v1',config,trajectory:[sample.position_eci_km,next.position_eci_km],frames:[{recorded_s:1,simulation:sample,qemu:{status:'NOT CONNECTED',age_s:null,parser_errors:0,packet:null}}],events:[]};
assert.equal(validateSession(session),session);
for(const mutate of [s=>s.frames[0].simulation.velocity_eci_kms=[],s=>s.frames[0].simulation.t_s=NaN,s=>s.frames[0].qemu.status='FAKE',s=>s.config.eccentricity=.9,s=>s.events='bad',s=>s.trajectory[0][0]=Infinity]){const bad=structuredClone(session);mutate(bad);assert.throws(()=>validateSession(bad))}
fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/model-results.json',JSON.stringify({passed:true,timestamp:new Date().toISOString(),module_sha256:createHash('sha256').update(fs.readFileSync('orbit1/web/model.js')).digest('hex')}));
console.log('PASS: clock, escaping, Kepler interpolation, invalid replay rejection');
