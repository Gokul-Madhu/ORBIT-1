import {MissionScene} from './scene.js';
import {RocketTwin} from './twin.js';
import {MODULE_NAMES, VEHICLE_ZONES} from './layout.js';
import {EXTRA_INSTRUMENTS} from './instrument-layout.js';
import {createInstrumentArray} from './instrument-array.js';
import {createSystemFlow} from './system-flow.js';
import {createSensorGuide} from './sensor-guide.js';
import {createTestBench, readingTrail} from './test-bench.js';
import {createReliabilityLab} from './reliability-lab.js';

const byId = id => document.getElementById(id);
const write = (id, value) => { byId(id).textContent = value; };
let data;
let replay;
let device = 'primary';
let points = [];
let scene;
let twin;
let chipName = '';
let heldWave;
let waveSource;
let waveCursor;
let heldPackets;
let playback;
let visibleFrame;
let guideEvidence;
let adaptiveQuality = 'auto';
let work = Promise.resolve();
const equipmentButtons = new Map();
const instrumentArray = createInstrumentArray({request, read: reading, download});
const systemFlow = createSystemFlow({read: reading, navigate: showWorkspace, explain: showGuideEvidence});
const sensorGuide = createSensorGuide(selectDevice, showGuideEvidence);
const reliability = createReliabilityLab({request, read: reading, navigate: showWorkspace, openEvidence, download});
const testBench = createTestBench({request, read: reading, openReplay: (recording, index) => {
  showWorkspace('visual');
  openReplay(recording, index);
}, download});
const workspace = byId('workspace-panes');
const viewButtons = [...document.querySelectorAll('[data-workspace-view]')];
const viewSelect = byId('workspace-select');
const narrowWorkspace = matchMedia('(max-width: 760px)');
for (const button of viewButtons) {
  const view = button.dataset.workspaceView;
  button.setAttribute('aria-controls', view);
  button.onclick = () => showWorkspace(view);
  viewSelect.add(new Option(button.textContent.trim(), view));
}
viewSelect.onchange = () => showWorkspace(viewSelect.value);
window.addEventListener('hashchange', () => showWorkspace(location.hash.slice(1)));

function showWorkspace(requested) {
  const view = viewButtons.some(button => button.dataset.workspaceView === requested)
    ? requested : 'visual';
  workspace.dataset.view = view;
  viewSelect.value = view;
  write('workspace-title', viewButtons.find(button => button.dataset.workspaceView === view).textContent.trim());
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.workspaceView === view));
  }
  for (const pane of workspace.children) {
    pane.hidden = pane.id !== view && !(view === 'visual' && pane.id === 'components');
  }
  history.replaceState(null, '', '#' + view);
  if (view === 'requirements') reliability.showRequirements();
  requestAnimationFrame(() => {
    twin?.resize();
    if (view === 'visual' && byId('twin-mode').value === 'orbit') scene?.resize();
    render();
  });
}
const PURPOSE = {
  primary: 'The main computer collects readings and sends them to the radio.',
  backup: 'The spare computer can take over when the main computer fails and power is available.',
  sensor_a: 'This motion sensor measures acceleration in three directions. The computer reads it over the cyan SPI path.',
  sensor_b: 'This second motion sensor provides a reading the computer can compare with the primary sensor.',
  gyro: 'The gyroscope measures how quickly the rocket is turning in three directions.',
  pressure: 'This sensor measures how strongly the surrounding gas pushes. The lab changes that pressure as the mission advances.',
  strain_upper: 'This gauge tracks simulated stretching of the shell near the payload bay.',
  strain_lower: 'This gauge tracks simulated stretching of the lower equipment frame.',
  vibration_upper: 'This sensor measures the modeled shaking at the upper deck.',
  vibration_lower: 'This sensor measures the modeled shaking at the lower deck.',
  skin_upper: 'This probe tracks simulated temperature on the upper outer shell.',
  skin_lower: 'This probe tracks simulated temperature on the lower outer shell.',
  sound_upper: 'This microphone shows the relative sound level in the upper bay.',
  sound_lower: 'This microphone shows the relative sound level near the lower deck.',
  heat_upper: 'This gauge shows how quickly heat enters the upper surface in the prescribed test profile.',
  heat_lower: 'This gauge shows how quickly heat enters the lower surface in the prescribed test profile.',
  payload_switch: 'This switch indicates when the virtual payload reaches its operating milestone.',
  payload_supply: 'This monitor shows whether the payload branch has voltage and how much nominal current it draws.',
  temperature: 'This probe reports how warm the electronics are in the power model.',
  gnss: 'This receiver shows the rocket’s calculated position once it reaches the simulated orbit.',
  regulator: 'The regulator supplies a steady five volts so the computers and sensors can work.',
  monitor: 'The power monitor shows the supply voltage and how much current the devices draw.',
  radio: 'The radio passes simulated messages from the computer to the ground station.',
  payload: 'The payload is the equipment the rocket carries. It starts up after the orbit milestone.',
  battery: 'The battery supplies energy to the electronics through the regulator.',
  checkout_load: 'This device draws power during early checks and is disconnected at the stage milestone.',
};
const HEALTH_EXPLANATION = {
  HEALTHY: 'Green means this component is working in the current simulation step.',
  WARNING: 'Amber means the component is available, but its readings need checking.',
  FAILED: 'Red means this component cannot perform its modeled job in the current step.',
  OFF: 'Gray means this component is off or has yet to start.',
};

