import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {EXTRA_INSTRUMENTS} from './instrument-layout.js';

const HEALTH = {HEALTHY: 0x48efb2, WARNING: 0xffbe63, FAILED: 0xff294d, OFF: 0x627991};
const BUS = {'SPI': 0x43e8ff, 'CAN': 0xffb45e, 'I²C': 0xbb95ff, 'UART': 0x62ed9a, 'DC': 0xffdf82};
const LAYOUT = {
  primary: [-.56, 1.2, .43], backup: [.54, 1.2, .43],
  sensor_a: [-.63, .45, .5], sensor_b: [.62, .45, .5], gyro: [0, .45, .64],
  pressure: [-.66, -.3, .48], temperature: [0, -.3, .64], gnss: [.63, -.3, .48],
  regulator: [-.57, -1.08, .48], monitor: [.58, -1.08, .48],
  radio: [-.56, 1.98, .47], payload: [.53, 2.65, .48],
  battery: [0, -1.95, .51], checkout_load: [0, -2.68, .48],
  strain_upper: [-.70, 2.62, .54], skin_upper: [.69, 2.20, .57],
  vibration_upper: [.55, 1.75, .58], strain_lower: [-.70, -1.59, .52],
  vibration_lower: [.65, -1.64, .53], skin_lower: [.66, -2.29, .54],
  sound_upper: [-.16, 1.55, .79], sound_lower: [-.37, -2.48, .64],
  heat_upper: [-.48, 2.98, .52], heat_lower: [.50, -2.77, .61],
  payload_switch: [.05, 2.92, .76], payload_supply: [.07, 2.38, .76],
};
const plate = new THREE.MeshStandardMaterial({color: 0x0a5049, metalness: .28, roughness: .5});
const chip = new THREE.MeshStandardMaterial({color: 0x17202d, metalness: .42, roughness: .37});
const copper = new THREE.MeshStandardMaterial({color: 0xc6a065, metalness: .72, roughness: .34});
const aluminum = new THREE.MeshStandardMaterial({color: 0xb9c6d3, metalness: .72, roughness: .31});
const panelPaint = new THREE.MeshStandardMaterial({color: 0xe9edf1, metalness: .21, roughness: .29,
  side: THREE.DoubleSide});
const darkCoat = new THREE.MeshStandardMaterial({color: 0x25374a, metalness: .52, roughness: .39});
const accentCoat = new THREE.MeshStandardMaterial({color: 0xd48c48, metalness: .32, roughness: .34});
const boardGeometry = new THREE.BoxGeometry(.58, .40, .038);
const MODULE_TAGS = {
  primary: 'FC / A', backup: 'FC / B', sensor_a: 'IMU / A', sensor_b: 'ACC / B',
  gyro: 'GYRO', pressure: 'PRESS', temperature: 'TEMP', gnss: 'GNSS',
  regulator: 'REG', monitor: 'V / I', radio: 'RADIO', payload: 'PAYLOAD',
  battery: 'BATTERY', checkout_load: 'LOAD',
  strain_upper: 'STRAIN / U', strain_lower: 'STRAIN / L',
  vibration_upper: 'VIB / U', vibration_lower: 'VIB / L',
  skin_upper: 'SKIN / U', skin_lower: 'SKIN / L',
  sound_upper: 'MIC / U', sound_lower: 'MIC / L', heat_upper: 'HEAT / U', heat_lower: 'HEAT / L',
  payload_switch: 'LIMIT', payload_supply: 'PAY PWR',
};
for (const [name, [, , , tag, coordinates]] of Object.entries(EXTRA_INSTRUMENTS)) {
  LAYOUT[name] = coordinates;
  MODULE_TAGS[name] = tag;
}
const ceramic = new THREE.MeshStandardMaterial({color: 0xe2d6b6, roughness: .68});
const blueBoard = new THREE.MeshStandardMaterial({color: 0x124b82, roughness: .53});

function moduleLabel(group, name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#081a2b';
  ctx.fillRect(4, 5, 248, 70);
  ctx.strokeStyle = '#39b9eb';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 5, 248, 70);
  ctx.fillStyle = '#e0f4ff';
  ctx.font = '600 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(MODULE_TAGS[name], 128, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, transparent: true,
    depthTest: false, toneMapped: false}));
  label.position.set(0, .29, .11);
  label.scale.set(.49, .153, 1);
  label.renderOrder = 8;
  group.add(label);
  return label;
}

function mesh(parent, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function box(parent, size, material, x, y, z) {
  return mesh(parent, new THREE.BoxGeometry(...size), material, x, y, z);
}

function trace(parent, coordinates, color) {
  const points = coordinates.map(point => new THREE.Vector3(...point));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({color, transparent: true, opacity: .8, toneMapped: false}));
  parent.add(line);
  return line;
}

