// Display order follows the modeled equipment positions from nose to base.
export const VEHICLE_ZONES = [
  {id: 'payload', title: 'Payload bay', summary: 'Equipment carried by the rocket.',
    modules: ['payload'], height: 2.65},
  {id: 'radio', title: 'Communications deck', summary: 'Sends computer messages to the ground station.',
    modules: ['radio'], height: 1.98},
  {id: 'avionics', title: 'Computers and motion sensors', summary: 'Collects readings and checks whether the sensors agree.',
    modules: ['primary', 'backup', 'sensor_a', 'gyro', 'sensor_b'], height: .82},
  {id: 'instruments', title: 'Instrument deck', summary: 'Measures pressure and temperature and reports position in orbit.',
    modules: ['pressure', 'temperature', 'gnss'], height: -.30},
  {id: 'power', title: 'Power and checkout deck', summary: 'Stores energy, supplies five volts, and measures electrical use.',
    modules: ['regulator', 'monitor', 'battery', 'checkout_load'], height: -1.82},
];

export const MODULE_NAMES = {
  payload: 'Payload controller', radio: 'Ground-link radio', primary: 'Main computer',
  backup: 'Backup computer', sensor_a: 'Motion sensor A', sensor_b: 'Motion sensor B',
  gyro: 'Turning sensor', pressure: 'Pressure sensor', temperature: 'Temperature probe',
  gnss: 'Position receiver', regulator: 'Voltage regulator', monitor: 'Power monitor',
  battery: 'Battery pack', checkout_load: 'Checkout load',
};
