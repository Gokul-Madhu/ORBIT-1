import {createFlowMesh} from './flow-mesh.js';

const STAGES = [
  ['power-lab', 'Power'], ['sensor-reference', 'Readings'], ['network', 'Bus transfers'],
  ['components', 'Flight computer'], ['fault-center', 'Ground delivery'],
];

export function flowEvidence(frame, specs, transactions, read) {
  const packets = transactions.filter(row => row.t_s === frame.t_s);
  const byBus = new Map();
  for (const row of packets) {
    if (!byBus.has(row.bus)) byBus.set(row.bus, {attempts: 0, failed: 0, wireMs: 0});
    const bus = byBus.get(row.bus);
    bus.attempts++;
    bus.failed += row.result !== 'ok';
    bus.wireMs += row.wire_ms;
  }
  const names = Object.keys(specs);
  const valid = names.filter(name => read(frame, name) != null).length;
  return {
    packets, byBus, valid, total: names.length,
    failed: packets.filter(row => row.result !== 'ok'),
    affected: Object.entries(frame.devices).filter(([, device]) => device.health === 'FAILED').map(([name]) => name),
  };
}

export function createSystemFlow({read, navigate, explain}) {
  const get = id => document.getElementById(id);
  const mesh = createFlowMesh({read, navigate, explain});
  const stageButtons = STAGES.map(([view, title]) => {
    const button = document.createElement('button');
    button.type = 'button';
    const heading = document.createElement('strong');
    const value = document.createElement('span');
    const note = document.createElement('small');
    heading.textContent = title;
    button.append(heading, value, note);
    button.onclick = () => navigate(view);
    get('flow-stages').append(button);
    return {button, value, note};
  });

  for (const [id, fault] of [['flow-sensor-test', 'imu'], ['flow-power-test', 'regulator']]) {
    get(id).onclick = () => {
      const form = get('scenario-form');
      form.elements.fault.value = fault;
      form.elements.sensor.value = 'sensor_a';
      form.elements.expect.value = 'unavailable';
      navigate('test-bench');
    };
  }

  return {
    update(frame, previous, specs, transactions, firmware, replay) {
      if (get('system-flow').hidden) return;
      const evidence = flowEvidence(frame, specs, transactions, read);
      const low = frame.rail_v < 4.7;
      get('flow-time').textContent = `${replay ? 'Replay' : 'Current simulation frame'} · ${frame.t_s.toFixed(2)} s · 250 ms model step`;
      mesh.update(frame, previous, specs, evidence.packets);
      const stages = [
        [`${frame.rail_v.toFixed(2)} V`, `Shared rail · ${frame.load_w.toFixed(2)} W load · 4.7 V operating threshold`, low],
        [`${evidence.valid} / ${evidence.total} available`, 'Recorded sensor and diagnostic groups in this frame', evidence.valid < evidence.total],
        [`${evidence.packets.length} attempts`, `${evidence.failed.length} failed · ${evidence.byBus.size} active buses`, Boolean(evidence.failed.length)],
        [frame.controller === 'none' ? 'No active controller' : frame.controller,
          `${frame.health} · ${frame.watchdog_resets} watchdog resets`, frame.health !== 'NORMAL'],
        [`${frame.radio_received} delivered`, `${frame.radio_dropped} dropped · totals since reset`, frame.radio_dropped > 0],
      ];
      stages.forEach(([value, note, warning], index) => {
        const stage = stageButtons[index];
        stage.value.textContent = value;
        stage.note.textContent = note;
        stage.button.dataset.attention = String(warning);
      });
      const body = get('flow-buses');
      body.replaceChildren(...['SPI', 'CAN', 'I²C', 'UART'].map(name => {
        const item = evidence.byBus.get(name);
        const row = document.createElement('tr');
        for (const value of [name, item?.attempts || 0, item?.failed || 0, (item?.wireMs || 0).toFixed(3)]) {
          row.insertCell().textContent = value;
        }
        return row;
      }));
      const explanation = low
        ? 'The shared rail is below the operating threshold. Unpowered sensors cannot produce new readings.'
        : evidence.failed.length
          ? `${evidence.failed.length} attempted messages failed while rail voltage remained available. Inspect the bus outcomes to identify the affected links.`
          : frame.controller === 'none'
            ? 'Power is available, but the host model has no active flight computer to receive new readings.'
            : 'The rail is above its operating threshold and no failed message attempts were recorded in this frame.';
      get('flow-explanation').textContent = explanation;
      get('flow-affected').textContent = evidence.affected.length
        ? 'Failed components in this frame: ' + evidence.affected.join(', ')
        : 'No components are marked failed in this frame.';
      get('flow-firmware').textContent = `Live QEMU telemetry: ${firmware.status}. Firmware uses its own clock and runs separately from this host data flow.`;
    },
  };
}

