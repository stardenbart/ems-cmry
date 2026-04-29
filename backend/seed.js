const sequelize = require('./config/database');
const { User, Device, DataGateway, DeviceType, Group, EnergyConversion, SmtpSetting } = require('./models');
require('dotenv').config();

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Sync semua tabel
    await sequelize.sync();

    // ═══ USERS ═══
    const users = [
      { name: 'Admin', username: 'admin', password: 'admin', level: 'admin' },
      { name: 'Maintenance', username: 'maintenance', password: 'maintenance', level: 'maintenance' },
      { name: 'Operator', username: 'operator', password: 'operator', level: 'operator' },
      { name: 'Viewer', username: 'viewer', password: 'viewer', level: 'viewer' },
    ];

    for (const u of users) {
      const exists = await User.findOne({ where: { username: u.username } });
      if (!exists) {
        await User.create(u);
        console.log(`[Users] Created: ${u.username}`);
      } else {
        console.log(`[Users] Already exists: ${u.username}`);
      }
    }

    // ═══ GROUPS ═══
    const groups = ['ALL'];

    for (const name of groups) {
      const exists = await Group.findOne({ where: { name } });
      if (!exists) {
        await Group.create({ name });
        console.log(`[Groups] Created: ${name}`);
      } else {
        console.log(`[Groups] Already exists: ${name}`);
      }
    }

    // ═══ DATA GATEWAYS ═══
    const gateways = [
      { name: 'MDP A-3', protocol: 'modbus-rtu', port_or_ip: 'COM2', baudrate: 9600, parity: 'none' },
    ];

    for (const gw of gateways) {
      const exists = await DataGateway.findOne({ where: { name: gw.name } });
      if (!exists) {
        await DataGateway.create(gw);
        console.log(`[Gateways] Created: ${gw.name}`);
      } else {
        console.log(`[Gateways] Already exists: ${gw.name}`);
      }
    }

    // ═══ DEVICE TYPES ═══
    const deviceTypes = [
      {
        name: 'PM2200',
        category: 'Power Meter',
        params: [
          { name: 'Current A', save: true, length: 2, address: 2999, dataType: 'float32be' },
          { name: 'Current B', save: true, length: 2, address: 3001, dataType: 'float32be' },
          { name: 'Current C', save: true, length: 2, address: 3003, dataType: 'float32be' },
          { name: 'Current N', save: true, length: 2, address: 3005, dataType: 'float32be' },
          { name: 'Current Avg', save: true, length: 2, address: 3009, dataType: 'float32be' },
          { name: 'Voltage A-B', save: true, length: 2, address: 3019, dataType: 'float32be' },
          { name: 'Voltage B-C', save: true, length: 2, address: 3021, dataType: 'float32be' },
          { name: 'Voltage C-A', save: true, length: 2, address: 3023, dataType: 'float32be' },
          { name: 'Voltage L-L Avg', save: true, length: 2, address: 3025, dataType: 'float32be' },
          { name: 'Voltage A-N', save: true, length: 2, address: 3027, dataType: 'float32be' },
          { name: 'Voltage B-N', save: true, length: 2, address: 3029, dataType: 'float32be' },
          { name: 'Voltage C-N', save: true, length: 2, address: 3031, dataType: 'float32be' },
          { name: 'Voltage L-N Avg', save: true, length: 2, address: 3035, dataType: 'float32be' },
          { name: 'Active Power Total', save: true, length: 2, address: 3059, dataType: 'float32be' },
          { name: 'Reactive Power Total', save: true, length: 2, address: 3067, dataType: 'float32be' },
          { name: 'Apparent Power Total', save: true, length: 2, address: 3075, dataType: 'float32be' },
          { name: 'Frequency', save: true, length: 2, address: 3109, dataType: 'float32be' },
          { name: 'PF Total', save: true, length: 1, address: 3195, dataType: 'int16' },
          { name: 'Active Energy Delivered (Into Load)', save: true, length: 4, address: 3203, dataType: 'int16' },
          { name: 'Active Energy Delivered (Out of Load)', save: true, length: 4, address: 3207, dataType: 'int16' },
          { name: 'THD Current A', save: true, length: 2, address: 21299, dataType: 'float32be' },
          { name: 'THD Current B', save: true, length: 2, address: 21301, dataType: 'float32be' },
          { name: 'THD Current C', save: true, length: 2, address: 21303, dataType: 'float32be' },
          { name: 'thd voltage L-L', save: true, length: 2, address: 21345, dataType: 'float32be' },
        ],
      },
    ];

    for (const dt of deviceTypes) {
      const exists = await DeviceType.findOne({ where: { name: dt.name } });
      if (!exists) {
        await DeviceType.create(dt);
        console.log(`[DeviceTypes] Created: ${dt.name} (${dt.params.length} params)`);
      } else {
        // Update params kalau sudah ada
        await exists.update({ params: dt.params, category: dt.category });
        console.log(`[DeviceTypes] Updated params: ${dt.name}`);
      }
    }

    // ═══ DEVICES ═══
    const group = await Group.findOne({ where: { name: 'ALL' } });
    const deviceType = await DeviceType.findOne({ where: { name: 'PM2200' } });
    const gateway = await DataGateway.findOne({ where: { name: 'MDP A-3' } });

    if (group && deviceType && gateway) {
      const devices = [
        { name: 'PM MDP-A3', address: 1, group_id: group.id, device_type_id: deviceType.id, data_gateway_id: gateway.id },
      ];

      for (const d of devices) {
        const exists = await Device.findOne({ where: { name: d.name } });
        if (!exists) {
          await Device.create(d);
          console.log(`[Devices] Created: ${d.name} (address: ${d.address})`);
        } else {
          console.log(`[Devices] Already exists: ${d.name}`);
        }
      }
    } else {
      console.log('[Devices] Skipped — missing group, device type, or gateway');
    }

    // ═══ ENERGY CONVERSIONS ═══
    const ecCount = await EnergyConversion.count();
    if (ecCount === 0) {
      await EnergyConversion.create({ co2_per_kwh: 10, fuel_per_kwh: 100, cost_per_kwh: 1000 });
      console.log('[EnergyConversion] Created default values');
    } else {
      console.log('[EnergyConversion] Already exists, skipping');
    }

    // ═══ SMTP SETTINGS ═══
    const smtpCount = await SmtpSetting.count();
    if (smtpCount === 0) {
      await SmtpSetting.create({
        host: 'smtp.gmail.com',
        port: 465,
        username: '',
        password: '',
      });
      console.log('[SMTP] Created default (configure via Settings)');
    } else {
      console.log('[SMTP] Already exists, skipping');
    }

    // ═══ SUMMARY ═══
    console.log('\n══════════════════════════════════');
    console.log('  Seed completed!');
    console.log('══════════════════════════════════');
    console.log('Default credentials:');
    console.log('  admin / admin');
    console.log('  maintenance / maintenance');
    console.log('  operator / operator');
    console.log('  viewer / viewer');
    console.log('\nDevice: PM MDP-A3 (address 1, COM2)');
    console.log('Group: ALL');
    console.log('Gateway: MDP A-3 (modbus-rtu, COM2, 9600, none)');
    console.log('Device Type: PM2200 (24 params)');
    console.log('Energy Conversion: CO2=10, Fuel=100, IDR=1000');
    console.log('SMTP: smtp.gmail.com (configure username/password in Settings)');
    console.log('══════════════════════════════════\n');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();