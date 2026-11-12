const CASES = [
  {fault: 'imu', sensor: 'sensor_a', label: 'IMU communication interruption', expect: 'unavailable'},
  {fault: 'regulator', sensor: 'sensor_a', label: 'Shared regulator brownout', expect: 'unavailable'},
];
const DIAGNOSES = [...CASES, {fault: 'watchdog', label: 'Primary computer heartbeat loss'},
  {fault: 'radio', label: 'Ground telemetry outage'}];
const REQUIREMENTS = [
  ['AV-01', 'Detect an IMU timeout', 'A failed SPI reading is unavailable and the 3D component is highlighted.', '3D electronics fault and recovery', 'components'],
  ['AV-02', 'Distinguish power and data faults', 'The mesh traces a nominal-rail SPI failure and a shared-rail brownout to different paths.', 'Flow Mesh fault tracing and replay', 'system-flow'],
  ['AV-03', 'Compare overlapping faults', 'The default campaign records 3 s without a controller in the combined run and 0 s with the first fault alone.', 'Combined-fault campaigns', 'test-bench'],
  ['AV-04', 'Investigate and reproduce a diagnosis', 'Reveal the injected cause after submission and export both evaluation trials with timings.', 'Incident investigation and evidence links', 'investigation'],
  ['AV-05', 'Keep firmware evidence attributable', 'The Zephyr/QEMU run records valid telemetry, degradation, recovery, and stale-link detection.', 'QEMU telemetry and automatic recovery', 'components'],
];
const METRICS = [
  ['no_controller_s', 'Time without a controller (s)'],
  ['missing_samples', 'Missing signal samples vs healthy reference'],
  ['restored_at_s', 'Controller and sample availability restored at (s)'],
  ['recovery_delay_s', 'Time from last fault clearance to restoration (s)'],
];