function studioEnvironment() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const base = context.createLinearGradient(0, 0, 0, 128);
  base.addColorStop(0, '#b3c8df');
  base.addColorStop(.55, '#425363');
  base.addColorStop(1, '#1b222a');
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 128);
  context.fillStyle = '#ffffff';
  context.fillRect(28, 16, 51, 64);
  context.fillStyle = '#c3deff';
  context.fillRect(164, 9, 18, 78);
  context.fillStyle = '#edd9ba';
  context.fillRect(219, 35, 24, 43);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function displayPlatform(parent) {
  const platform = new THREE.Group();
  mesh(platform, new THREE.CylinderGeometry(1.85, 1.94, .12, 64), darkCoat, 0, -3.86, 0);
  mesh(platform, new THREE.CylinderGeometry(1.72, 1.72, .026, 64), aluminum, 0, -3.79, 0);
  const groove = mesh(platform, new THREE.TorusGeometry(1.48, .012, 8, 64), darkCoat, 0, -3.77, 0);
  groove.rotation.x = Math.PI / 2;
  parent.add(platform);
  return platform;
}

function addPropulsionDisplay(parent) {
  // Shapes are visual placeholders in scene units. They have no simulation outputs.
  const group = new THREE.Group();
  const nozzleFinish = new THREE.MeshStandardMaterial({
    color: 0x454e57, metalness: .8, roughness: .42, side: THREE.DoubleSide,
  });
  const bell = new THREE.LatheGeometry([
    new THREE.Vector2(.25, -.41), new THREE.Vector2(.22, -.34),
    new THREE.Vector2(.175, -.24), new THREE.Vector2(.13, -.12),
    new THREE.Vector2(.11, 0),
  ], 32);
  const mount = mesh(group, new THREE.CylinderGeometry(.73, .71, .12, 48), darkCoat, 0, -3.08, 0);
  mount.name = 'Illustrative aft mounting deck';
  for (const [x, z] of [[0, .34], [-.30, -.19], [.30, -.19]]) {
    mesh(group, new THREE.CylinderGeometry(.16, .13, .18, 24), aluminum, x, -3.15, z);
    mesh(group, bell, nozzleFinish, x, -3.23, z).name = 'Illustrative engine bell';
    const rim = mesh(group, new THREE.TorusGeometry(.25, .014, 8, 32), aluminum, x, -3.64, z);
    rim.rotation.x = Math.PI / 2;
  }
  for (const angle of [Math.PI / 2, -Math.PI / 2]) {
    const pod = new THREE.Group();
    box(pod, [.29, .39, .135], darkCoat, 0, 0, .025).name = 'Illustrative attitude-thruster pod';
    for (const y of [-.093, .093]) {
      const port = mesh(pod, new THREE.CylinderGeometry(.070, .048, .07, 18, 1, true), aluminum, 0, y, .115);
      port.rotation.x = Math.PI / 2;
      mesh(pod, new THREE.CircleGeometry(.05, 18), chip, 0, y, .101);
    }
    pod.position.set(Math.sin(angle) * .96, 2.27, Math.cos(angle) * .96);
    pod.rotation.y = angle;
    group.add(pod);
  }
  parent.add(group);
  return group;
}

function addExteriorMarkings(parent) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#152638';
  ctx.textAlign = 'center';
  ctx.font = 'bold 76px sans-serif';
  ctx.fillText('ORBIT–1', 256, 110);
  ctx.fillStyle = '#9c562c';
  ctx.fillRect(72, 135, 368, 7);
  ctx.fillStyle = '#283d50';
  ctx.font = '28px monospace';
  ctx.fillText('SIMULATION ARTICLE', 256, 195);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mark = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false, toneMapped: false});
  mesh(parent, new THREE.CylinderGeometry(1.001, 1.001, .52, 28, 1, true, -.58, 1.16),
    mark, 0, 1.70, 0);
  const hatch = [[-.30, -.20], [.30, -.20], [.34, -.16], [.34, .39], [.30, .43],
    [-.30, .43], [-.34, .39], [-.34, -.16], [-.30, -.20]];
  const pointOnHull = (angle, y) => [1.006 * Math.sin(angle), y, 1.006 * Math.cos(angle)];
  const outline = [pointOnHull(...hatch[0])];
  for (let i = 1; i < hatch.length; i++) {
    for (let step = 1; step <= 8; step++) {
      const t = step / 8;
      outline.push(pointOnHull(THREE.MathUtils.lerp(hatch[i - 1][0], hatch[i][0], t),
        THREE.MathUtils.lerp(hatch[i - 1][1], hatch[i][1], t)));
    }
  }
  trace(parent, outline, 0x4e6575);
  for (const y of [-.17, .40]) {
    for (const angle of [-.29, -.09, .09, .29]) {
      mesh(parent, new THREE.SphereGeometry(.018, 8, 6), darkCoat, ...pointOnHull(angle, y));
    }
  }
}

function pcb(name) {
  const group = new THREE.Group();
  if (EXTRA_INSTRUMENTS[name]) {
    auxiliarySensor(group, name);
    group.scale.setScalar(.60);
  } else if (/^(strain|vibration|skin|sound|heat|payload)_(upper|lower|switch|supply)$/.test(name)) {
    locationSensor(group, name);
  } else if (['sensor_a', 'sensor_b', 'gyro', 'pressure', 'temperature', 'gnss', 'monitor', 'regulator'].includes(name)) {
    instrument(group, name);
  } else {
    controllerBoard(group, name);
  }
  const indicator = new THREE.MeshBasicMaterial({color: HEALTH.OFF});
  mesh(group, new THREE.SphereGeometry(.022, 10, 8), indicator, .24, .105, .078);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.62, .44, .24)),
    new THREE.LineBasicMaterial({color: HEALTH.OFF, transparent: true, toneMapped: false}));
  outline.position.z = .07;
  group.add(outline);
  group.userData = {component: name, indicator, outline, label: moduleLabel(group, name)};
  return group;
}

