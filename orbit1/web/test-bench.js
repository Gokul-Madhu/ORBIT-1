import {RocketTwin} from './twin.js';

export function readingTrail(recording, index, sensor, read) {
  const frame = recording.frames[index];
  const present = read(frame, sensor) != null;
  let first = index;
  while (!present && first > 0 && read(recording.frames[first - 1], sensor) == null &&
    recording.frames[first - 1].devices[sensor].health === frame.devices[sensor].health) first--;
  const packet = recording.transactions.findLast(row => row.source === sensor && row.t_s <= frame.t_s);
  const state = frame.devices[sensor];
  const steps = [
    `Power: ${frame.rail_v.toFixed(2)} V on the shared rail. The modeled operating threshold is 4.7 V.`,
    `Component: ${state.health.toLowerCase()}, ${state.powered ? 'powered' : 'unpowered'} at ${frame.t_s.toFixed(2)} s.`,
    packet ? `Message: ${packet.source} → ${packet.destination} over ${packet.bus} at ${packet.t_s.toFixed(2)} s. Result: ${packet.result}.`
      : 'Message: no sensor packet is recorded for this frame or earlier.',
  ];
  if (present) steps.push('Outcome: a valid reading is available in this frame.');
  else if (state.health === 'OFF') steps.push('Outcome: the sensor has not started or is switched off.');
  else if (!state.powered && frame.rail_v < 4.7) steps.push('Outcome: the rail is below the operating threshold, so the sensor cannot provide a reading.');
  else if (packet?.t_s === frame.t_s && packet.result !== 'ok') steps.push('Outcome: this message did not deliver a valid reading to the computer.');
  else steps.push('Outcome: the reading is unavailable. The recorded evidence does not identify a specific message failure.');
  return {steps, first, present};
}

