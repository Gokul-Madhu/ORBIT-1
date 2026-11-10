import {MissionScene} from './scene.js';

const byId = id => document.getElementById(id);
const write = (id, value) => { byId(id).textContent = value; };
let data;
let replay;
let device = 'primary';
let points = [];
let scene;
let work = Promise.resolve();

try {
  scene = new MissionScene(byId('earth'));
  scene.satellite.visible = false;
  scene.render();
} catch {
  write('orbit-note', 'WebGL unavailable. Electronics controls remain available.');
}

async function request(path = '/api/lab', body) {
  const response = await fetch(path, body ? {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  } : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Laboratory request failed');
  return result;
}

function draw(frame, frames) {
  const history = byId('trace').value === 'history';
  points = history ? frames.map(item => [item.t_s, item.battery_v, item.rail_v]) : frame.waveform;
  const canvas = byId('wave');
  canvas.width = canvas.clientWidth || 400;
  canvas.height = canvas.clientHeight || 210;
  const ctx = canvas.getContext('2d');
  const end = Math.max(points.at(-1)[0] - points[0][0], 1);
  ctx.strokeStyle = '#23394a';
  for (let volts = 0; volts <= 10; volts += 2) {
    const y = canvas.height * (1 - volts / 10);
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.fillStyle = '#9cb3c5';
    ctx.fillText(volts, 4, Math.min(canvas.height - 2, Math.max(10, y)));
  }
  ['#ffbc86', '#69e8da'].forEach((color, channel) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    points.forEach(([t, first, second], i) => {
      const x = 20 + (t - points[0][0]) / end * (canvas.width - 21);
      const y = canvas.height * (1 - [first, second][channel] / 10);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  write('scale', history ? 'Orange battery voltage · cyan rail voltage · 0–10 V'
    : 'Orange prior rail · cyan modeled RC output (τ = 2 ms) · 0–10 V');
}

function render() {
  if (!data) return;
  const index = replay ? Number(byId('seek').value) : 0;
  const frame = replay ? replay.frames[index] : data.state;
  const source = replay || data;
  write('phase', frame.phase);
  write('clock', `${frame.t_s.toFixed(2)} simulation s · ${replay ? 'REPLAY' : data.running ? 'RUNNING' : 'PAUSED'}`);
  write('active', (replay ? frame.faults : data.active_faults).map(key => data.available_faults[key]).join(' · '));
  byId('speed').value = data.speed;
  document.querySelectorAll('[data-command], #speed').forEach(control => { control.disabled = Boolean(replay); });
  const deviceList = byId('devices');
  if (!deviceList.children.length) {
    Object.keys(frame.devices).forEach(name => {
      const button = document.createElement('button');
      button.textContent = name.replace('_', ' ');
      button.onclick = () => { device = name; render(); };
      deviceList.append(button);
    });
  }
  Object.entries(frame.devices).forEach(([name, value], i) => {
    const button = deviceList.children[i];
    button.classList.toggle('selected', name === device);
    button.classList.toggle('unpowered', !value.powered);
  });
  const component = frame.devices[device];
  const transactions = source.transactions.filter(row => row.t_s <= frame.t_s);
  const latest = transactions.filter(row => row.source === device || row.destination === device).at(-1);
  write('device', `${device} · ${component.powered ? 'Powered' : 'Unpowered'}\n${component.bus} · ${component.load_a} A nominal load\nLatest transaction: ${latest ? latest.result + ' at ' + latest.t_s + ' s' : 'none in buffer'}`);
  write('computer', `Host model: ${frame.health}, controller ${frame.controller}, ${frame.watchdog_resets} watchdog resets. Payload ${frame.payload}. Ground link: ${frame.radio_received} received, ${frame.radio_dropped} dropped.`);
  const firmware = data.firmware;
  write('firmware', `Live QEMU (independent firmware clock): ${firmware.status}${firmware.packet ? ', ' + firmware.packet.uptime_ms + ' ms uptime, ' + firmware.packet.health : ''}`);
  write('power', `Battery ${frame.battery_v.toFixed(2)} V / ${frame.battery_a.toFixed(3)} A · rail ${frame.rail_v.toFixed(2)} V · ${frame.load_w.toFixed(2)} W load · ${frame.charge_pct.toFixed(2)}% charge`);
  const units = {sensor_a: '', sensor_b: '', temperature: ' °C', pressure: ' kPa'};
  write('sensors', Object.keys(units).map(name =>
    `${name}: ${frame.sensors[name] == null ? 'unavailable' : frame.sensors[name] + units[name]}`).join('\n')
    + (frame.disagreement ? '\nSensor disagreement detected' : ''));
  byId('events').replaceChildren(...source.events.filter(event => event.t_s <= frame.t_s).slice(-12).reverse().map(event => {
    const row = document.createElement('li');
    row.textContent = `${event.t_s.toFixed(2)} s · ${event.message}`;
    return row;
  }));
  const bus = byId('bus').value;
  byId('messages').replaceChildren(...transactions.filter(row => bus === 'All' || row.bus === bus).slice(-24).reverse().map(row => {
    const tr = document.createElement('tr');
    [row.t_s, row.bus, row.source, row.destination, row.hex, row.crc16, row.wire_ms.toFixed(3), row.result]
      .forEach(value => { tr.insertCell().textContent = value; });
    return tr;
  }));
  draw(frame, replay ? replay.frames.slice(0, index + 1) : data.frames);
  if (scene) {
    scene.satellite.visible = Boolean(frame.orbital_reference);
    scene.setPath(frame.orbital_reference ? data.trajectory : []);
    const sample = frame.orbital_reference;
    write('orbit-note', sample ? `400 km reference orbit · latitude ${sample.latitude_deg.toFixed(2)}°`
      : 'Ground and flight cues drive bench signals. The spacecraft appears at orbit acquisition.');
    scene.render(sample);
  }
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function action(callback) {
  work = work.then(async () => {
    try {
      await callback();
    } catch (error) {
      write('error', error.message);
    }
  });
  return work;
}

async function refresh() {
  data = await request();
  if (!byId('fault').options.length) {
    Object.entries(data.available_faults).forEach(([key, title]) => byId('fault').add(new Option(title, key)));
  }
  render();
}

function command(name, value) {
  action(async () => {
    await request('/api/lab', {command: name, value});
    await refresh();
    write('error', '');
  });
}
document.querySelectorAll('[data-command]').forEach(button => {
  button.onclick = () => command(button.dataset.command, byId('fault').value);
});
byId('speed').onchange = () => command('speed', Number(byId('speed').value));
for (const id of ['bus', 'trace', 'seek']) byId(id).oninput = render;
byId('replay').onclick = () => action(async () => {
  replay = await request('/api/lab/recording');
  byId('seek').disabled = false;
  byId('seek').max = replay.frames.length - 1;
  byId('seek').value = 0;
  render();
});
byId('live').onclick = () => { replay = undefined; byId('seek').disabled = true; render(); };
byId('export').onclick = () => action(async () => {
  const recording = replay || await request('/api/lab/recording');
  download('orbit1-lab.json', JSON.stringify(recording), 'application/json');
});
byId('csv').onclick = () => {
  const header = byId('trace').value === 'history' ? 'time_s,battery_v,rail_v' : 'time_ms,prior_rail_v,rc_output_v';
  download('orbit1-waveform.csv', [header, ...points.map(row => row.join(','))].join('\n'), 'text/csv');
};
async function poll() {
  await action(refresh);
  setTimeout(poll, 500);
}
poll();