function auxiliarySensor(group, name) {
  box(group, [.35, .24, .025], blueBoard, 0, 0, .015).name = 'Instrument board';
  box(group, [.14, .05, .043], darkCoat, 0, -.125, .036).name = 'Harness connector';
  const kind = name.split('_')[0];
  if (['supply', 'current', 'loss', 'rail', 'battery', 'load'].includes(kind)) {
    box(group, [.15, .045, .032], copper, 0, .055, .047).name = 'Power measurement element';
    for (const x of [-.11, .11]) {
      box(group, [.048, .09, .047], aluminum, x, .047, .054).name = 'Sense terminal';
    }
    box(group, [.076, .066, .03], chip, 0, -.036, .043).name = 'Measurement interface';
  } else if (['usage', 'link', 'errors', 'age', 'delta', 'residual'].includes(kind)) {
    box(group, [.16, .12, .056], chip, -.027, .028, .055).name = 'Diagnostic counter package';
    box(group, [.065, .096, .042], aluminum, .112, .04, .055).name = 'Telemetry interface';
    for (const x of [-.083, -.047, -.011, .025]) {
      trace(group, [[x, -.03, .031], [x, -.071, .031], [x * .6, -.101, .031]], 0x52bc9f);
    }
  } else if (kind === 'air' || kind === 'humidity') {
    box(group, [.17, .13, .07], ceramic, 0, .03, .06).name = 'Vented sensing housing';
    for (const x of [-.048, -.016, .016, .048]) {
      box(group, [.012, .084, .01], darkCoat, x, .03, .10);
    }
  } else if (kind === 'pressure') {
    const housing = mesh(group, new THREE.CylinderGeometry(.084, .10, .08, 24), aluminum, 0, .028, .061);
    housing.rotation.x = Math.PI / 2;
    housing.name = 'Pressure transducer housing';
    mesh(group, new THREE.TorusGeometry(.044, .011, 8, 24), copper, 0, .028, .105).name = 'Pressure inlet';
  } else if (kind === 'light') {
    const housing = mesh(group, new THREE.CylinderGeometry(.075, .09, .055, 20), aluminum, 0, .028, .051);
    housing.rotation.x = Math.PI / 2;
    housing.name = 'Photodiode housing';
    mesh(group, new THREE.SphereGeometry(.053, 14, 8), blueBoard, 0, .028, .078).name = 'Optical window';
  } else if (kind === 'gap') {
    for (const x of [-.086, .086]) {
      box(group, [.09, .12, .067], aluminum, x, .025, .059).name = 'Gap reference face';
    }
  } else if (kind === 'temp') {
    const probe = mesh(group, new THREE.CapsuleGeometry(.026, .14, 5, 10), copper, 0, .028, .052);
    probe.rotation.z = Math.PI / 2;
    probe.name = 'Contact temperature probe';
  } else {
    box(group, [.15, .13, .06], kind === 'mag' ? ceramic : aluminum, 0, .027, .057).name =
      kind === 'mag' ? 'Magnetic field package' : 'Shock indicator package';
    for (const x of [-.092, .092]) {
      for (const y of [-.015, .028, .071]) box(group, [.037, .012, .009], copper, x, y, .035);
    }
  }
}

