const BUSES = ['SPI', 'CAN', 'I²C', 'UART'];
const POSITIONS = {
  battery: [12, 108], regulator: [12, 200],
  'SPI inputs': [195, 54], 'CAN inputs': [195, 126], 'I²C inputs': [195, 198],
  SPI: [390, 54], CAN: [390, 126], 'I²C': [390, 198], UART: [390, 270],
  primary: [577, 94], backup: [577, 182], radio: [577, 270], ground: [786, 270],
};
const LABELS = {
  battery: 'Battery', regulator: 'Shared rail', primary: 'Primary computer',
  backup: 'Backup computer', radio: 'Telemetry radio', ground: 'Ground delivery',
};
const WIDTH = 164;
const HEIGHT = 46;

export function createFlowMesh({read, navigate, explain}) {
  const get = id => document.getElementById(id);
  const graph = get('mesh-graph');
  const panel = get('flow-mesh');
  const mode = get('mesh-mode');
  const sensor = get('mesh-sensor');
  const nodes = new Map();
  const links = new Map();
  let current;
  let selectedBus = '';
  let lastPulse = '';

  function svg(tag, attrs, parent) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    parent.append(element);
    return element;
  }

  const wires = svg('g', {}, graph);
  function link(from, to, kind = 'data') {
    const [x1, y1] = POSITIONS[from];
    const [x2, y2] = POSITIONS[to];
    const start = x1 + (x1 < x2 ? WIDTH : 0);
    const end = x2 + (x1 < x2 ? 0 : WIDTH);
    const mid = (start + end) / 2;
    const d = from === 'battery'
      ? `M ${x1 + WIDTH / 2} ${y1 + HEIGHT} V ${y2}`
      : `M ${start} ${y1 + HEIGHT / 2} C ${mid} ${y1 + HEIGHT / 2}, ${mid} ${y2 + HEIGHT / 2}, ${end} ${y2 + HEIGHT / 2}`;
    const path = svg('path', {d, class: `mesh-wire ${kind}`, 'data-link': `${from}:${to}`, tabindex: '0',
      role: 'button', 'aria-label': `Inspect ${from} to ${to}`}, wires);
    const pulse = svg('path', {d, class: 'mesh-pulse', pathLength: '100', 'aria-hidden': 'true'}, wires);
    const wire = {path, pulse, kind, from, to};
    path.onclick = () => { if (wire.evidence) explain(wire.evidence); };
    path.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        path.onclick();
      }
    };
    links.set(`${from}:${to}`, wire);
  }
  link('battery', 'regulator', 'power');
  for (const node of ['SPI inputs', 'CAN inputs', 'I²C inputs', 'primary', 'backup', 'radio']) {
    link('regulator', node, 'power');
  }
  for (const bus of BUSES.slice(0, 3)) {
    link(`${bus} inputs`, bus);
    for (const computer of ['primary', 'backup']) link(bus, computer);
  }
  for (const computer of ['primary', 'backup']) link(computer, 'UART');
  link('UART', 'radio');
  link('radio', 'ground', 'delivery');

  for (const [key, [x, y]] of Object.entries(POSITIONS)) {
    const group = svg('g', {transform: `translate(${x} ${y})`, class: 'mesh-node', 'data-node': key}, graph);
    svg('rect', {width: WIDTH, height: HEIGHT, rx: 7}, group);
    const title = svg('text', {x: 9, y: 18, class: 'mesh-title'}, group);
    const status = svg('text', {x: 9, y: 35, class: 'mesh-status'}, group);
    if (key.endsWith(' inputs')) {
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', `Expand ${key}`);
      const expand = () => {
        selectedBus = key.split(' ')[0];
        mode.value = 'sensor';
        render();
        sensor.focus();
      };
      group.onclick = expand;
      group.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          expand();
        }
      };
    }
    nodes.set(key, {group, title, status});
  }

  function render() {
    if (!current || panel.hidden) return;
    const {frame, previous, specs, packets} = current;
    const names = Object.keys(specs).filter(name => !selectedBus || frame.devices[name]?.bus === selectedBus);
    if (sensor.dataset.bus !== selectedBus || sensor.options.length !== names.length) {
      const previous = sensor.value;
      sensor.replaceChildren(...names.map(name => new Option(specs[name][0], name)));
      if (names.includes(previous)) sensor.value = previous;
      else if (!selectedBus && names.includes('sensor_a')) sensor.value = 'sensor_a';
      sensor.dataset.bus = selectedBus;
    }
    const selected = mode.value === 'sensor' ? sensor.value : '';
    const selectedProtocol = frame.devices[selected]?.bus;
    const activePackets = selected ? packets.filter(row => row.source === selected || row.destination === selected) : packets;
    const powerFailed = frame.devices.regulator.health === 'FAILED';
    const delivered = frame.radio_received - (previous?.radio_received ?? frame.radio_received);
    const dropped = frame.radio_dropped - (previous?.radio_dropped ?? frame.radio_dropped);
    const stamp = JSON.stringify([frame.t_s, mode.value, selected, delivered, dropped,
      activePackets.map(row => [row.source, row.destination, row.result])]);
    const changed = stamp !== lastPulse;
    lastPulse = stamp;

    for (const wire of links.values()) {
      const {path, pulse, kind, from, to} = wire;
      const transfer = kind !== 'data' ? [] : activePackets.filter(row => {
        if (from.endsWith(' inputs')) return row.bus === to;
        if (to === 'UART') return row.bus === to && row.source === from;
        if (from === 'UART') return row.bus === from && row.destination === to;
        return row.bus === from && row.destination === to;
      });
      const railBranch = kind === 'power' && (mode.value !== 'sensor' ||
        to === 'regulator' || to === `${selectedProtocol} inputs` || to === selected);
      const branchFailed = to.endsWith(' inputs') || frame.devices[to]?.health === 'FAILED';
      const ground = kind === 'delivery' && !selected;
      const active = transfer.length > 0 || (ground && delivered > 0);
      const failed = transfer.some(row => row.result !== 'ok') ||
        (railBranch && ((to === 'regulator' && frame.devices.battery.health === 'FAILED') ||
          (from === 'regulator' && powerFailed && branchFailed))) ||
        (ground && dropped > 0);
      path.dataset.state = failed ? 'failed' : active ? 'active' : railBranch ? 'powered' : 'idle';
      const failedCount = transfer.filter(row => row.result !== 'ok').length;
      const rail = frame.rail_v.toFixed(2);
      wire.evidence = {
        text: kind === 'power' ? `${from} → ${to}: shared rail at ${rail} V.`
          : kind === 'delivery' ? `Ground link: ${delivered} delivered, ${dropped} dropped in this frame.`
            : `${from} → ${to}: ${failedCount} failed of ${transfer.length} recorded attempts. Rail at ${rail} V.`,
        sensor: selected || '', bus: transfer[0]?.bus || '', failed: failedCount > 0,
      };
      path.dataset.dim = String(mode.value === 'fault' && !failed);
      if (changed) {
        pulse.getAnimations().forEach(animation => animation.cancel());
        if (mode.value !== 'fault' && (transfer.some(row => row.result === 'ok') || (ground && delivered > 0)) &&
            !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          pulse.animate([{strokeDashoffset: '100', opacity: 1}, {strokeDashoffset: '0', opacity: 0}], {duration: 700});
        }
      }
    }

    for (const [key, {group, title, status}] of nodes) {
      const bus = key.split(' ')[0];
      const isGroup = key.endsWith(' inputs');
      const members = isGroup ? Object.keys(specs).filter(name => frame.devices[name]?.bus === bus) : [];
      const failedMembers = members.filter(name => frame.devices[name].health === 'FAILED').length;
      const busPackets = activePackets.filter(row => row.bus === bus);
      const device = frame.devices[key];
      title.textContent = LABELS[key] || key;
      status.textContent = isGroup ? `${members.length} groups · ${failedMembers} failed`
        : BUSES.includes(key) ? `${busPackets.length} attempts · ${busPackets.filter(row => row.result !== 'ok').length} failed`
          : key === 'regulator' ? `${frame.rail_v.toFixed(2)} V`
            : key === 'ground' ? `${frame.radio_received} delivered total`
              : key === frame.controller ? 'Active · ' + frame.health : device?.health;
      group.dataset.failed = String(device?.health === 'FAILED' || (isGroup && failedMembers > 0));
      group.dataset.selected = String(Boolean(selected) && (key === selected || key === selectedProtocol ||
        key === `${selectedProtocol} inputs`));
    }
    const value = selected && read(frame, selected);
    const failures = packets.filter(row => row.result !== 'ok').length;
    get('mesh-detail').textContent = selected
      ? `${specs[selected][0]} · ${frame.devices[selected]?.health || 'Model output'} · ${value?.length ? value.map(v => Number(v).toFixed(3)).join(', ') + ' ' + specs[selected][1] : 'Reading unavailable'} · ${activePackets.length} recorded attempts in this frame. ${specs[selected][3]}`
      : mode.value === 'fault'
        ? `${powerFailed ? 'Shared rail below 4.7 V. Red power paths show affected branches. ' : ''}${failures} failed bus transfers and ${dropped} ground drops recorded in this frame.`
        : 'Select an input group to inspect a reading and isolate its recorded bus activity. Ground delivery shows a running total.';
  }

  function showMesh(visible) {
    panel.hidden = !visible;
    get('flow-summary').hidden = visible;
    get('flow-mesh-button').setAttribute('aria-pressed', String(visible));
    get('flow-summary-button').setAttribute('aria-pressed', String(!visible));
    render();
  }
  get('flow-mesh-button').onclick = () => showMesh(true);
  get('flow-summary-button').onclick = () => showMesh(false);
  get('mesh-inventory').onclick = () => navigate('instrument-array');
  mode.onchange = () => {
    selectedBus = '';
    render();
  };
  sensor.onchange = () => {
    mode.value = 'sensor';
    render();
  };
  return {
    update(frame, previous, specs, packets) {
      current = {frame, previous, specs, packets};
      render();
    },
  };
}