export function createTestBench({request, read, openReplay, download}) {
  const get = id => document.getElementById(id);
  const form = get('scenario-form');
  const views = new Map();
  let result;
  let show3d = false;

  function plot(index) {
    const canvas = get('comparison-plot');
    canvas.width = canvas.clientWidth || 480;
    canvas.height = canvas.clientHeight || 180;
    const ctx = canvas.getContext('2d');
    const left = 36;
    const bottom = canvas.height - 24;
    const width = canvas.width - left - 12;
    const height = bottom - 15;
    const y = volts => bottom - volts / 6 * height;
    ctx.fillStyle = '#c0d7ea';
    ctx.font = '12px system-ui';
    for (const volts of [0, 2, 4.7, 6]) {
      ctx.strokeStyle = '#29465c';
      ctx.beginPath();
      ctx.moveTo(left, y(volts));
      ctx.lineTo(left + width, y(volts));
      ctx.stroke();
      ctx.fillText(volts + ' V', 1, y(volts) + 4);
    }
    for (const [name, color] of [['baseline', '#65dfff'], ['trial', '#ffc174']]) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      result[name].frames.forEach((frame, i) => {
        const x = left + width * i / 360;
        if (i) ctx.lineTo(x, y(frame.rail_v)); else ctx.moveTo(x, y(frame.rail_v));
      });
      ctx.stroke();
    }
    const cursor = left + width * index / 360;
    ctx.strokeStyle = '#e8f5ff';
    ctx.beginPath();
    ctx.moveTo(cursor, 15);
    ctx.lineTo(cursor, bottom);
    ctx.stroke();
    ctx.fillText('Cyan baseline · amber trial · 0–90 simulation seconds', left, canvas.height - 6);
  }

  function render() {
    if (!result) return;
    const index = Number(get('comparison-seek').value);
    const sensor = result.scenario.sensor;
    get('comparison-time').textContent = `${(index / 4).toFixed(2)} s`;
    plot(index);
    for (const name of ['baseline', 'trial']) {
      const recording = result[name];
      const frame = recording.frames[index];
      const value = read(frame, sensor);
      const rows = recording.transactions.filter(row => row.t_s === frame.t_s && row.source === sensor);
      const values = Array.isArray(value) ? value.map(v => v.toFixed(3)).join(' / ')
        : value == null ? 'Unavailable' : String(value);
      get(`comparison-${name}`).textContent = [
        `Rail: ${frame.rail_v.toFixed(2)} V · ${sensor}: ${frame.devices[sensor].health}`,
        `Reading: ${values} · ${recording.sensor_specs[sensor][1]}`,
        ...rows.map(row => `${row.bus} ${row.field || ''} → ${row.destination}: ${row.result}`),
        ...(rows.length ? [] : ['No sensor packet at this timestamp']),
      ].join('\n');
      if (show3d) views.get(name)?.setFrame(frame, recording.transactions);
    }
  }

  form.onsubmit = async event => {
    event.preventDefault();
    const status = get('scenario-status');
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    status.textContent = 'Running two simulations…';
    try {
      const fields = new FormData(form);
      const config = Object.fromEntries(fields);
      config.inject_s = Number(config.inject_s);
      config.recover_s = Number(config.recover_s);
      result = await request('/api/lab/scenario', config);
      get('scenario-result').hidden = false;
      get('comparison-seek').value = result.checks.find(check => !check.passed)?.frame ?? config.inject_s * 4;
      get('scenario-checks').replaceChildren(...result.checks.map(check => {
        const li = document.createElement('li');
        const jump = document.createElement('button');
        jump.textContent = `${check.passed ? 'PASS' : 'FAIL'} · ${check.label}`;
        jump.onclick = () => { get('comparison-seek').value = check.frame; render(); };
        li.append(jump);
        return li;
      }));
      status.textContent = `${result.checks.filter(check => check.passed).length} of ${result.checks.length} expectations passed. Select a result to inspect its frame.`;
      for (const view of views.values()) view.focus(result.scenario.sensor, 'pcb');
      render();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  get('comparison-seek').oninput = render;
  get('comparison-3d').onclick = () => {
    show3d = !show3d;
    try {
      for (const name of ['baseline', 'trial']) {
        const canvas = get(`comparison-${name}-3d`);
        canvas.hidden = !show3d;
        if (show3d && !views.has(name)) {
          const view = new RocketTwin(canvas, () => {});
          view.configure({opacity: .34, exploded: 0, shellVisible: true, quality: 'low'});
          view.focus(result.scenario.sensor, 'pcb');
          views.set(name, view);
        }
      }
      get('comparison-3d').textContent = show3d ? 'Hide 3D views' : 'Show both 3D views';
      render();
    } catch {
      show3d = false;
      for (const name of ['baseline', 'trial']) get(`comparison-${name}-3d`).hidden = true;
      get('scenario-status').textContent = 'WebGL comparison is unavailable. Graphs and recorded frames remain available.';
    }
  };
  for (const name of ['baseline', 'trial']) {
    get(`replay-${name}`).onclick = () => openReplay(result[name], Number(get('comparison-seek').value));
  }
  get('scenario-export').onclick = () => download('orbit1-scenario.json', JSON.stringify(result), 'application/json');
  get('firmware-bench-load').onclick = async () => {
    const output = get('firmware-bench-report');
    try {
      const evidence = await request('/api/lab/firmware-bench');
      output.textContent = [
        `${evidence.passed ? 'PASS' : 'FAIL'} · ${evidence.source} · stale after ${evidence.timeout_ms} ms`,
        ...evidence.trace.map(row => `${row.uptime_ms} ms · ${row.state} · ${row.state === 'VALID' ? row.value : 'no valid value'}`),
      ].join('\n');
    } catch (error) {
      output.textContent = error.message;
    }
  };
  return {
    configure(data) {
      if (form.elements.fault.options.length) return;
      for (const [key, label] of Object.entries(data.available_faults)) form.elements.fault.add(new Option(label, key));
      for (const [key, spec] of Object.entries(data.sensor_specs)) form.elements.sensor.add(new Option(spec[0], key));
      form.elements.fault.value = 'imu';
      form.elements.sensor.value = 'sensor_a';
    },
  };
}