function locationSensor(group, name) {
  if (name.startsWith('sound_')) {
    box(group, [.26, .21, .032], blueBoard, 0, 0, .015).name = 'Microphone carrier';
    const can = mesh(group, new THREE.CylinderGeometry(.083, .083, .065, 24), aluminum, 0, .025, .059);
    can.rotation.x = Math.PI / 2;
    can.name = 'Microphone capsule';
    for (const x of [-.027, 0, .027]) {
      for (const y of [-.027, 0, .027]) {
        mesh(group, new THREE.CircleGeometry(.007, 10), chip, x, y + .025, .093);
      }
    }
  } else if (name.startsWith('heat_')) {
    box(group, [.25, .18, .024], darkCoat, 0, .015, .018).name = 'Heat-flux gauge carrier';
    mesh(group, new THREE.CircleGeometry(.069, 28), ceramic, 0, .015, .032).name = 'Heat-flow sensing face';
    mesh(group, new THREE.TorusGeometry(.061, .007, 8, 24), copper, 0, .015, .039);
  } else if (name === 'payload_switch') {
    box(group, [.22, .12, .075], darkCoat, 0, 0, .047).name = 'Limit switch housing';
    box(group, [.19, .02, .025], aluminum, -.015, .081, .071).rotation.z = -.28;
    mesh(group, new THREE.SphereGeometry(.025, 10, 8), aluminum, .077, .054, .071).name = 'Switch lever roller';
  } else if (name === 'payload_supply') {
    box(group, [.28, .20, .033], plate, 0, 0, .016).name = 'Branch measurement board';
    box(group, [.13, .033, .023], copper, 0, .04, .043).name = 'Current shunt';
    for (const x of [-.103, .103]) box(group, [.047, .083, .039], aluminum, x, .04, .049).name = 'Supply terminal';
  } else if (name.startsWith('strain_')) {
    box(group, [.31, .18, .022], ceramic, 0, 0, .015).name = 'Bonded gauge backing';
    const pattern = [];
    for (let i = 0; i < 8; i++) {
      const x = -.105 + i * .03;
      pattern.push([x, i % 2 ? .053 : -.054, .033], [x, i % 2 ? -.054 : .053, .033]);
    }
    trace(group, pattern, 0xc47937).name = 'Illustrative strain element';
  } else if (name.startsWith('vibration_')) {
    mesh(group, new THREE.CylinderGeometry(.13, .16, .04, 6), darkCoat, 0, -.025, .027).rotation.x = Math.PI / 2;
    const body = mesh(group, new THREE.CylinderGeometry(.087, .087, .12, 24), aluminum, 0, -.025, .077);
    body.rotation.x = Math.PI / 2;
    body.name = 'Stud-mounted vibration sensor housing';
    mesh(group, new THREE.TorusGeometry(.079, .008, 6, 24), darkCoat, 0, -.025, .138);
  } else {
    box(group, [.27, .13, .028], aluminum, 0, .02, .018).name = 'Surface contact plate';
    const probe = mesh(group, new THREE.CapsuleGeometry(.025, .13, 5, 12), copper, 0, .025, .047);
    probe.rotation.z = Math.PI / 2;
    probe.name = 'Surface temperature probe';
    trace(group, [[-.08, .025, .055], [-.12, -.06, .047], [-.09, -.14, .04]], 0xe67d56);
  }
  box(group, [.13, .043, .037], darkCoat, 0, -.15, .04).name = 'Harness connector';
}

function instrument(group, name) {
  const base = name === 'temperature' ? [.27, .31, .035]
    : name === 'sensor_b' ? [.31, .31, .035] : [.47, .35, .035];
  box(group, base, ['gnss', 'gyro'].includes(name) ? blueBoard : plate, 0, 0, 0).name = 'Module carrier';
  box(group, [.15, .045, .05], aluminum, 0, -.14, .045).name = 'Harness connector';
  box(group, [.115, .029, .018], chip, 0, -.155, .068).name = 'Connector insert';
  for (let pin = -2; pin <= 2; pin++) {
    box(group, [.009, .014, .01], copper, pin * .019, -.155, .08);
  }
  for (const x of [-base[0] * .39, base[0] * .39]) {
    for (const y of [-.105, .115]) {
      mesh(group, new THREE.TorusGeometry(.016, .004, 6, 12), aluminum, x, y, .022).name = 'Mounting eyelet';
    }
  }
  if (name === 'pressure') {
    const port = mesh(group, new THREE.CylinderGeometry(.096, .096, .085, 28), aluminum, 0, .035, .063);
    port.rotation.x = Math.PI / 2;
    port.name = 'Pressure port housing';
    mesh(group, new THREE.TorusGeometry(.047, .013, 8, 24), copper, 0, .035, .112).name = 'Pressure inlet';
    mesh(group, new THREE.CircleGeometry(.035, 18), chip, 0, .035, .113).name = 'Pressure inlet aperture';
  } else if (name === 'temperature') {
    const probe = mesh(group, new THREE.CapsuleGeometry(.033, .18, 5, 12), aluminum, 0, .045, .068);
    probe.rotation.z = -.30;
    probe.name = 'Temperature probe';
    trace(group, [[-.07, -.13, .06], [-.07, -.07, .06], [-.03, -.04, .06]], 0xfab561);
    trace(group, [[-.045, -.13, .06], [-.045, -.08, .06], [-.011, -.046, .06]], 0xe76b65);
  } else if (name === 'gnss') {
    box(group, [.23, .20, .065], ceramic, -.055, .04, .057).name = 'Ceramic patch antenna';
    box(group, [.13, .115, .01], copper, -.055, .04, .096).name = 'Patch metallization';
    box(group, [.073, .105, .034], chip, .137, -.015, .049).name = 'Receiver package';
  } else if (name === 'regulator') {
    box(group, [.15, .13, .07], chip, -.095, .038, .064).name = 'Regulator package';
    for (let i = -2; i <= 2; i++) {
      box(group, [.018, .14, .061], aluminum, -.095 + i * .035, .043, .112).name = 'Heat sink fin';
    }
    mesh(group, new THREE.TorusGeometry(.057, .022, 10, 20), copper, .125, .03, .065).name = 'Inductor';
  } else if (name === 'monitor') {
    box(group, [.27, .049, .039], copper, 0, .065, .056).name = 'Current shunt';
    for (const x of [-.15, .15]) box(group, [.048, .105, .043], aluminum, x, .06, .054).name = 'Sense terminal';
    box(group, [.095, .066, .033], chip, 0, -.036, .049).name = 'Voltage sense interface';
  } else {
    const sizes = {sensor_a: [.19, .15, .058], sensor_b: [.13, .13, .038], gyro: [.14, .17, .058]};
    const packageMesh = box(group, sizes[name], name === 'gyro' ? ceramic : chip, 0, .02, .052);
    packageMesh.name = name === 'gyro' ? 'Angular-rate MEMS' : 'Accelerometer MEMS';
    if (name === 'sensor_a') {
      box(group, [.11, .087, .012], aluminum, 0, .02, .087).name = 'MEMS package lid';
      trace(group, [[.11, -.035, .046], [.17, -.035, .046], [.17, .04, .046]], 0x55edcb);
    }
    for (const sign of [-1, 1]) {
      for (let pin = -1; pin <= 1; pin++) {
        box(group, [.042, .014, .012], copper, sign * (sizes[name][0] / 2 + .013), .02 + pin * .037, .036);
      }
    }
  }
}

