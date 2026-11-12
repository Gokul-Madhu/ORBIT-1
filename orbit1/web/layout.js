import {EXTRA_INSTRUMENTS} from './instrument-layout.js';

// Display order follows the modeled equipment positions from nose to base.
export const VEHICLE_ZONES = [
  {id: 'payload', title: 'Payload bay', summary: 'Equipment carried by the rocket.',
    modules: ['payload', 'strain_upper', 'skin_upper', 'heat_upper', 'payload_switch', 'payload_supply'], height: 2.65},
  {id: 'radio', title: 'Communications deck', summary: 'Sends computer messages to the ground station.',
    modules: ['radio', 'vibration_upper', 'sound_upper'], height: 1.98},
  {id: 'avionics', title: 'Computers and motion sensors', summary: 'Collects readings and checks whether the sensors agree.',
    modules: ['primary', 'backup', 'sensor_a', 'gyro', 'sensor_b'], height: .82},
  {id: 'instruments', title: 'Instrument deck', summary: 'Measures pressure and temperature and reports position in orbit.',
    modules: ['pressure', 'temperature', 'gnss'], height: -.30},
  {id: 'power', title: 'Power and checkout deck', summary: 'Stores energy, supplies five volts, and measures electrical use.',
    modules: ['regulator', 'monitor', 'battery', 'checkout_load', 'strain_lower', 'vibration_lower', 'skin_lower', 'sound_lower', 'heat_lower'], height: -1.82},
];

export const MODULE_NAMES = {
  payload: 'Payload controller', radio: 'Ground-link radio', primary: 'Main computer',
  backup: 'Backup computer', sensor_a: 'Motion sensor A', sensor_b: 'Motion sensor B',
  gyro: 'Turning sensor', pressure: 'Pressure sensor', temperature: 'Temperature probe',
  gnss: 'Position receiver', regulator: 'Voltage regulator', monitor: 'Power monitor',
  battery: 'Battery pack', checkout_load: 'Checkout load',
  strain_upper: 'Upper shell strain', strain_lower: 'Lower frame strain',
  vibration_upper: 'Upper deck vibration', vibration_lower: 'Lower deck vibration',
  skin_upper: 'Upper skin temperature', skin_lower: 'Lower skin temperature',
  sound_upper: 'Upper bay microphone', sound_lower: 'Lower bay microphone',
  heat_upper: 'Upper heat-flow gauge', heat_lower: 'Lower heat-flow gauge',
  payload_switch: 'Payload position switch', payload_supply: 'Payload branch monitor',
};

for (const [name, [label, , deck]] of Object.entries(EXTRA_INSTRUMENTS)) {
  MODULE_NAMES[name] = label;
  VEHICLE_ZONES.find(zone => zone.id === deck).modules.push(name);
}
