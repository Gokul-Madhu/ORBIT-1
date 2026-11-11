import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

const HEALTH = {HEALTHY: 0x48efb2, WARNING: 0xffbe63, FAILED: 0xff294d, OFF: 0x627991};
const BUS = {'SPI': 0x43e8ff, 'CAN': 0xffb45e, 'I²C': 0xbb95ff, 'UART': 0x62ed9a, 'DC': 0xffdf82};
const LAYOUT = {
  primary: [-.56, 1.2, .43], backup: [.54, 1.2, .43],
  sensor_a: [-.63, .45, .5], sensor_b: [.62, .45, .5], gyro: [0, .45, .64],
  pressure: [-.66, -.3, .48], temperature: [0, -.3, .64], gnss: [.63, -.3, .48],
  regulator: [-.57, -1.08, .48], monitor: [.58, -1.08, .48],
  radio: [-.56, 1.98, .47], payload: [.53, 2.65, .48],
  battery: [0, -1.95, .51], checkout_load: [0, -2.68, .48],
};
const plate = new THREE.MeshStandardMaterial({color: 0x0a5049, metalness: .28, roughness: .5});
const chip = new THREE.MeshStandardMaterial({color: 0x17202d, metalness: .42, roughness: .37});
const copper = new THREE.MeshStandardMaterial({color: 0xc6a065, metalness: .72, roughness: .34});
const aluminum = new THREE.MeshStandardMaterial({color: 0x718daa, metalness: .66, roughness: .34});
const boardGeometry = new THREE.BoxGeometry(.58, .40, .038);

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

function pcb(name) {
  const group = new THREE.Group();
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
  const indicator = new THREE.MeshBasicMaterial({color: HEALTH.OFF});
  mesh(group, new THREE.SphereGeometry(.028, 10, 8), indicator, .24, .105, .078);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.62, .44, .17)),
    new THREE.LineBasicMaterial({color: HEALTH.OFF, transparent: true, toneMapped: false}));
  outline.position.z = .055;
  group.add(outline);
  group.userData = {component: name, indicator, outline};
  return group;
}

function shell(parent, material, cutaway) {
  const start = cutaway ? Math.PI * .48 : 0;
  const span = cutaway ? Math.PI * 1.28 : Math.PI * 2;
  for (const [y, length, radius] of [[-2, 2.15, .99], [.15, 2.05, .98], [2.13, 1.75, .93]]) {
    mesh(parent, new THREE.CylinderGeometry(radius, radius, length, 64, 1, true, start, span), material, 0, y, 0);
  }
  mesh(parent, new THREE.CylinderGeometry(.05, .93, 1.18, 64, 1, true, start, span), material, 0, 3.57, 0);
}