function controllerBoard(group, name) {
  const substrate = mesh(group, boardGeometry, plate, 0, 0, 0);
  substrate.name = 'PCB substrate';
  const processor = box(group, [.18, .15, .045], chip, -.02, .025, .044);
  processor.name = ['primary', 'backup'].includes(name) ? 'Processor package' : 'Sensor / interface package';
  const memory = box(group, [.09, .10, .026], chip, .14, .04, .037);
  memory.name = 'Interface package';
  const oscillator = box(group, [.06, .043, .025], aluminum, -.19, .08, .037);
  oscillator.name = 'Reference oscillator';
  const connector = box(group, [.38, .065, .055], aluminum, 0, -.151, .048);
  connector.name = 'Bus / power connector';
  for (let pin = 0; pin < 8; pin++) {
    const x = -.15 + pin * .043;
    box(group, [.014, .032, .012], copper, x, -.156, .083);
    trace(group, [[x, -.115, .025], [x, -.082 + (pin % 3) * .018, .025],
      [x * .48, -.036, .025]], 0x50a594);
  }
  for (const x of [-.24, .24]) {
    for (const y of [-.145, .145]) {
      const hole = mesh(group, new THREE.TorusGeometry(.023, .004, 6, 14), copper, x, y, .023);
      hole.name = 'Mounting hole';
    }
  }
  for (const x of [-.19, -.13, .16, .21]) {
    box(group, [.029, .055, .021], copper, x, -.054, .034);
  }
  if (name === 'battery') {
    for (let i = -1; i <= 1; i++) {
      mesh(group, new THREE.CylinderGeometry(.068, .068, .28, 20), aluminum, i * .15, 0, .095);
      mesh(group, new THREE.CylinderGeometry(.031, .031, .015, 14), copper, i * .15, .145, .095);
    }
  }
  if (['radio', 'gnss'].includes(name)) {
    box(group, [.15, .115, .018], copper, -.02, .11, .10).name = 'Illustrative antenna';
  }
  if (name === 'pressure') {
    mesh(group, new THREE.TorusGeometry(.05, .009, 10, 24), aluminum, -.02, .025, .076);
  }
}

function shell(parent, material, cutaway) {
  const start = cutaway ? Math.PI * .43 : 0;
  const span = cutaway ? Math.PI * 1.15 : Math.PI * 2;
  const profile = [[.74, -3.08], [.94, -2.76], [.99, -2.48], [.99, 2.57],
    [.96, 2.95], [.85, 3.30], [.66, 3.64], [.40, 3.94], [.16, 4.13], [0, 4.20]];
  const hull = new THREE.LatheGeometry(profile.map(point => new THREE.Vector2(...point)), 56, start, span);
  mesh(parent, hull, material, 0, 0, 0);
  for (const [y, thickness, finish] of [
    [-2.43, .105, darkCoat], [-1.02, .035, aluminum], [.86, .055, accentCoat], [2.52, .09, darkCoat],
  ]) {
    const band = new THREE.CylinderGeometry(1.004, 1.004, thickness, 56, 1, true, start, span);
    mesh(parent, band, finish, 0, y, 0);
  }
  if (cutaway) {
    for (const angle of [start, start + span]) {
      const edge = profile.map(([radius, y]) => [radius * Math.sin(angle), y, radius * Math.cos(angle)]);
      trace(parent, edge, 0xe5e8ec);
    }
  }
}