try {
  twin = new RocketTwin(byId('rocket'), (name, part) => selectDevice(name, part));
  twin.focus(device, 'vehicle');
} catch {
  write('graphics', 'WebGL unavailable · engineering panels remain active');
}

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
  const history = heldWave?.history ?? (byId('trace').value === 'history');
  const samples = heldWave?.points ?? (history
    ? frames.map(item => [item.t_s, item.battery_v, item.rail_v]) : frame.waveform);
  waveSource = {history, points: samples};
  const windowSize = Math.max(2, Math.ceil(samples.length * Number(byId('timebase').value)));
  points = samples.slice(-windowSize);
  if (waveCursor && (waveCursor.history !== history ||
    !points.some(point => point.every((value, index) => value === waveCursor.point[index])))) {
    waveCursor = undefined;
    write('cursor', 'Click the trace to read a sample');
  }
  const canvas = byId('wave');
  canvas.width = canvas.clientWidth || 400;
  canvas.height = canvas.clientHeight || 210;
  const ctx = canvas.getContext('2d');
  const end = Math.max(points.at(-1)[0] - points[0][0], .001);
  const scale = Number(byId('volts').value);
  ctx.strokeStyle = '#23394a';
  for (let division = 0; division <= 5; division++) {
    const volts = scale * division / 5;
    const y = canvas.height * (1 - volts / scale);
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
      const y = canvas.height * (1 - [first, second][channel] / scale);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  const labels = history ? 'Orange battery · cyan rail' : 'Orange prior rail · cyan RC output (τ = 2 ms)';
  write('scale', `${labels} · 0–${scale} V · ${points[0][0]}–${points.at(-1)[0]} ${history ? 's' : 'ms'}`);
}

function reading(frame, name) {
  if (name === 'monitor') return [frame.battery_v, frame.rail_v, frame.battery_a];
  if (name in (frame.vectors || {})) return frame.vectors[name];
  const scalar = frame.sensors[name];
  return scalar == null ? null : [scalar];
}

