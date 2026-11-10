// Deterministic view interpolation; authoritative orbital state comes from Python.
export function interpolate(sample,elapsed,config){
 const t=sample.t_s+elapsed,mu=398600.4418,r=6378.137+config.altitude_km,e=config.eccentricity,a=r/(1-e),n=Math.sqrt(mu/a**3),m=(n*t)%(2*Math.PI);
 let E=m;for(let i=0;i<16;i++){const d=(E-e*Math.sin(E)-m)/(1-e*Math.cos(E));E-=d;if(Math.abs(d)<1e-13)break}
 const x=a*(Math.cos(E)-e),y=a*Math.sqrt(1-e*e)*Math.sin(E),inc=config.inclination_deg*Math.PI/180,node=config.raan_deg*Math.PI/180;
 return {...sample,t_s:t,position_eci_km:[x*Math.cos(node)-y*Math.cos(inc)*Math.sin(node),x*Math.sin(node)+y*Math.cos(inc)*Math.cos(node),y*Math.sin(inc)]};
}
export function validateSession(data){
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 if(data?.schema!=='orbit1-session-v1'||!data.config||!Array.isArray(data.trajectory)||!Array.isArray(data.frames)||!data.frames.length||data.frames.length>3600)throw Error('Unsupported or empty ORBIT-1 recording');
 const c=data.config;if(![c.altitude_km,c.eccentricity,c.inclination_deg,c.raan_deg].every(finite)||c.altitude_km<150||c.altitude_km>20000||c.eccentricity<0||c.eccentricity>.6||c.inclination_deg<0||c.inclination_deg>180||c.raan_deg<0||c.raan_deg>360)throw Error('Invalid recorded orbit');
 if(data.trajectory.length<2||data.trajectory.length>1000||data.trajectory.some(p=>!Array.isArray(p)||p.length!==3||!p.every(finite)))throw Error('Invalid recorded trajectory');
 let previous=-Infinity;
 for(const f of data.frames){const s=f?.simulation,q=f?.qemu;if(!finite(f.recorded_s)||f.recorded_s<previous||!s||!finite(s.t_s)||s.t_s<0||!Array.isArray(s.position_eci_km)||s.position_eci_km.length!==3||!s.position_eci_km.every(finite)||!Array.isArray(s.velocity_eci_kms)||s.velocity_eci_kms.length!==3||!s.velocity_eci_kms.every(finite)||![s.altitude_km,s.speed_kms,s.latitude_deg,s.longitude_deg,s.period_min,s.orbit_number,s.inclination_deg,s.speed].every(finite)||!['NOMINAL','DEGRADED'].includes(s.health)||!q||!['LIVE','STALE','NOT CONNECTED'].includes(q.status)||!finite(q.parser_errors)||(q.age_s!==null&&!finite(q.age_s)))throw Error('Invalid recorded frame');
  if(q.packet&&(!['OK','DEGRADED'].includes(q.packet.health)||!['uptime_ms','sensor_seq','fault_flags','sim_alt_m','sim_speed_mps'].every(k=>finite(q.packet[k])&&q.packet[k]>=0)))throw Error('Invalid recorded telemetry');previous=f.recorded_s;
 }
 if(data.events!==undefined&&(!Array.isArray(data.events)||data.events.length>1000||data.events.some(e=>!e||typeof e.at!=='string'||typeof e.message!=='string'||typeof e.level!=='string')))throw Error('Invalid recorded events');
 return data;
}
export function groundTrack(sample,config){
 const period=2*Math.PI*Math.sqrt(((6378.137+config.altitude_km)/(1-config.eccentricity))**3/398600.4418);
 return Array.from({length:91},(_,i)=>{const t=sample.t_s+i*period/90,p=interpolate(sample,t-sample.t_s,config).position_eci_km,r=Math.hypot(...p);return [((Math.atan2(p[1],p[0])-7.2921159e-5*t)*180/Math.PI+540)%360-180,Math.asin(p[2]/r)*180/Math.PI]});
}
export function clock(seconds){const s=Math.max(0,Math.floor(seconds));return 'T+'+[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(v=>String(v).padStart(2,'0')).join(':')}
export function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