export function createReliabilityLab({request, read, navigate, openEvidence, download}) {
  const get = id => document.getElementById(id);
  const campaignForm = get('campaign-form');
  const rows = get('campaign-rows');
  const campaignSeek = get('campaign-seek');
  const incidentSeek = get('incident-frame');
  const answer = get('incident-answer');
  let faultNames;
  let campaign;
  let incident;
  let evaluation;
  let matrix;

  function addFault(fault, start = 25, end = 30) {
    const row = document.createElement('div');
    row.className = 'controls campaign-row';
    const field = (title, input) => {
      const label = document.createElement('label');
      label.append(title + ' ', input);
      row.append(label);
      return input;
    };
    const select = field('Fault', document.createElement('select'));
    select.replaceChildren(...Object.entries(faultNames).map(([key, label]) => new Option(label, key)));
    select.value = fault;
    for (const [title, value] of [['Inject (s)', start], ['Recover (s)', end]]) {
      const input = field(title, document.createElement('input'));
      Object.assign(input, {type: 'number', min: '.25', max: '90', step: '.25', required: true, value});
    }
    if (rows.children.length >= 2) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.onclick = () => {
        row.remove();
        get('campaign-add').disabled = false;
      };
      row.append(remove);
    }
    rows.append(row);
    get('campaign-add').disabled = rows.children.length === 4;
  }

  function campaignPlot() {
    const index = Number(campaignSeek.value);
    get('campaign-time').textContent = `${(index / 4).toFixed(2)} s · First: ${campaign.comparison.frames[index].controller} · Full: ${campaign.trial.frames[index].controller}`;
    const canvas = get('campaign-plot');
    canvas.width = canvas.clientWidth || 480;
    canvas.height = canvas.clientHeight || 145;
    const ctx = canvas.getContext('2d');
    const left = 105;
    const width = canvas.width - left - 12;
    for (const [row, name] of ['comparison', 'trial'].entries()) {
      const top = 26 + row * 45;
      ctx.fillStyle = '#c8e5fa';
      ctx.font = '12px system-ui';
      ctx.fillText(row ? 'Full schedule' : 'First fault only', 5, top + 14);
      campaign[name].frames.forEach((frame, tick) => {
        ctx.fillStyle = {primary: '#40cddf', backup: '#f6c078', none: '#ff637b'}[frame.controller];
        ctx.fillRect(left + width * tick / 361, top, Math.ceil(width / 361), 20);
      });
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(left + width * index / 361, 16, 2, 85);
    ctx.fillStyle = '#c8e5fa';
    ctx.fillText('0 s', left, 113);
    ctx.fillText('90 s', canvas.width - 35, 113);
    ctx.fillText('Cyan: primary · Amber: backup · Red: no controller', 5, canvas.height - 10);
  }

  campaignForm.onsubmit = async event => {
    event.preventDefault();
    const run = campaignForm.querySelector('[type=submit]');
    run.disabled = true;
    get('campaign-status').textContent = 'Running healthy reference and fault comparisons…';
    get('campaign-result').hidden = true;
    try {
      const schedule = [...rows.children].map(row => {
        const [fault, start, end] = row.querySelectorAll('select, input');
        return {fault: fault.value, inject_s: Number(start.value), recover_s: Number(end.value)};
      });
      campaign = await request('/api/lab/campaign', {schedule});
      const body = get('campaign-metrics');
      body.replaceChildren(...METRICS.map(([key, label]) => {
        const tr = document.createElement('tr');
        for (const text of [label, campaign.metrics.comparison[key], campaign.metrics.trial[key]]) {
          tr.insertCell().textContent = text ?? 'Not restored within recording';
        }
        return tr;
      }));
      const [start, end] = campaign.window_s;
      get('campaign-status').textContent = `Completed · ${start}–${end} s campaign window · noise seed ${campaign.seed}`;
      campaignSeek.value = start * 4;
      get('campaign-result').hidden = false;
      campaignPlot();
    } catch (error) {
      get('campaign-status').textContent = error.message;
    } finally {
      run.disabled = false;
    }
  };
  campaignSeek.oninput = campaignPlot;
  get('campaign-add').onclick = () => addFault('imu');
  for (const run of ['comparison', 'trial']) {
    get(`campaign-${run}`).onclick = () => openEvidence(campaign[run], Number(campaignSeek.value), 'system-flow');
  }
  get('campaign-export').onclick = () => download('orbit1-campaign.json', JSON.stringify(campaign));

  answer.elements.diagnosis.replaceChildren(new Option('Choose a cause', ''),
    ...DIAGNOSES.map(item => new Option(item.label, item.fault)));

  function renderIncident() {
    const {recording, baseline, item, mode, submitted} = incident;
    const index = Number(incidentSeek.value);
    const frame = recording.frames[index];
    const original = baseline.frames[index];
    const packets = recording.transactions.filter(row => row.t_s === frame.t_s);
    const failed = packets.filter(row => row.result !== 'ok');
    const reading = read(frame, item.sensor);
    get('incident-time').textContent = `${frame.t_s.toFixed(2)} s · ${frame.phase}`;
    get('incident-symptom').textContent = 'Symptom: a previously available motion reading disappears';
    const lines = [
      `Motion reading: ${reading ? reading.map(value => value.toFixed(3)).join(' / ') + ' m/s²' : 'Unavailable'}`,
      `Shared rail: ${frame.rail_v.toFixed(2)} V · healthy reference ${original.rail_v.toFixed(2)} V`,
      `Flight computer: ${frame.controller} · ${frame.health.toLowerCase()}`,
      `Bus activity: ${failed.length} failed of ${packets.length} attempts`,
    ];
    const list = document.createElement('ul');
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }
    if (failed.length && (mode !== 'standard' || submitted)) {
      const first = failed[0];
      const li = document.createElement('li');
      const packet = document.createElement('button');
      packet.textContent = `Inspect first failed attempt · ${first.source} → ${first.destination} · ${first.bus} ${first.result}`;
      packet.onclick = () => openEvidence(recording, index, 'network', first.source, first.bus, true);
      li.append(packet);
      list.append(li);
    }
    get('incident-observations').replaceChildren(list);
    get('incident-links').hidden = mode === 'standard' && !submitted;
    get('incident-first').hidden = mode === 'standard' && !submitted;
  }

  async function startIncident(item, mode) {
    const starters = ['incident-start', 'evaluation-start', 'evaluation-next'].map(get);
    starters.forEach(button => { button.disabled = true; });
    get('incident-status').textContent = 'Preparing a recorded incident…';
    get('incident-case').hidden = true;
    try {
      const {baseline, trial} = await request('/api/lab/scenario', {
        fault: item.fault, sensor: item.sensor, expect: item.expect, inject_s: 25, recover_s: 30,
      });
      const first = trial.frames.findIndex((frame, index) =>
        read(frame, item.sensor) == null && read(baseline.frames[index], item.sensor) != null);
      // Hide injected fault labels in replay until a diagnosis is submitted.
      const recording = {...trial, active_faults: [], events: [], frames: trial.frames.map(frame => ({...frame, faults: []}))};
      incident = {item, mode, baseline, trial, recording, first, started: performance.now(), submitted: false};
      incidentSeek.value = Math.max(0, first - 4);
      answer.reset();
      [...answer.elements].forEach(input => { input.disabled = false; });
      get('incident-result').textContent = '';
      get('evaluation-next').hidden = true;
      get('incident-status').textContent = mode === 'practice' ? 'Practice · evidence links enabled'
        : `Evaluation ${evaluation.results.length + 1} of 2 · ${mode === 'guided' ? 'Flow Mesh and evidence links' : 'standard readouts'}`;
      get('incident-case').hidden = false;
      renderIncident();
    } catch (error) {
      get('incident-status').textContent = error.message;
    } finally {
      starters.forEach(button => { button.disabled = false; });
    }
  }

  get('incident-start').onclick = () => startIncident(CASES[Math.floor(Math.random() * CASES.length)], 'practice');
  get('evaluation-start').onclick = () => {
    const order = Math.random() < .5 ? CASES : [...CASES].reverse();
    const modes = Math.random() < .5 ? ['standard', 'guided'] : ['guided', 'standard'];
    evaluation = {schema: 'orbit1-evaluation-v1', started_at: new Date().toISOString(), order, modes, results: []};
    get('evaluation-export').disabled = true;
    startIncident(order[0], modes[0]);
  };
  get('evaluation-next').onclick = () => startIncident(evaluation.order[1], evaluation.modes[1]);
  get('evaluation-export').onclick = () => {
    const {schema, started_at, results} = evaluation;
    download('orbit1-evaluation.json', JSON.stringify({schema, started_at, results}, null, 2));
  };
  incidentSeek.oninput = renderIncident;
  get('incident-first').onclick = () => { incidentSeek.value = incident.first; renderIncident(); };
  for (const button of document.querySelectorAll('[data-incident-view]')) {
    button.onclick = () => openEvidence(incident.recording, Number(incidentSeek.value),
      button.dataset.incidentView, incident.item.sensor);
  }
  answer.onsubmit = event => {
    event.preventDefault();
    if (!incident || incident.submitted) return;
    const chosen = answer.elements.diagnosis.value;
    if (!chosen) return;
    const correct = chosen === incident.item.fault;
    const seconds = Math.round((performance.now() - incident.started) / 100) / 10;
    incident.recording = incident.trial;
    incident.submitted = true;
    [...answer.elements].forEach(input => { input.disabled = true; });
    get('incident-result').textContent = `${correct ? 'Correct' : 'Incorrect'}. Injected cause: ${incident.item.label}. Diagnosis time: ${seconds.toFixed(1)} s.`;
    if (incident.mode !== 'practice') {
      evaluation.results.push({case: incident.item.fault, interface: incident.mode, diagnosis: chosen, correct, seconds});
      get('evaluation-next').hidden = evaluation.results.length !== 1;
      get('evaluation-export').disabled = evaluation.results.length !== 2;
    }
    renderIncident();
  };

  async function showRequirements() {
    get('requirements-status').textContent = 'Loading saved verification evidence…';
    get('requirements-export').disabled = true;
    try {
      const {verification} = await request('/api/status');
      matrix = REQUIREMENTS.map(([id, requirement, criteria, check, view]) => {
        const evidence = verification.checks.find(item => item.name === check) || null;
        return {id, requirement, criteria, check, view, evidence,
          status: !evidence ? 'Pending' : verification.stale ? 'Stale' : evidence.passed ? 'Pass' : 'Fail'};
      });
      get('requirements-rows').replaceChildren(...matrix.map(item => {
        const row = document.createElement('tr');
        row.insertCell().textContent = `${item.id} · ${item.requirement}`;
        row.insertCell().textContent = item.criteria;
        const cell = row.insertCell();
        const status = document.createElement('strong');
        status.textContent = item.status;
        cell.append(status);
        if (item.evidence) {
          const detail = document.createElement('p');
          detail.textContent = `${item.evidence.detail} · ${item.evidence.timestamp}`;
          cell.append(detail);
        }
        const inspect = document.createElement('button');
        inspect.textContent = 'Open evidence view';
        inspect.onclick = () => {
          if (item.id === 'AV-03') get('campaign-panel').open = true;
          navigate(item.view);
        };
        const actions = row.insertCell();
        actions.append(inspect);
        const incidentMatches = incident?.submitted && (['AV-02', 'AV-04'].includes(item.id) ||
          (item.id === 'AV-01' && incident.item.fault === 'imu'));
        const replayEvidence = item.id === 'AV-03' && campaign
          ? () => openEvidence(campaign.trial, Number(campaignSeek.value), 'system-flow')
          : incidentMatches
            ? () => openEvidence(incident.trial, incident.first, item.view === 'investigation' ? 'system-flow' : item.view, incident.item.sensor)
            : null;
        if (replayEvidence) {
          const replay = document.createElement('button');
          replay.textContent = 'Replay current run';
          replay.onclick = replayEvidence;
          actions.append(replay);
        }
        return row;
      }));
      get('requirements-status').textContent = `${matrix.filter(item => item.status === 'Pass').length} of ${matrix.length} requirements have current passing evidence.`;
      get('requirements-export').disabled = false;
    } catch (error) {
      get('requirements-status').textContent = error.message;
    }
  }
  get('requirements-export').onclick = () => download('orbit1-verification-matrix.json', JSON.stringify(matrix, null, 2));

  return {
    configure(faults) {
      if (faultNames) return;
      faultNames = faults;
      addFault('watchdog', 25, 30);
      addFault('backup', 27, 32);
    },
    showRequirements,
  };
}
