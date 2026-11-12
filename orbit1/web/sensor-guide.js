import {EXTRA_INSTRUMENTS, sensorFamily} from './instrument-layout.js';

const CHANNELS = {
  sensor_a: [['X', 'm/s²', 'Acceleration along the first sensor axis. Noise and the thermal fault can change this reading.'],
    ['Y', 'm/s²', 'Acceleration along the second sensor axis.'],
    ['Z', 'm/s²', 'Acceleration along the third sensor axis.']],
  sensor_b: [['X', 'm/s²', 'Independent acceleration reading used to check sensor A.'],
    ['Y', 'm/s²', 'Backup reading along the second axis.'],
    ['Z', 'm/s²', 'Backup reading along the third axis.']],
  gyro: [['X', 'rad/s', 'Turning rate about the first axis. Zero means no turn about that axis.'],
    ['Y', 'rad/s', 'Turning rate about the second axis.'],
    ['Z', 'rad/s', 'Turning rate about the third axis.']],
  pressure: [['Pressure', 'kPa', 'How strongly the simulated chamber gas pushes. Lower pressure means less push.']],
  temperature: [['Temperature', '°C', 'How warm the electronics are in the power model.']],
  strain_upper: [['Strain', 'µε', 'Stretch per million parts at the upper shell. Compare it with the lower frame at the same time.']],
  strain_lower: [['Strain', 'µε', 'Stretch per million parts at the lower frame. This location has a stronger response to the scripted disturbance.']],
  vibration_upper: [['Vibration', 'm/s² RMS', 'Average shaking intensity at the upper equipment deck.']],
  vibration_lower: [['Vibration', 'm/s² RMS', 'Average shaking intensity at the lower equipment deck. Compare it with the upper deck during the same event.']],
  skin_upper: [['Surface temperature', '°C', 'Simulated temperature of the upper outer shell. It changes more slowly than the vibration signal.']],
  skin_lower: [['Surface temperature', '°C', 'Simulated temperature of the lower outer shell. This location has a different heating response.']],
  sound_upper: [['Sound level', 'dB rel.', 'Relative sound level in the upper bay. The values have a simulation reference.']],
  sound_lower: [['Sound level', 'dB rel.', 'Relative sound level near the lower deck. Compare it with the upper bay at the same time.']],
  heat_upper: [['Heat flow', 'W/m²', 'Synthetic rate of heat entering each square metre of the upper surface.']],
  heat_lower: [['Heat flow', 'W/m²', 'Synthetic rate of heat entering each square metre of the lower surface.']],
  payload_switch: [['Position', 'state', '0 means the deployment indication is open. 1 means the payload has reached its operating milestone.']],
  payload_supply: [['Voltage', 'V', 'Electrical supply at the payload branch. The branch is off before payload initialization.'],
    ['Current', 'A', 'Nominal current drawn by the modeled payload branch while enabled.']],
  gnss: [['X', 'km', 'First coordinate of the calculated orbit position relative to Earth’s center.'],
    ['Y', 'km', 'Second coordinate in the same Earth-centered frame.'],
    ['Z', 'km', 'Third coordinate in the same Earth-centered frame.']],
  monitor: [['Battery', 'V', 'Voltage at the battery terminals while supplying the electronics.'],
    ['Rail', 'V', 'Voltage delivered to the devices. Below 4.7 V, modeled devices stop providing readings.'],
    ['Current', 'A', 'How much current the electronics draw from the battery.']],
};

const HINTS = [
  ['#rocket', 'Explore the rocket', 'Drag to turn it. Click a labeled board to see what it measures or controls.'],
  ['#wave', 'Read the power graph', 'Left to right is time. Up and down is voltage. Click the graph to read a sample.'],
  ['#messages', 'Follow a message', 'Read Source, Destination, Decoded value and Result to see who sent a message and whether it arrived.'],
  ['#seek', 'Look back in time', 'The slider moves through recorded states. Return to live when you want to control the simulation.'],
  ['[data-command=inject]', 'Introduce a practice fault', 'Choose a fault and click Inject. If paused, step once to see the effect.'],
  ['#fault-focus', 'Find the failed component', 'This opens the first failed part in the 3D view.'],
  ['#twin-mode', 'Change your view', 'Switch between the whole rocket, a close-up, the wiring network, and orbit.'],
  ['[data-command=step]', 'Advance one moment', 'One step advances the model by a quarter second and records a new set of readings.'],
  ['#firmware', 'See real firmware messages', 'This status comes from Zephyr running in QEMU. It uses its own clock, separate from the virtual rocket sensors.'],
];