function sensorPlot(frames) {
  const canvas = byId('sensor-plot');
  canvas.hidden = !data.sensor_specs[device];
  if (canvas.hidden) return;
  canvas.width = canvas.clientWidth || 400;
  canvas.height = canvas.clientHeight || 135;
  const ctx = canvas.getContext('2d');
  const series = frames.slice(-80).map(frame => reading(frame, device));
  const samples = series.filter(Boolean).flat();
  ctx.fillStyle = '#94adc4';
  ctx.font = '12px system-ui';
  if (!samples.length) {
    ctx.fillText('No valid samples in this window', 12, 22);
    return;
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = Math.max(.01, max - min);
  ctx.fillText(`${min.toFixed(2)} to ${max.toFixed(2)} · last ${series.length} samples`, 12, 17);
  for (const [axis, color] of ['#ff758a', '#5ef0bd', '#68aaff'].entries()) {
    let pen = false;
    ctx.beginPath();
    ctx.strokeStyle = color;
    series.forEach((sample, index) => {
      const value = sample?.[axis];
      if (value == null) {
        pen = false;
        return;
      }
      const x = 12 + index * (canvas.width - 24) / Math.max(1, series.length - 1);
      const y = canvas.height - 12 - (value - min) / span * (canvas.height - 37);
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    });
    ctx.stroke();
  }
}

function selectDevice(name, part = '') {
  if (device !== name) byId('reading-trail').hidden = true;
  device = name;
  chipName = part || '';
  setMode('pcb');
  showWorkspace(narrowWorkspace.matches ? 'components' : 'visual');
  render();
}

function buildVehicleLayout() {
  for (const zone of VEHICLE_ZONES) {
    const card = document.createElement('section');
    card.className = 'equipment-deck';
    const heading = document.createElement('button');
    heading.className = 'deck-focus';
    heading.textContent = zone.title;
    heading.onclick = () => {
      setMode('vehicle');
      twin?.focusDeck(zone.height);
      write('layout-selection', `3D view focused on ${zone.title.toLowerCase()}.`);
      showWorkspace('visual');
    };
    const summary = document.createElement('p');
    summary.textContent = zone.summary;
    const modules = document.createElement('div');
    modules.className = 'deck-components';
    for (const name of zone.modules) {
      const button = document.createElement('button');
      button.dataset.equipment = name;
      button.textContent = MODULE_NAMES[name];
      button.onclick = () => {
        selectDevice(name);
        write('layout-selection', `Inspecting ${MODULE_NAMES[name]} in the 3D view.`);
      };
      equipmentButtons.set(name, button);
      modules.append(button);
    }
    card.append(heading, summary, modules);
    byId('equipment-decks').append(card);
  }
}

function setMode(mode) {
  byId('twin-mode').value = mode;
  byId('rocket').hidden = mode === 'orbit';
  byId('earth').hidden = mode !== 'orbit';
  byId('precision-tools').hidden = mode === 'orbit';
  if (mode === 'orbit') {
    scene?.resize();
    scene?.render(visibleFrame?.orbital_reference);
  }
  else twin?.focus(device, mode);
}

function render() {
  if (!data) return;
  const index = replay ? Number(byId('seek').value) : 0;
  const frame = replay ? replay.frames[index] : data.state;
  testBench.configure(data);
  reliability.configure(data.available_faults);
  if (!equipmentButtons.size) buildVehicleLayout();
  for (const [name, button] of equipmentButtons) {
    const health = frame.devices[name]?.health || 'OFF';
    button.dataset.health = health;
    button.setAttribute('aria-label', `${MODULE_NAMES[name]}, ${health.toLowerCase()}`);
    button.setAttribute('aria-pressed', String(device === name));
  }
  const source = replay || data;
  visibleFrame = frame;
  if (guideEvidence?.time !== frame.t_s || guideEvidence?.replay !== replay) {
    guideEvidence = undefined;
    byId('guide-evidence').hidden = true;
  }
  const history = replay ? replay.frames.slice(0, index + 1) : data.frames;
  instrumentArray.update(frame, history);
  write('phase', frame.phase);
  const complete = data.state.phase === 'Complete';
  const mode = replay ? 'REPLAY' : complete ? 'ENDED' : data.running ? 'RUNNING' : 'PAUSED';
  write('clock', `${frame.t_s.toFixed(2)} simulation s · ${mode}`);
  write('mission-hint', replay ? 'Return to live in Faults & Replay to use mission controls.'
    : complete ? 'Reset to start a new mission, or open Faults & Replay to review this run.' : '');
  write('active', (replay ? frame.faults : data.active_faults).map(key => data.available_faults[key]).join(' · '));
  byId('speed').value = data.speed;
  document.querySelectorAll('[data-command]').forEach(control => {
    const command = control.dataset.command;
    control.disabled = Boolean(replay) || (complete && command !== 'reset')
      || (data.running && ['start', 'step'].includes(command))
      || (!data.running && command === 'pause');
  });
  byId('speed').disabled = Boolean(replay) || complete;
  const deviceList = byId('devices');
  const componentSelect = byId('component-select');
  if (!deviceList.children.length) {
    Object.keys(frame.devices).forEach(name => {
      const button = document.createElement('button');
      button.textContent = data.sensor_specs[name]?.[0] || name.replace('_', ' ');
      button.dataset.component = name;
      button.onclick = () => selectDevice(name);
      deviceList.append(button);
    });
    for (const zone of VEHICLE_ZONES) {
      const group = document.createElement('optgroup');
      group.label = zone.title;
      for (const name of zone.modules) {
        group.append(new Option(MODULE_NAMES[name], name));
      }
      componentSelect.append(group);
    }
    componentSelect.onchange = () => selectDevice(componentSelect.value);
  }
  componentSelect.value = device;
  Object.entries(frame.devices).forEach(([name, value], i) => {
    const button = deviceList.children[i];
    button.classList.toggle('selected', name === device);
    button.classList.toggle('unpowered', !value.powered);
    button.classList.toggle('failed', value.health === 'FAILED');
    button.classList.toggle('warning', value.health === 'WARNING');
    button.setAttribute('aria-pressed', String(name === device));
  });
  const component = frame.devices[device];
  const transactions = source.transactions.filter(row => row.t_s <= frame.t_s);
  sensorGuide.update(frame, data.sensor_specs, transactions, reading, device);
  const latest = transactions.filter(row => row.source === device || row.destination === device).at(-1);
  const spec = data.sensor_specs[device];
  byId('trace-reading').disabled = !spec;
  const sample = reading(frame, device);
  const values = sample ? sample.map(value => value.toFixed(3)).join(' / ') : 'No valid sample';
  write('component-name', `${spec?.[0] || device.replace('_', ' ')}${chipName ? ' · ' + chipName : ''}`);
  write('component-purpose', [PURPOSE[device] || EXTRA_INSTRUMENTS[device]?.[5],
    HEALTH_EXPLANATION[component.health]].filter(Boolean).join(' '));
  write('device', [
    `${component.health} · ${component.powered ? 'Powered' : 'Unpowered'}`,
    `${component.bus}${component.load_a == null ? '' : ' · ' + component.load_a + ' A nominal'}`,
    spec ? `Reading: ${values}${sample ? ' ' + spec[1] : ''}` : '',
    latest ? `Latest transaction: ${latest.result} · ${latest.t_s} s · ${latest.wire_ms.toFixed(3)} ms wire time`
      : 'No transaction in the current buffer',
  ].filter(Boolean).join('\n'));
  write('sensor-spec', spec ? `Range: ${spec[2]}. Acquisition: 4 Hz. ${spec[3]}.`
    : 'Component geometry is illustrative.');
  sensorPlot(history);
  const failures = Object.entries(frame.devices).filter(([, item]) => item.health === 'FAILED');
  byId('fault-focus').disabled = !failures.length;
  byId('fault-focus').onclick = () => selectDevice(failures[0][0]);
  write('computer', `Host model: ${frame.health}, controller ${frame.controller}, ${frame.watchdog_resets} watchdog resets. Payload ${frame.payload}. Ground link: ${frame.radio_received} received, ${frame.radio_dropped} dropped.`);
  const firmware = data.firmware;
  systemFlow.update(frame, history.at(-2), data.sensor_specs, transactions, firmware, Boolean(replay));
  const hostStatus = byId('host-health');
  const firmwareStatus = byId('firmware-health');
  hostStatus.dataset.status = frame.health;
  firmwareStatus.dataset.status = firmware.status === 'LIVE' ? (firmware.packet?.health || 'LIVE') : firmware.status;
  write('host-health', `Host · ${frame.health.toLowerCase()}`);
  write('firmware-health', `Firmware · ${firmware.status.toLowerCase()}${firmware.status === 'LIVE' && firmware.packet ? ' / ' + firmware.packet.health.toLowerCase() : ''}`);
  write('firmware', `Live QEMU (independent firmware clock): ${firmware.status}${firmware.packet ? ', ' + firmware.packet.uptime_ms + ' ms uptime, ' + firmware.packet.health : ''}`);
  write('power', `Battery ${frame.battery_v.toFixed(2)} V / ${frame.battery_a.toFixed(3)} A · rail ${frame.rail_v.toFixed(2)} V · ${frame.load_w.toFixed(2)} W load · ${frame.charge_pct.toFixed(2)}% charge`);
  write('sensors', Object.entries(data.sensor_specs).map(([name, info]) => {
    const value = reading(frame, name);
    return `${info[0]}: ${value ? value.map(v => v.toFixed(3)).join(' / ') + ' ' + info[1] : 'unavailable'}`;
  }).join('\n')
    + (frame.disagreement ? '\nSensor disagreement detected' : ''));
  byId('events').replaceChildren(...source.events.filter(event => event.t_s <= frame.t_s).slice(-12).reverse().map(event => {
    const row = document.createElement('li');
    row.textContent = `${event.t_s.toFixed(2)} s · ${event.message}`;
    return row;
  }));
  const bus = byId('bus').value;
  const result = byId('bus-result').value;
  const query = byId('bus-component').value.trim().toLowerCase();
  const byProtocol = (heldPackets || transactions).filter(row => bus === 'All' || row.bus === bus);
  const display = byProtocol.filter(row =>
    (result === 'all' || (result === 'ok') === (row.result === 'ok')) &&
    (!query || [row.source, row.destination].some(name =>
      name.toLowerCase().includes(query) || data.sensor_specs[name]?.[0].toLowerCase().includes(query))));
  const tick = byProtocol.filter(row => row.t_s === frame.t_s);
  const load = tick.reduce((total, row) => total + row.wire_ms, 0) / 2.5;
  write('bus-utilization', `Modeled occupancy this 250 ms tick: ${load.toFixed(2)}% ${bus === 'All' ? '(sum across buses)' : ''}. Protocol retries are unmodeled.`);
  write('bus-matches', display.length
    ? `Showing ${Math.min(24, display.length)} of ${display.length} matching attempts in the packet buffer.`
    : 'No matching attempts in the packet buffer.');
  byId('messages').replaceChildren(...display.slice(-24).reverse().map(row => {
    const tr = document.createElement('tr');
    tr.classList.toggle('failed', row.result !== 'ok');
    [row.t_s, row.bus, row.source, row.destination, row.field || '—', row.hex, row.crc16,
      row.value?.toFixed(3) ?? '—', row.wire_ms.toFixed(3), row.rate_bps, row.result]
      .forEach(value => { tr.insertCell().textContent = value; });
    return tr;
  }));
  draw(frame, history);
  if (twin) {
    twin.setFrame(frame, transactions);
    const fps = Number(byId('rocket').dataset.fps);
    write('graphics', fps ? `WebGL · ${fps} FPS` : 'WebGL active');
    if (fps && fps < 22 && adaptiveQuality !== 'low') {
      adaptiveQuality = 'low';
      configureTwin();
    }
  }
  if (scene) {
    scene.satellite.visible = Boolean(frame.orbital_reference);
    scene.setPath(frame.orbital_reference ? data.trajectory : []);
    const sample = frame.orbital_reference;
    write('orbit-note', sample ? `400 km reference orbit · latitude ${sample.latitude_deg.toFixed(2)}°`
      : `${frame.phase} · illustrated pre-orbit motion · ${Math.round(frame.mission_display * 100)}% display progress`);
    if (byId('twin-mode').value === 'orbit') scene.render(sample);
  }
}

function configureTwin() {
  twin?.configure({
    opacity: Number(byId('opacity').value) / 100,
    exploded: Number(byId('explode').value) / 100,
    shellVisible: byId('shell').checked,
    quality: byId('quality').value === 'low' ? 'low' : adaptiveQuality,
  });
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
  byId('beginner-sensor').disabled = false;
}

byId('beginner-sensor').onclick = () => {
  selectDevice('sensor_a');
  byId('fault').value = 'imu';
};

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
for (const id of ['bus', 'bus-result', 'bus-component', 'trace', 'seek']) byId(id).oninput = render;
for (const id of ['timebase', 'volts']) byId(id).onchange = render;
for (const id of ['opacity', 'explode', 'shell', 'quality']) byId(id).oninput = configureTwin;
byId('labels').onchange = event => twin?.showLabels(event.target.checked);
byId('projection').onchange = event => twin?.setProjection(event.target.value);
document.querySelectorAll('[data-camera-view]').forEach(button => {
  button.onclick = () => twin?.viewFrom(button.dataset.cameraView);
});
byId('zoom-in').onclick = () => twin?.zoomBy(1.2);
byId('zoom-out').onclick = () => twin?.zoomBy(1 / 1.2);
byId('reference-grid').onchange = event => twin?.showGrid(event.target.checked);
byId('twin-mode').onchange = event => { setMode(event.target.value); render(); };
byId('camera-reset').onclick = () => {
  setMode(byId('twin-mode').value);
  scene?.reset();
};
byId('fullscreen').onclick = () => action(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await byId('visual').requestFullscreen();
});
byId('freeze-wave').onclick = () => {
  heldWave = heldWave ? undefined : waveSource;
  byId('trace').disabled = Boolean(heldWave);
  byId('freeze-wave').setAttribute('aria-pressed', String(Boolean(heldWave)));
  render();
};
byId('hold-packets').onclick = () => {
  heldPackets = heldPackets ? undefined : (replay || data)?.transactions.filter(row => row.t_s <= visibleFrame.t_s);
  byId('hold-packets').setAttribute('aria-pressed', String(Boolean(heldPackets)));
  render();
};
byId('wave').onclick = event => {
  if (!points.length) return;
  const fraction = Math.min(1, Math.max(0, (event.offsetX - 20) / (byId('wave').clientWidth - 21)));
  const point = points[Math.round(fraction * (points.length - 1))];
  const seconds = waveSource.history;
  waveCursor = {history: seconds, point};
  write('cursor', `${point[0]} ${seconds ? 's' : 'ms'} · ${point[1].toFixed(3)} V / ${point[2].toFixed(3)} V`);
};
function openReplay(recording, index = 0) {
  stopPlayback();
  replay = recording;
  byId('seek').disabled = false;
  byId('seek').max = replay.frames.length - 1;
  byId('seek').value = index;
  byId('playback').disabled = false;
  render();
}
function openEvidence(recording, index, view, sensor = '', bus = '', failed = false) {
  if (sensor && recording.frames[index].devices[sensor]) device = sensor;
  if (view === 'network') {
    const frame = recording.frames[index];
    heldPackets = recording.transactions.filter(row => row.t_s === frame.t_s);
    byId('hold-packets').setAttribute('aria-pressed', 'true');
    byId('bus').value = bus || 'All';
    byId('bus-result').value = failed ? 'failed' : 'all';
    byId('bus-component').value = sensor;
  }
  if (view === 'power-lab') {
    heldWave = undefined;
    byId('trace').disabled = false;
    byId('freeze-wave').setAttribute('aria-pressed', 'false');
    byId('trace').value = 'history';
    byId('timebase').value = '1';
  }
  openReplay(recording, index);
  showWorkspace(view);
  if (view === 'system-flow') byId('flow-mesh-button').click();
}

