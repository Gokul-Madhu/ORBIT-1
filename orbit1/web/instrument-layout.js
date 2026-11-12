// Scene coordinates are illustrative display positions.
export const EXTRA_INSTRUMENTS = {
  air_upper: ['Upper bay air temperature', 'Environment', 'payload', 'AIR / U', [-.24, 3.13, .57], 'How warm the air is inside the upper bay.'],
  air_lower: ['Lower bay air temperature', 'Environment', 'power', 'AIR / L', [-.25, -2.85, .59], 'How warm the air is inside the lower bay.'],
  humidity_upper: ['Upper bay humidity', 'Environment', 'payload', 'RH / U', [.30, 3.13, .57], 'How close upper bay air is to saturation with water vapor.'],
  humidity_lower: ['Lower bay humidity', 'Environment', 'power', 'RH / L', [.26, -2.88, .61], 'How close lower bay air is to saturation with water vapor.'],
  light_port: ['Port light sensor', 'Environment', 'radio', 'LIGHT / P', [-.81, 1.45, .49], 'Relative light on the left side of the simulated vehicle.'],
  light_starboard: ['Starboard light sensor', 'Environment', 'radio', 'LIGHT / S', [.81, 1.45, .49], 'Relative light on the right side of the simulated vehicle.'],
  mag_upper: ['Upper magnetic field sensor', 'Environment', 'radio', 'MAG / U', [.14, 1.91, .72], 'Strength of the prescribed magnetic field at the upper deck.'],
  mag_lower: ['Lower magnetic field sensor', 'Environment', 'power', 'MAG / L', [-.10, -2.29, .68], 'Strength of the prescribed field plus a simulated local offset.'],
  shock_upper: ['Upper deck shock indicator', 'Structure', 'radio', 'SHOCK / U', [-.40, 1.61, .58], 'Peak acceleration assigned to the upper deck at the scripted stage event.'],
  shock_lower: ['Lower deck shock indicator', 'Structure', 'power', 'SHOCK / L', [.16, -2.56, .70], 'Peak acceleration assigned to the lower deck at the same event.'],
  gap_upper: ['Upper frame gap sensor', 'Structure', 'instruments', 'GAP / U', [-.82, .05, .45], 'Distance between two modeled reference surfaces on the upper frame.'],
  gap_lower: ['Lower frame gap sensor', 'Structure', 'power', 'GAP / L', [.82, -1.91, .45], 'Distance between two modeled reference surfaces on the lower frame.'],
  temp_battery: ['Battery case temperature', 'Equipment temperatures', 'power', 'BAT TEMP', [-.39, -2.02, .62], 'Temperature estimate for the battery enclosure.'],
  temp_regulator: ['Regulator case temperature', 'Equipment temperatures', 'power', 'REG TEMP', [-.23, -1.19, .73], 'Temperature estimate that rises with modeled regulator losses.'],
  temp_radio: ['Radio board temperature', 'Equipment temperatures', 'radio', 'RF TEMP', [-.44, 2.15, .55], 'Temperature estimate for the radio board.'],
  temp_payload: ['Payload board temperature', 'Equipment temperatures', 'payload', 'PAY TEMP', [.35, 2.85, .61], 'Temperature estimate that rises after the payload is powered.'],
  supply_main: ['Main computer input voltage', 'Power and payload', 'avionics', 'MAIN V', [-.66, .97, .71], 'Voltage supplied to the main computer. Both computers share the same modeled rail.'],
  supply_backup: ['Backup computer input voltage', 'Power and payload', 'avionics', 'BACK V', [.66, .97, .71], 'Voltage supplied to the backup computer. Separate wire losses are not modeled.'],
  current_main: ['Main computer branch current', 'Power and payload', 'avionics', 'MAIN A', [-.27, 1.16, .75], 'Nominal current assigned to the main computer branch.'],
  current_backup: ['Backup computer branch current', 'Power and payload', 'avionics', 'BACK A', [.26, 1.16, .75], 'Nominal current assigned to the backup computer branch.'],
  loss_regulator: ['Regulator conversion loss', 'Power and payload', 'power', 'REG LOSS', [-.53, -1.35, .66], 'Power lost in the modeled regulator while converting battery power to the shared rail.'],
  usage_spi: ['SPI activity monitor', 'Communications', 'instruments', 'SPI LOAD', [-.66, -.58, .64], 'Share of this 250 ms tick used by modeled SPI transfer attempts.'],
  usage_can: ['CAN activity monitor', 'Communications', 'instruments', 'CAN LOAD', [.66, -.58, .64], 'Share of this tick used by modeled CAN transfer attempts.'],
  usage_i2c: ['I²C activity monitor', 'Communications', 'instruments', 'I2C LOAD', [-.22, -.59, .71], 'Share of this tick used by modeled I²C transfers before the diagnostic messages are added.'],
  usage_uart: ['UART activity monitor', 'Communications', 'radio', 'UART LOAD', [-.14, 1.78, .71], 'Share of this tick used by the modeled UART transfer attempt.'],
  link_received: ['Ground link received counter', 'Communications', 'radio', 'RX COUNT', [.20, 2.13, .73], 'How many packets the host model has delivered to the simulated ground station since reset.'],
  link_dropped: ['Ground link dropped counter', 'Communications', 'radio', 'DROP COUNT', [.44, 2.15, .66], 'How many packets the host radio model has dropped. A UART failure can prevent a packet from reaching the radio.'],
  link_pending: ['Radio pending message indicator', 'Communications', 'radio', 'RADIO Q', [.20, 1.68, .75], 'Whether a packet is queued for the simulated ground link after this tick.'],
  rail_margin: ['Shared rail voltage margin', 'Power and payload', 'power', 'RAIL MGN', [-.82, -.92, .43], 'How far the rail voltage is above or below the 4.7 V operating threshold.'],
  battery_sag: ['Battery voltage sag', 'Power and payload', 'power', 'BAT SAG', [-.43, -1.83, .64], 'How much the battery terminal voltage drops under the modeled load.'],
  battery_loss: ['Battery internal power loss', 'Power and payload', 'power', 'BAT LOSS', [.38, -2.03, .62], 'Power lost as heat inside the modeled battery resistance.'],
  load_power: ['Shared rail load power', 'Power and payload', 'power', 'LOAD W', [.24, -1.26, .72], 'The voltage on the shared rail multiplied by the modeled load current.'],
  rail_adc: ['Rail voltage ADC code', 'Power and payload', 'power', 'ADC CODE', [.66, -.92, .62], 'How a simulated 10-bit converter represents rail voltage as a number from 0 to 1023.'],
  battery_charge: ['Battery charge remaining', 'Power and payload', 'power', 'BAT CHG', [.09, -2.19, .76], 'Estimated percentage of battery charge remaining after modeled current draw.'],
  age_motion_a: ['Main motion sample age', 'Signal quality', 'avionics', 'AGE / A', [-.30, .53, .69], 'Seconds since the main motion sensor last delivered a valid reading.'],
  age_motion_b: ['Backup motion sample age', 'Signal quality', 'avionics', 'AGE / B', [.30, .53, .69], 'Seconds since the backup motion sensor last delivered a valid reading.'],
  errors_spi: ['SPI failed transfers', 'Signal quality', 'instruments', 'SPI ERR', [-.48, -.75, .65], 'Count of failed SPI message attempts in the selected simulation step.'],
  errors_can: ['CAN failed transfers', 'Signal quality', 'instruments', 'CAN ERR', [.48, -.75, .65], 'Count of failed CAN message attempts in the selected simulation step.'],
  errors_i2c: ['I²C failed transfers', 'Signal quality', 'instruments', 'I2C ERR', [.20, -.59, .71], 'Count of failed I²C messages before diagnostic traffic. This counter reports over SPI.'],
  errors_uart: ['UART failed transfers', 'Signal quality', 'radio', 'UART ERR', [.75, 1.79, .50], 'Count of failed UART transfers in the selected simulation step.'],
  pressure_upper: ['Upper bay pressure', 'Environment', 'payload', 'BAY P / U', [-.48, 2.78, .65], 'Local pressure in the simulated upper bay.'],
  pressure_lower: ['Lower bay pressure', 'Environment', 'power', 'BAY P / L', [.40, -2.62, .63], 'Local pressure in the simulated lower bay.'],
  delta_pressure: ['Bay pressure difference', 'Environment', 'instruments', 'Δ BAY P', [-.20, -.13, .72], 'Lower bay pressure minus upper bay pressure, using both delivered readings.'],
  delta_air: ['Bay air temperature difference', 'Environment', 'instruments', 'Δ BAY T', [.21, -.14, .73], 'Upper bay air temperature minus lower bay air temperature.'],
  residual_x: ['Motion sensor X disagreement', 'Signal quality', 'avionics', 'Δ IMU X', [-.19, .71, .71], 'Main minus backup on the first motion axis. A missing input makes this comparison unavailable.'],
  residual_y: ['Motion sensor Y disagreement', 'Signal quality', 'avionics', 'Δ IMU Y', [.02, .71, .75], 'Main minus backup on the second motion axis.'],
  residual_z: ['Motion sensor Z disagreement', 'Signal quality', 'avionics', 'Δ IMU Z', [.23, .71, .71], 'Main minus backup on the third motion axis.'],
  residual_total: ['Motion sensor total disagreement', 'Signal quality', 'avionics', 'Δ IMU', [.04, .99, .79], 'Combined size of the disagreement across all three motion axes.'],
  delta_regulator: ['Regulator above local air', 'Equipment temperatures', 'power', 'Δ REG T', [-.49, -1.47, .68], 'Regulator case temperature minus lower bay air temperature.'],
  delta_battery: ['Battery above local air', 'Equipment temperatures', 'power', 'Δ BAT T', [-.24, -2.04, .75], 'Battery case temperature minus lower bay air temperature.'],
  delta_payload: ['Payload above local air', 'Equipment temperatures', 'payload', 'Δ PAY T', [.36, 2.55, .69], 'Payload board temperature minus upper bay air temperature.'],
  delta_skin: ['Skin temperature difference', 'Equipment temperatures', 'instruments', 'Δ SKIN T', [.39, -.42, .71], 'Upper surface temperature minus lower surface temperature.'],
};

export function sensorFamily(name) {
  if (EXTRA_INSTRUMENTS[name]) return EXTRA_INSTRUMENTS[name][1];
  if (['sensor_a', 'sensor_b', 'gyro', 'gnss'].includes(name)) return 'Motion and position';
  if (/^(strain|vibration|sound)_/.test(name)) return 'Structure';
  if (name === 'temperature' || /^(skin|heat)_/.test(name)) return 'Equipment temperatures';
  if (name === 'pressure') return 'Environment';
  return 'Power and payload';
}
