import {clock,escapeHtml as esc,interpolate,validateSession,groundTrack} from './model.js';
import {continents} from './geo.js';
const $=id=>document.getElementById(id);
const set=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value};
let scene=null,live=null,view=null,receivedAt=0,online=false,busy=false,replay=null,index=0,playing=false,playAt=null;
const controls=['start-btn','pause-btn','reset-btn','fault-btn','clear-btn','speed','apply-orbit'];
const diagnostics={renderer:'initializing',frames:0,mode:'live',lastError:null};
window.orbitDiagnostics=diagnostics;
function notice(message){$('notice').hidden=!message;set('notice',message||'')}
function fit(id){
 const canvas=$(id),r=canvas.getBoundingClientRect();if(r.width<1||r.height<1)return null;
 const d=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*d),h=Math.round(r.height*d);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return {ctx,w:r.width,h:r.height};
}
function chart(id,data,key,xKey,color='#69e8da',fixed=null){
 const r=fit(id);if(!r)return;const {ctx,w,h}=r;ctx.clearRect(0,0,w,h);
 const left=48,top=18,width=w-65,height=h-42,values=data.map(p=>p[key]).filter(Number.isFinite);
 if(!values.length){ctx.fillStyle='#6c8b9f';ctx.font='11px Segoe UI';ctx.fillText('Waiting for recorded samples',left,h/2);return}
 let min=fixed?fixed[0]:Math.min(...values),max=fixed?fixed[1]:Math.max(...values);
 if(min===max){min-=Math.max(.01,Math.abs(min)*.005);max+=Math.max(.01,Math.abs(max)*.005)}else if(!fixed){const pad=(max-min)*.12;min-=pad;max+=pad}
 ctx.font='9px Consolas';
 for(let i=0;i<4;i++){const y=top+i*height/3;ctx.strokeStyle='#23394a80';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-15,y);ctx.stroke();ctx.fillStyle='#7393a7';ctx.fillText((max-(max-min)*i/3).toFixed(max-min<5?2:0),5,y+3)}
 const first=data[0][xKey],last=data.at(-1)[xKey],xx=p=>left+(last===first?0:(p[xKey]-first)/(last-first))*width,yy=p=>top+(max-p[key])/(max-min)*height;
 ctx.beginPath();data.forEach((p,i)=>{if(Number.isFinite(p[key]))i?ctx.lineTo(xx(p),yy(p)):ctx.moveTo(xx(p),yy(p))});ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.stroke();
 ctx.lineTo(xx(data.at(-1)),top+height);ctx.lineTo(left,top+height);ctx.closePath();const gradient=ctx.createLinearGradient(0,top,0,top+height);gradient.addColorStop(0,color+'30');gradient.addColorStop(1,color+'00');ctx.fillStyle=gradient;ctx.fill();ctx.fillStyle='#5e7f94';ctx.fillText(first.toFixed(0)+' s',left,h-8);const label=last.toFixed(0)+' s';ctx.fillText(label,w-ctx.measureText(label).width-15,h-8);
}
function drawTrack(){
 const r=fit('groundtrack');if(!r||!view)return;const {ctx,w,h}=r,x=15,y=12,ww=w-30,hh=h-24;ctx.clearRect(0,0,w,h);
 const point=(lo,la)=>[x+(lo+180)/360*ww,y+(90-la)/180*hh];ctx.save();ctx.beginPath();ctx.rect(x,y,ww,hh);ctx.clip();ctx.fillStyle='#081622';ctx.fillRect(x,y,ww,hh);ctx.strokeStyle='#25435570';ctx.lineWidth=.7;
 for(let lo=-180;lo<=180;lo+=30){const p=point(lo,0);ctx.beginPath();ctx.moveTo(p[0],y);ctx.lineTo(p[0],y+hh);ctx.stroke()}
 for(let la=-60;la<=60;la+=30){const p=point(0,la);ctx.beginPath();ctx.moveTo(x,p[1]);ctx.lineTo(x+ww,p[1]);ctx.stroke()}
 for(const land of continents){ctx.beginPath();land.forEach(([lo,la],i)=>{const p=point(lo,la);i?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.closePath();ctx.fillStyle='#234859';ctx.fill()}
 ctx.strokeStyle='#69e8da';ctx.lineWidth=1.5;ctx.beginPath();let last=null;
 for(const [lo,la] of view.simulation.track||[]){const p=point(lo,la);!last||Math.abs(lo-last[0])>180?ctx.moveTo(...p):ctx.lineTo(...p);last=[lo,la]}
 ctx.stroke();const p=point(view.simulation.longitude_deg,view.simulation.latitude_deg);ctx.beginPath();ctx.arc(...p,3,0,Math.PI*2);ctx.fillStyle='#efb16b';ctx.fill();ctx.restore();
}
function drawCharts(){
 if(!view)return;chart('orbit-chart',view.history||[],$('metric').value,'t_s');
 const data=(view.telemetry_history||[]).map(p=>({...p,health_value:p.fault_flags?0:1,t:p.uptime_ms/1000}));chart('health-chart',data,'health_value','t','#efb16b',[-.1,1.1]);drawTrack();
 const h=view.history||[];set('chart-range',h.length?`${h[0].t_s.toFixed(0)} — ${h.at(-1).t_s.toFixed(0)} SIM s`:'Waiting for samples');
}
function badge(id,value,kind){set(id,value);$(id).className='badge '+kind}
function render(){
 if(!view)return;const s=view.simulation,q=view.qemu,p=q.packet;
 set('mission-time',clock(s.t_s));set('orbit-number','ORBIT '+String(s.orbit_number).padStart(3,'0'));set('view-mode',replay?'MISSION REPLAY':'LIVE REFERENCE');
 badge('run-status',replay?(playing?'REPLAYING':'REPLAY PAUSED'):(s.running?'RUNNING':'PAUSED'),s.running&&!replay?'good':'');
 if(document.activeElement!==$('speed'))$('speed').value=String(s.speed);
 set('sim-health',s.health);$('sim-dot').className='dot '+(s.fault?'bad':'good');$('sim-health').style.color=s.fault?'var(--orange)':'var(--cyan)';
 for(const [id,key,unit,digits] of [['altitude','altitude_km','km',2],['velocity','speed_kms','km/s',3],['period','period_min','min',2],['inclination','inclination_deg','deg',1]])$(id).innerHTML=`${s[key].toFixed(digits)} <em>${unit}</em>`;
 set('coordinates',`${Math.abs(s.latitude_deg).toFixed(2)}° ${s.latitude_deg>=0?'N':'S'} · ${Math.abs(s.longitude_deg).toFixed(2)}° ${s.longitude_deg>=0?'E':'W'}`);
 const link=!online&&!replay?'UNKNOWN':q.status;badge('qemu-status',link,link==='LIVE'?'good':link==='STALE'?'bad':'');
 set('qemu-health',p?(p.health+(link!=='LIVE'?' / LAST':'')):'WAITING');$('qemu-health-dot').className='dot '+(p&&link==='LIVE'?(p.fault_flags?'bad':'good'):'');set('qemu-age',q.age_s===null?'NO PACKETS':`${q.age_s.toFixed(1)} s AGO`);
 for(const [id,value] of [['qemu-seq',p?.sensor_seq??'—'],['qemu-uptime',p?clock(p.uptime_ms/1000).slice(2):'—'],['qemu-faults',p?'0x'+p.fault_flags.toString(16).padStart(2,'0'):'—'],['qemu-received',q.received??0],['qemu-errors',q.parser_errors],['qemu-restarts',q.restarts??0],['qemu-altitude',p?(p.sim_alt_m/1000).toFixed(1)+' km':'—'],['qemu-speed',p?(p.sim_speed_mps/1000).toFixed(3)+' km/s':'—']])set(id,value);
 const vector=(values,digits)=>values.map((v,i)=>'XYZ'[i]+'  '+(v>=0?'+':'')+v.toFixed(digits)).join('\n');set('position-vector',vector(s.position_eci_km,3));set('velocity-vector',vector(s.velocity_eci_kms,5));
 const tests=live?.tests;if(tests){set('tests-result',tests.running?'RUNNING…':tests.passed?`${tests.count} / ${tests.count} PASS`:'FAILED');set('tests-date',tests.timestamp?'Last run: '+new Date(tests.timestamp).toLocaleTimeString():'Not run');$('test-btn').disabled=tests.running||!online;$('verify-tests').disabled=tests.running||!online}
 $('events').innerHTML=(view.events||[]).slice(0,9).map(e=>`<div class="event ${esc(e.level)}"><time>${esc(e.at)}</time><span>${esc(e.message)}</span></div>`).join('');
 if(scene)scene.setPath(view.trajectory);controls.forEach(id=>$(id).disabled=!!replay||busy||!online);
 set('frame-count',`${replay?replay.frames.length:live?.recording.frames??0} FRAMES`);set('recording-label',replay?'REPLAY / RECORDED SIMULATION':`RECORDING / ${live?.recording.frames??0} FRAMES · ROLLING BUFFER`);drawCharts();diagnostics.mode=replay?'replay':'live';
}
function updateVerification(){
 if(!live)return;$('milestones').innerHTML=live.progress.milestones.map(m=>`<div class="milestone"><span>${esc(m.label)}</span><span>${esc(m.status.toUpperCase())}</span></div>`).join('');
 const checks=live.verification.checks||[];$('acceptance').innerHTML=checks.length?checks.map(c=>`<div class="evidence"><div>${esc(c.name)}<small>${esc(c.detail)}<br>${esc(c.timestamp||'')}</small></div><span>${live.verification.stale?'STALE':c.passed?'PASS':'FAIL'}</span></div>`).join(''):'<p class="hint">No saved acceptance report. Run the verification suite to populate evidence.</p>';
}
async function refresh(){
 try{const r=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(`HTTP ${r.status}`);live=await r.json();receivedAt=performance.now();online=true;set('backend-status','ONLINE');$('backend-dot').className='dot good';$('connection-error').hidden=true;if(!replay)view=live;render();updateVerification()}
 catch(error){online=false;diagnostics.lastError=String(error);set('backend-status','OFFLINE');$('backend-dot').className='dot bad';$('connection-error').hidden=false;render()}
 finally{setTimeout(refresh,500)}
}
async function command(command,value){
 if(busy||replay||!online)return;busy=true;notice('');render();
 try{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,value}),signal:AbortSignal.timeout(10000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Command rejected');if(command==='test')notice('Python verification started. Telemetry continues while tests run.')}
 catch(error){notice(error.message)}finally{busy=false;render()}
}
function setReplayFrame(i){
 if(!replay)return;index=Math.max(0,Math.min(replay.frames.length-1,i));const frame=replay.frames[index],frames=replay.frames.slice(Math.max(0,index-179),index+1);
 view={...live,...frame,simulation:{...frame.simulation,track:groundTrack(frame.simulation,replay.config)},config:replay.config,trajectory:replay.trajectory,history:frames.map(f=>f.simulation),telemetry_history:frames.filter(f=>f.qemu.packet).map(f=>f.qemu.packet),events:(replay.events||[]).filter(e=>e.recorded_s===undefined||e.recorded_s<=frame.recorded_s)};
 $('replay-slider').value=index;set('replay-time',clock(frame.simulation.t_s));set('replay-position',`${index+1} / ${replay.frames.length}`);render();
}
function enterReplay(data){replay=validateSession(data);playing=false;$('replay-slider').max=replay.frames.length-1;$('replay-slider').disabled=false;$('replay-play').disabled=false;$('live-btn').disabled=false;set('replay-play','▶ Play');setReplayFrame(0)}
function goLive(){replay=null;playing=false;view=live;$('replay-slider').disabled=true;$('replay-play').disabled=true;$('live-btn').disabled=true;set('replay-time','LIVE');set('replay-position','—');render()}
function tab(name){for(const section of ['operations','verification'])$(section).hidden=section!==name;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));if(name==='verification')testOutput();else{scene?.resize();drawCharts()}}
async function testOutput(){try{const r=await fetch('/api/test-output');const tests=await r.json();set('test-output',tests.summary||'No test output')}catch(e){notice(e.message)}}
function tick(now){
 if(replay&&playing){const target=replay.frames[playAt.index].recorded_s+(now-playAt.wall)/1000;let next=index;while(next<replay.frames.length-1&&replay.frames[next+1].recorded_s<=target)next++;if(next!==index)setReplayFrame(next);if(index===replay.frames.length-1){playing=false;set('replay-play','▶ Play')}}
 if(scene&&view){const s=view.simulation,elapsed=!replay&&online&&s.running?Math.min((now-receivedAt)/1000,1)*s.speed:0;scene.render(interpolate(s,elapsed,view.config));diagnostics.frames=scene.frameCount;diagnostics.spacecraftPosition=scene.satellite.position.toArray();diagnostics.camera=scene.camera.position.toArray()}
 requestAnimationFrame(tick);
}
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));
$('speed').onchange=e=>command('speed',Number(e.target.value));
$('orbit-form').onsubmit=e=>{e.preventDefault();command('configure',Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)])))};
$('metric').onchange=drawCharts;$('test-btn').onclick=$('verify-tests').onclick=()=>command('test');$('test-output-btn').onclick=testOutput;
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('verification-link').onclick=e=>{e.preventDefault();tab('verification')};
$('replay-btn').onclick=async()=>{try{const r=await fetch('/api/session');if(!r.ok)throw Error('Unable to fetch recording');enterReplay(await r.json())}catch(e){notice(e.message)}};
$('replay-slider').oninput=e=>{playing=false;set('replay-play','▶ Play');setReplayFrame(Number(e.target.value))};
$('replay-play').onclick=()=>{if(!replay)return;if(index===replay.frames.length-1)setReplayFrame(0);playing=!playing;playAt={index,wall:performance.now()};set('replay-play',playing?'Ⅱ Pause':'▶ Play')};$('live-btn').onclick=goLive;
$('export-btn').onclick=async()=>{try{const data=replay||await (await fetch('/api/session')).json();validateSession(data);const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='orbit1-session-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){notice(e.message)}};
$('import-btn').onclick=()=>$('session-file').click();
$('session-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>12*1024*1024)throw Error('Recording exceeds 12 MB');enterReplay(JSON.parse(await file.text()));notice('Imported recording. Live simulation continues separately.')}catch(e){notice(e.message)}finally{e.target.value=''}};
$('follow-btn').onclick=()=>{if(scene){scene.follow=!scene.follow;set('follow-btn',scene.follow?'Following craft':'Follow craft')}};
$('camera-reset').onclick=()=>{scene?.reset();set('follow-btn','Follow craft')};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)&&!replay){e.preventDefault();command(live?.simulation.running?'pause':'start')}});
window.addEventListener('resize',drawCharts);setInterval(()=>set('utc',new Date().toISOString().slice(11,19)+' UTC'),1000);
try{const {MissionScene}=await import('./scene.js');scene=new MissionScene($('globe'));diagnostics.renderer='webgl';badge('renderer-status','WEBGL / 3D','good')}
catch(error){diagnostics.renderer='failed';diagnostics.lastError=String(error);badge('renderer-status','WEBGL UNAVAILABLE','bad');$('scene-error').hidden=false;set('scene-error','3D requires WebGL. Enable browser graphics acceleration or use a WebGL-capable browser. Telemetry and simulation controls remain available.')}
refresh();requestAnimationFrame(tick);