export class RocketTwin {
  constructor(canvas, onPick) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060f1c);
    this.camera = new THREE.PerspectiveCamera(36, 1, .05, 90);
    this.camera.position.set(6.8, 3.45, 12.8);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = .55;
    this.controls.maxDistance = 28;
    this.scene.add(new THREE.HemisphereLight(0xd7efff, 0x273549, 2.4));
    const key = new THREE.DirectionalLight(0xc4f1ff, 3.2);
    key.position.set(5, 8, 8);
    const rim = new THREE.DirectionalLight(0x528cff, 2.4);
    rim.position.set(-5, 3, -5);
    this.scene.add(key, rim);
    const grid = new THREE.GridHelper(25, 40, 0x1d6684, 0x162e43);
    grid.position.y = -3.23;
    this.scene.add(grid);
    this.pad = new THREE.Group();
    mesh(this.pad, new THREE.CylinderGeometry(2.1, 2.4, .2, 8), chip, 0, -3.15, 0);
    mesh(this.pad, new THREE.TorusGeometry(1.5, .022, 8, 64), copper, 0, -3.04, 0).rotation.x = Math.PI / 2;
    this.scene.add(this.pad);
    this.vehicle = new THREE.Group();
    this.structure = new THREE.Group();
    this.vehicle.add(this.structure);
    this.skin = new THREE.MeshStandardMaterial({color: 0x5c8eac, metalness: .4, roughness: .42,
      side: THREE.DoubleSide, transparent: true, opacity: .34, depthWrite: false});
    this.shell = new THREE.Group();
    shell(this.shell, this.skin, true);
    this.structure.add(this.shell);
    this.exterior = new THREE.Group();
    shell(this.exterior, aluminum, false);
    this.vehicle.add(this.exterior);
    for (const y of [-3.02, -2.43, -1.0, .82, 2.16, 2.96]) {
      mesh(this.structure, new THREE.TorusGeometry(.97, .035, 10, 48), aluminum, 0, y, 0).rotation.x = Math.PI / 2;
    }
    for (const x of [-.75, .75]) {
      box(this.structure, [.045, 5.9, .045], aluminum, x, -.08, -.49);
    }
    this.modules = new Map();
    for (const [name, coordinates] of Object.entries(LAYOUT)) {
      const board = pcb(name);
      board.position.set(...coordinates);
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
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    if (mode === 'vehicle' || mode === 'mission' || mode === 'network') target.y = .45;
    const offset = mode === 'pcb' ? [.42, .28, 1.78]
      : mode === 'avionics' ? [2.1, 1.2, 5.8] : [6.8, 3, 12.8];
    this.cameraGoal = {target, position: target.clone().add(new THREE.Vector3(...offset))};
    this.updateVisibility();
  }

  updateVisibility() {
    this.structure.visible = ['vehicle', 'avionics'].includes(this.mode);
    this.exterior.visible = this.mode === 'mission';
    this.pad.visible = this.mode === 'mission';
    this.cables.visible = this.mode !== 'pcb' && this.mode !== 'mission';
    for (const [name, board] of this.modules) {
      board.visible = this.mode !== 'mission' && (this.mode !== 'pcb' || this.selected === name);
    }
  }

  configure({opacity, exploded, shellVisible, quality}) {
    this.skin.opacity = opacity;
    this.shell.visible = shellVisible;
    this.exploded = exploded;
    this.renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
    for (const [name, board] of this.modules) {
      const [x, y, z] = LAYOUT[name];
      board.position.set(x * (1 + exploded), y * (1 + exploded * .22), z + exploded * .72);
    }
    this.resize();
  }

  link(row) {
    const key = [row.bus, row.source, row.destination].join('/');
    if (this.links.has(key)) return this.links.get(key);
    const line = trace(this.cables, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], BUS[row.bus]);
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
    if (document.hidden || this.canvas.hidden || now - this.lastDraw < 32) return;
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
      const depth = -.48 - Object.keys(BUS).indexOf(link.row.bus) * .11;
      link.points = [from, new THREE.Vector3(from.x, from.y, depth),
        new THREE.Vector3(to.x, to.y, depth), to];
      const positions = link.line.geometry.attributes.position;
      link.points.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
      positions.needsUpdate = true;
    }
    for (const {dot, link, row, started} of this.pulses) {
      // The animation-frame clock can precede a packet received in this frame.
      const progress = THREE.MathUtils.clamp((now - started) / 380, 0, 1);
      dot.visible = progress < 1 && link.points.length > 0;
      if (!dot.visible) continue;
      const distance = progress * (row.result === 'ok' ? 3 : 2);
      const segment = Math.min(2, Math.floor(distance));
      dot.position.copy(link.points[segment]).lerp(link.points[segment + 1], distance - segment);
    }
    for (const {line, source, name} of this.supplyLinks) {
      const status = frame?.devices[name]?.health;
      line.visible = status !== 'OFF';
      const brownout = frame?.rail_v < 4.7;
      line.material.color.setHex(brownout ? HEALTH.FAILED : BUS.DC);
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
      this.reference.rotation.set(...(frame.orientation_rad || [0, 0, 0]));
      this.reference.visible = frame.orientation_rad !== null;
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