function showGuideEvidence({text, sensor = '', bus = '', failed = false}) {
  if (!visibleFrame) return;
  guideEvidence = {time: visibleFrame.t_s, replay, sensor, bus, failed};
  write('guide-evidence-summary', text);
  byId('guide-evidence').hidden = false;
}

for (const [id, view] of [['guide-packets', 'network'], ['guide-power', 'power-lab'], ['guide-replay', 'fault-center']]) {
  byId(id).onclick = () => {
    const evidence = guideEvidence;
    if (!evidence) return;
    action(async () => {
      const recording = evidence.replay || await request('/api/lab/recording');
      const index = recording.frames.findIndex(frame => frame.t_s === evidence.time);
      if (index < 0) throw Error('That frame is no longer in the recording');
      openEvidence(recording, index, view, evidence.sensor, evidence.bus, evidence.failed);
    });
  };
}
byId('replay').onclick = () => action(async () => openReplay(await request('/api/lab/recording')));
byId('trace-reading').onclick = () => action(async () => {
  const sensor = device;
  const frameTime = visibleFrame.t_s;
  const recording = replay || await request('/api/lab/recording');
  const index = recording.frames.findIndex(frame => frame.t_s === frameTime);
  if (index < 0) throw Error('That frame is no longer in the recording');
  const trail = readingTrail(recording, index, sensor, reading);
  byId('reading-trail-steps').replaceChildren(...trail.steps.map(step => {
    const li = document.createElement('li');
    li.textContent = step;
    return li;
  }));
  byId('reading-trail').hidden = false;
  byId('trail-replay').textContent = trail.present ? 'Open this frame in replay' : 'Open first affected frame';
  byId('trail-replay').onclick = () => {
    device = sensor;
    chipName = '';
    setMode('network');
    showWorkspace('visual');
    openReplay(recording, trail.first);
  };
});
function stopPlayback() {
  clearInterval(playback);
  playback = undefined;
  write('playback', 'Play recording');
}
byId('playback').onclick = () => {
  if (playback) return stopPlayback();
  if (!replay) return;
  write('playback', 'Pause recording');
  playback = setInterval(() => {
    const seek = byId('seek');
    if (Number(seek.value) >= Number(seek.max)) return stopPlayback();
    seek.value = Number(seek.value) + 1;
    render();
  }, 250 / Number(byId('replay-rate').value));
};
byId('live').onclick = () => {
  stopPlayback();
  replay = undefined;
  byId('seek').disabled = true;
  byId('playback').disabled = true;
  render();
};
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
showWorkspace(location.hash.slice(1));
poll();