export function createSensorGuide(select, explain) {
  const catalog = document.getElementById('sensor-catalog');
  const title = document.getElementById('guide-title');
  const message = document.getElementById('guide-message');
  const panel = document.getElementById('live-guide');
  const toggle = document.getElementById('guide-toggle');
  const marker = document.getElementById('guide-marker');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const cards = new Map();
  const filter = document.getElementById('sensor-family');
  filter.onchange = () => {
    for (const [name, card] of cards) {
      card.section.hidden = filter.value !== 'all' && sensorFamily(name) !== filter.value;
    }
  };
  let current;
  let selection;
  let hovered;
  let previous;
  const eventNote = document.getElementById('guide-event');

  function showChange(frame, specs, transactions) {
    if (!previous || frame.t_s < previous.t_s) {
      eventNote.textContent = '';
    } else if (previous.rail_v >= 4.7 && frame.rail_v < 4.7) {
      eventNote.textContent = `At ${frame.t_s.toFixed(2)} s the rail fell to ${frame.rail_v.toFixed(2)} V. Devices on that rail stopped providing valid readings.`;
    } else if (previous.rail_v < 4.7 && frame.rail_v >= 4.7) {
      eventNote.textContent = `At ${frame.t_s.toFixed(2)} s the rail recovered above 4.7 V. Check each sensor to see which readings returned.`;
    } else {
      const changed = Object.keys(specs).find(name => {
        const before = previous.devices[name]?.health;
        const now = frame.devices[name]?.health;
        return before !== now && (before === 'FAILED' || now === 'FAILED');
      });
      if (changed) {
        const packet = transactions.findLast(row => row.source === changed && row.t_s === frame.t_s);
        const status = frame.devices[changed].health.toLowerCase();
        const detail = packet ? ` Its ${packet.bus} message result was ${packet.result}.` : '';
        eventNote.textContent = `At ${frame.t_s.toFixed(2)} s, ${specs[changed][0]} became ${status}.${detail}`;
      }
    }
    previous = frame;
  }

  function show() {
    if (panel.hidden || !current) return;
    if (hovered?.hint) {
      title.textContent = hovered.hint[1];
      message.textContent = hovered.hint[2];
      return;
    }
    const name = hovered?.sensor || selection;
    const card = cards.get(name);
    if (!card) {
      title.textContent = 'Explore the electronics';
      message.textContent = 'Point at a sensor, a graph or a control for a short explanation. Select a sensor to see its latest readings.';
      return;
    }
    title.textContent = current.specs[name][0];
    const state = current.frame.devices[name]?.health;
    const result = card.packet;
    if (!card.values) {
      const cause = state === 'OFF' ? 'It is off or has yet to start.'
        : result && result.result !== 'ok' ? `The latest message attempt ended in ${result.result}.`
          : 'Check the component’s power and connection.';
      message.textContent = `No reading in this frame. ${cause}`;
    } else {
      const [channel, unit, meaning] = CHANNELS[name][0];
      message.textContent = `${channel}: ${card.values[0].toFixed(3)} ${unit}. ${meaning}`;
    }
  }

  function point(target) {
    if (!(target instanceof Element)) return;
    const item = target.closest('[data-equipment], [data-component], [data-sensor-help]');
    const sensor = item?.dataset.equipment || item?.dataset.component || item?.dataset.sensorHelp;
    const hint = HINTS.find(([selector]) => target.closest(selector));
    if (sensor && current?.specs[sensor]) {
      const card = cards.get(sensor);
      const packet = card?.packet;
      explain({
        text: `${current.specs[sensor][0]} at ${current.frame.t_s.toFixed(2)} s · ${current.frame.rail_v.toFixed(2)} V rail.`,
        sensor, bus: packet?.bus, failed: packet?.t_s === current.frame.t_s && packet.result !== 'ok',
      });
    }
    hovered = CHANNELS[sensor] ? {sensor} : hint ? {hint} : undefined;
    marker.hidden = panel.hidden || !hovered || reducedMotion.matches;
    show();
  }

  document.addEventListener('pointerover', event => point(event.target));
  document.addEventListener('focusin', event => point(event.target));
  document.addEventListener('pointermove', event => {
    if (!marker.hidden) marker.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
  }, {passive: true});
  document.addEventListener('pointerleave', () => { marker.hidden = true; hovered = undefined; show(); });
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    marker.hidden = true;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.textContent = panel.hidden ? 'Show live guide' : 'Hide live guide';
    show();
  };

  return {
    update(frame, specs, transactions, read, selected) {
      showChange(frame, specs, transactions);
      current = {frame, specs};
      selection = selected;
      for (const [name, spec] of Object.entries(specs)) {
        if (EXTRA_INSTRUMENTS[name] && !CHANNELS[name]) {
          CHANNELS[name] = [['Reading', spec[1], EXTRA_INSTRUMENTS[name][5]]];
        }
        if (!CHANNELS[name]) continue;
        let card = cards.get(name);
        if (!card) {
          const section = document.createElement('article');
          const button = document.createElement('button');
          button.textContent = spec[0];
          button.dataset.sensorHelp = name;
          button.onclick = () => select(name);
          const status = document.createElement('p');
          const readings = CHANNELS[name].map(([channel, unit, meaning]) => {
            const row = document.createElement('p');
            const value = document.createElement('strong');
            row.append(value, document.createTextNode(` — ${meaning}`));
            section.append(row);
            return {value, channel, unit};
          });
          section.prepend(button, status);
          catalog.append(section);
          card = {section, status, readings};
          cards.set(name, card);
        }
        card.values = read(frame, name);
        card.packet = transactions.findLast(row => row.source === name);
        card.section.dataset.health = frame.devices[name]?.health || 'OFF';
        const link = name === 'monitor' ? 'Direct power model readings'
          : card.packet ? `${card.packet.bus} · ${card.packet.result} at ${card.packet.t_s.toFixed(2)} s`
            : 'No message recorded for this sensor';
        card.status.textContent = `${card.section.dataset.health} · ${link}`;
        card.readings.forEach(({value, channel, unit}, i) => {
          const number = card.values?.[i];
          value.textContent = `${channel}: ${number == null ? 'Unavailable' : number.toFixed(3) + ' ' + unit}`;
        });
      }
      show();
    },
  };
}