export class RocketTwin {
  constructor(canvas, onPick) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101923);
    this.scene.environment = studioEnvironment();
    this.scene.environmentIntensity = .75;
    this.perspective = new THREE.PerspectiveCamera(36, 1, .05, 90);
    this.orthographic = new THREE.OrthographicCamera(-5, 5, 5, -5, .05, 90);
    this.camera = this.perspective;
    this.camera.position.set(6.8, 3.45, 12.8);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = .55;
    this.controls.maxDistance = 28;
    this.controls.minZoom = .35;
    this.controls.maxZoom = 8;
    this.orthographicHeight = 10;
    this.scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x49515b, 1.3));
    const key = new THREE.DirectionalLight(0xfff5e9, 2.6);
    key.position.set(5, 8, 8);
    const rim = new THREE.DirectionalLight(0x9cbced, 1.7);
    rim.position.set(-5, 3, -5);
    this.scene.add(key, rim);
    this.grid = new THREE.GridHelper(20, 20, 0x3b8fa8, 0x193448);
    this.gridRequested = true;
    this.grid.position.y = -3.23;
    this.scene.add(this.grid);
    this.pad = displayPlatform(this.scene);
    this.vehicle = new THREE.Group();
    this.structure = new THREE.Group();
    this.vehicle.add(this.structure);
    this.skin = panelPaint.clone();
    this.shell = new THREE.Group();
    shell(this.shell, this.skin, true);
    this.structure.add(this.shell);
    this.exterior = new THREE.Group();
    shell(this.exterior, panelPaint, false);
    addExteriorMarkings(this.exterior);
    this.vehicle.add(this.exterior);
    this.propulsionDisplay = addPropulsionDisplay(this.vehicle);
    for (const x of [-.75, .75]) {
      box(this.structure, [.045, 5.9, .045], aluminum, x, -.08, -.49);
    }
    const spine = new THREE.MeshStandardMaterial({color: 0x183649, metalness: .55, roughness: .43});
    box(this.structure, [1.40, 5.75, .06], spine, 0, -.05, -.63);
    for (const y of [-2.96, -2.22, -1.38, -.59, .15, .9, 1.69, 2.36]) {
      mesh(this.structure, new THREE.CylinderGeometry(.91, .91, .045, 36, 1, false, Math.PI / 2, Math.PI),
        aluminum, 0, y, 0);
      box(this.structure, [1.73, .055, .12], darkCoat, 0, y + .029, .10);
      for (const x of [-.72, .72]) {
        mesh(this.structure, new THREE.CylinderGeometry(.027, .027, .018, 10), copper, x, y + .038, .21);
      }
    }
    for (const x of [-.88, .88]) {
      box(this.structure, [.10, 5.83, .13], darkCoat, x, -.06, -.28);
      for (const y of [-2.25, -1.45, -.65, .15, .95, 1.75, 2.35]) {
        box(this.structure, [.11, .045, .15], aluminum, x, y, -.28);
      }
    }
    this.modules = new Map();
    for (const [name, coordinates] of Object.entries(LAYOUT)) {
      const board = pcb(name);
      board.position.set(...coordinates);
      box(board, [.50, .31, .035], darkCoat, 0, 0, -.045).name = 'Equipment mounting plate';
      for (const x of [-.19, .19]) {
        mesh(board, new THREE.CylinderGeometry(.019, .019, .067, 10), aluminum, x, -.105, -.031).rotation.x = Math.PI / 2;
      }
      this.vehicle.add(board);
      this.modules.set(name, board);
    }
    this.scene.add(this.vehicle);
    this.cables = new THREE.Group();
    this.scene.add(this.cables);
    this.links = new Map();
    this.supplyLinks = [];
    for (const name of this.modules.keys()) {
      if (name === 'battery') continue;
      const source = name === 'regulator' ? 'battery' : 'regulator';
      const line = trace(this.cables, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], BUS.DC);
      line.frustumCulled = false;
      line.material.opacity = .3;
      this.supplyLinks.push({line, source, name});
    }
    this.pulses = [];
    this.pulseGeometry = new THREE.SphereGeometry(.035, 8, 6);
    this.pulseMaterials = new Map(Object.values(BUS).concat(HEALTH.FAILED)
      .map(color => [color, new THREE.MeshBasicMaterial({color})]));
    this.axes = new THREE.Group();
    this.scene.add(this.axes);
    this.reference = new THREE.AxesHelper(.28);
    this.axes.add(this.reference);
    this.vectors = [0xff6f7e, 0x57edb0, 0x61aaff].map(color => {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color);
      this.axes.add(arrow);
      return arrow;
    });
    this.mode = 'vehicle';
    this.labelsRequested = true;
    this.selected = 'primary';
    this.exploded = 0;
    this.lastPacketTime = -1;
    this.cameraGoal = null;
    this.frameCount = 0;
    this.fpsAt = performance.now();
    this.lastDraw = 0;
    this.pointerStart = null;
    this.raycaster = new THREE.Raycaster();
    canvas.addEventListener('pointerdown', e => { this.pointerStart = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => this.pick(e));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame(now => this.animate(now));
  }

  resize() {
    const {width, height} = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.perspective.aspect = aspect;
    const half = this.orthographicHeight / 2;
    this.orthographic.left = -half * aspect;
    this.orthographic.right = half * aspect;
    this.orthographic.top = half;
    this.orthographic.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  setProjection(projection) {
    const next = projection === 'orthographic' ? this.orthographic : this.perspective;
    if (next === this.camera) return;
    if (next === this.orthographic) {
      const distance = this.camera.position.distanceTo(this.controls.target);
      this.orthographicHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2));
    }
    next.position.copy(this.camera.position);
    next.quaternion.copy(this.camera.quaternion);
    next.zoom = this.camera.zoom;
    this.camera = next;
    this.controls.object = next;
    this.canvas.dataset.projection = projection;
    this.resize();
    this.controls.update();
  }

  viewFrom(direction) {
    const directions = {front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, .001],
      aft: [0, -1, .44], angled: [6.8, 3, 12.8]};
    if (!directions[direction]) return;
    const target = (this.cameraGoal?.target || this.controls.target).clone();
    if (direction === 'aft') target.set(0, -2.62, 0);
    const position = this.cameraGoal?.position || this.camera.position;
    const distance = direction === 'aft' ? 7 : position.distanceTo(target);
    const offset = new THREE.Vector3(...directions[direction]).normalize().multiplyScalar(distance);
    this.cameraGoal = {target, position: target.clone().add(offset)};
    this.canvas.dataset.cameraView = direction;
    this.updateVisibility();
  }

  zoomBy(factor) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, .35, 8);
    this.camera.updateProjectionMatrix();
  }

  showGrid(visible) {
    this.gridRequested = visible;
    this.grid.visible = visible && this.canvas.dataset.cameraView !== 'aft';
  }

  aim(target, offset) {
    const direction = new THREE.Vector3(...offset);
    this.cameraGoal = {target, position: target.clone().add(direction)};
    this.camera.zoom = 1;
    if (this.camera.isOrthographicCamera) {
      this.orthographicHeight = 2 * direction.length() * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2));
    }
    this.resize();
    this.canvas.dataset.cameraView = 'angled';
  }

  pick(event) {
    if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart[0],
      event.clientY - this.pointerStart[1]) > 5) return;
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(
      2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height,
    ), this.camera);
    const boards = [...this.modules.values()].filter(board => board.visible);
    const hit = this.raycaster.intersectObjects(boards, true).find(item => item.object.isMesh);
    if (!hit) return;
    let board = hit.object;
    while (board && !board.userData.component) board = board.parent;
    if (board) this.onPick(board.userData.component, hit.object.name);
  }

  focus(name, mode = 'pcb') {
    this.selected = name;
    this.mode = mode;
    const target = new THREE.Vector3();
    if (mode === 'pcb') target.copy(this.modules.get(name).position);
    if (mode === 'avionics') target.set(0, .55, 0);
    if (['vehicle', 'exterior', 'mission', 'network'].includes(mode)) target.y = .45;
    const offset = mode === 'pcb' ? (EXTRA_INSTRUMENTS[name] ? [.29, .18, 1.18] : [.42, .28, 1.78])
      : mode === 'avionics' ? [2.1, 1.2, 5.8] : [3.6, 1.65, 13.9];
    this.aim(target, offset);
    this.updateVisibility();
  }

  focusDeck(height) {
    this.mode = 'vehicle';
    const target = new THREE.Vector3(0, height, .22);
    this.aim(target, [2.3, .7, 6.2]);
    this.updateVisibility();
  }

  updateVisibility() {
    this.grid.visible = this.gridRequested && this.canvas.dataset.cameraView !== 'aft';
    this.structure.visible = ['vehicle', 'avionics'].includes(this.mode);
    this.exterior.visible = ['mission', 'exterior'].includes(this.mode);
    this.pad.visible = ['mission', 'exterior', 'vehicle'].includes(this.mode) && this.canvas.dataset.cameraView !== 'aft';
    this.propulsionDisplay.visible = ['mission', 'exterior', 'vehicle'].includes(this.mode);
    this.cables.visible = ['vehicle', 'avionics', 'network'].includes(this.mode);
    for (const [name, board] of this.modules) {
      board.visible = !this.exterior.visible && (this.mode !== 'pcb' || this.selected === name);
      board.userData.label.visible = this.labelsRequested && (!EXTRA_INSTRUMENTS[name] || this.selected === name);
    }
  }

  configure({opacity, exploded, shellVisible, quality}) {
    this.skin.opacity = opacity;
    const translucent = opacity < 1;
    if (this.skin.transparent !== translucent) {
      this.skin.transparent = translucent;
      this.skin.depthWrite = !translucent;
      this.skin.needsUpdate = true;
    }
    this.shell.visible = shellVisible;
    this.exploded = exploded;
    this.renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
    for (const [name, board] of this.modules) {
      const [x, y, z] = LAYOUT[name];
      board.position.set(x * (1 + exploded), y * (1 + exploded * .22), z + exploded * .72);
    }
    this.resize();
  }

  showLabels(visible) {
    this.labelsRequested = visible;
    this.updateVisibility();
  }

  link(row) {
    const key = [row.bus, row.source, row.destination].join('/');
    if (this.links.has(key)) return this.links.get(key);
    const line = trace(this.cables, Array.from({length: 6}, () => [0, 0, 0]), BUS[row.bus]);
    line.frustumCulled = false;
    const link = {line, row, points: []};
    this.links.set(key, link);
    return link;
  }

  setFrame(frame, transactions) {
    this.frame = frame;
    if (frame.t_s < this.lastPacketTime) {
      this.lastPacketTime = -1;
      this.clearPulses();
    }
    const current = transactions.filter(row => row.t_s === frame.t_s &&
      this.modules.has(row.source) && this.modules.has(row.destination));
    for (const link of this.links.values()) link.line.visible = false;
    for (const row of current) {
      const link = this.link(row);
      link.row = row;
      link.line.visible = true;
      link.line.material.color.setHex(row.result === 'ok' ? BUS[row.bus] : HEALTH.FAILED);
    }
    if (frame.t_s !== this.lastPacketTime) {
      this.clearPulses();
      for (const row of current) {
        const color = row.result === 'ok' ? BUS[row.bus] : HEALTH.FAILED;
        const dot = mesh(this.cables, this.pulseGeometry, this.pulseMaterials.get(color), 0, 0, 0);
        this.pulses.push({dot, link: this.link(row), row, started: performance.now()});
      }
      this.lastPacketTime = frame.t_s;
      this.canvas.dataset.packetCount = String(this.pulses.length);
    }
    this.canvas.dataset.failed = Object.keys(frame.devices).filter(name =>
      frame.devices[name].health === 'FAILED').join(' ');
    this.canvas.dataset.faultLinks = current.filter(row => row.result !== 'ok')
      .map(row => row.source).join(' ');
    this.canvas.dataset.selected = this.selected;
    this.updateVisibility();
  }

  clearPulses() {
    for (const {dot} of this.pulses) this.cables.remove(dot);
    this.pulses.length = 0;
  }

  animate(now) {
    requestAnimationFrame(next => this.animate(next));
    if (document.hidden || this.canvas.hidden || !this.canvas.clientWidth || now - this.lastDraw < 32) return;
    this.lastDraw = now;
    if (this.cameraGoal) {
      this.camera.position.lerp(this.cameraGoal.position, .13);
      this.controls.target.lerp(this.cameraGoal.target, .13);
      if (this.camera.position.distanceTo(this.cameraGoal.position) < .01) this.cameraGoal = null;
    }
    const frame = this.frame;
    this.vehicle.position.y = this.mode === 'mission' ? 4 * (frame?.mission_display || 0) : 0;
    for (const [name, board] of this.modules) {
      const health = frame?.devices[name]?.health || 'OFF';
      const color = HEALTH[health];
      board.userData.indicator.color.setHex(color);
      const outline = board.userData.outline;
      outline.visible = health === 'FAILED' || health === 'WARNING' || this.selected === name;
      outline.material.color.setHex(color);
      outline.material.opacity = health === 'FAILED' ? .64 + .36 * Math.sin(now * .009) : .9;
    }
    for (const link of this.links.values()) {
      if (!link.line.visible) continue;
      const from = this.modules.get(link.row.source).position;
      const to = this.modules.get(link.row.destination).position;
      const lane = Object.keys(BUS).indexOf(link.row.bus);
      const depth = -.35 - lane * .045;
      const trunk = .82 + lane * .055 + this.exploded * .55;
      const sourcePort = from.clone().add(new THREE.Vector3(0, -.15, .06));
      const destinationPort = to.clone().add(new THREE.Vector3(0, -.15, .06));
      link.points = [sourcePort, new THREE.Vector3(sourcePort.x, sourcePort.y, depth),
        new THREE.Vector3(trunk, sourcePort.y, depth), new THREE.Vector3(trunk, destinationPort.y, depth),
        new THREE.Vector3(destinationPort.x, destinationPort.y, depth), destinationPort];
      const positions = link.line.geometry.attributes.position;
      link.points.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
      positions.needsUpdate = true;
    }
    for (const {dot, link, row, started} of this.pulses) {
      // The animation-frame clock can precede a packet received in this frame.
      const progress = THREE.MathUtils.clamp((now - started) / 380, 0, 1);
      dot.visible = progress < 1 && link.points.length > 0;
      if (!dot.visible) continue;
      const distance = progress * (row.result === 'ok' ? 5 : 3);
      const segment = Math.min(4, Math.floor(distance));
      dot.position.copy(link.points[segment]).lerp(link.points[segment + 1], distance - segment);
    }
    for (const {line, source, name} of this.supplyLinks) {
      const status = frame?.devices[name]?.health;
      line.visible = status !== 'OFF';
      const brownout = frame?.rail_v < 4.7;
      line.material.color.setHex(brownout && name !== 'regulator' ? HEALTH.FAILED : BUS.DC);
      const from = this.modules.get(source).position;
      const to = this.modules.get(name).position;
      const positions = line.geometry.attributes.position;
      positions.setXYZ(0, from.x, from.y, from.z);
      positions.setXYZ(1, -.93, from.y, -.35);
      positions.setXYZ(2, -.93, to.y, -.35);
      positions.setXYZ(3, to.x, to.y, to.z);
      positions.needsUpdate = true;
    }
    const vectors = frame?.vectors?.[this.selected];
    this.axes.visible = this.mode === 'pcb' && ['sensor_a', 'sensor_b', 'gyro'].includes(this.selected);
    if (this.axes.visible) {
      this.axes.position.copy(this.modules.get(this.selected).position).add(new THREE.Vector3(0, .28, .12));
      this.reference.rotation.set(...(frame?.orientation_rad || [0, 0, 0]));
      this.reference.visible = frame?.orientation_rad != null;
      this.vectors.forEach((arrow, index) => {
        const value = vectors?.[index] ?? 0;
        const direction = new THREE.Vector3().setComponent(index, Math.sign(value) || 1);
        arrow.visible = Math.abs(value) > .001;
        arrow.setDirection(direction);
        arrow.setLength(Math.min(.48, Math.abs(value) * .34), .06, .035);
      });
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const outline = this.modules.get(this.selected).userData.outline;
    this.canvas.dataset.outline = outline.visible ? outline.material.color.getHexString() : '';
    this.frameCount++;
    if (now - this.fpsAt > 1200) {
      this.canvas.dataset.fps = String(Math.round(1000 * this.frameCount / (now - this.fpsAt)));
      this.frameCount = 0;
      this.fpsAt = now;
    }
  }
}
