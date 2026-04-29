const ModbusRTU = require('modbus-serial');
const { Device, DeviceType, DataGateway } = require('../models');
const { broadcastData } = require('../websocket/wsServer');
const { checkAlarms } = require('./alarmChecker');

const clients = {};
let devices = [];
let deviceTypes = {};
let gateways = {};
let isRunning = false;
let pollTimer = null;

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 3000;
const MAX_CONNECT_RETRIES = 5;
const connectRetries = {};

// ── Demo mode: energy accumulator per device ──────────────────────────────────
// Nilai awal simulasi = angka realistis, naik ~0.001 kWh per detik (~3.6 kW)
const demoEnergyBase = {};

async function loadConfig() {
  try {
    console.log('[Modbus] Loading config...');

    const rawDevices = await Device.findAll({ raw: true });
    console.log('[Modbus] Raw query result:', rawDevices.length, 'devices');

    devices = await Device.findAll({
      include: [
        { model: DeviceType, as: 'deviceType' },
        { model: DataGateway, as: 'dataGateway' },
      ],
    });
    console.log('[Modbus] With include result:', devices.length, 'devices');

    const types = await DeviceType.findAll();
    deviceTypes = {};
    types.forEach((t) => { deviceTypes[t.id] = t; });

    const gws = await DataGateway.findAll();
    gateways = {};
    gws.forEach((g) => { gateways[g.id] = g; });

    console.log(`[Modbus] Loaded ${devices.length} devices, ${Object.keys(deviceTypes).length} types, ${Object.keys(gateways).length} gateways`);
    return devices;
  } catch (err) {
    console.error('[Modbus] ERROR loading config:', err.message);
    console.error('[Modbus] FULL ERROR:', err);
    return [];
  }
}

async function connectGateway(gateway) {
  if (clients[gateway.id] && clients[gateway.id].isOpen) {
    return clients[gateway.id];
  }

  const retries = connectRetries[gateway.id] || 0;
  if (retries >= MAX_CONNECT_RETRIES) {
    setTimeout(() => { connectRetries[gateway.id] = 0; }, 60000);
    return null;
  }

  const client = new ModbusRTU();

  try {
    if (gateway.protocol === 'modbus-rtu') {
      await client.connectRTUBuffered(gateway.port_or_ip, {
        baudRate: gateway.baudrate || 9600,
        parity: (gateway.parity || 'none').toLowerCase(),
        dataBits: 8,
        stopBits: 1,
      });
    } else if (gateway.protocol === 'modbus-tcp') {
      const parts = gateway.port_or_ip.split(':');
      const ip = parts[0];
      const port = parseInt(parts[1]) || 502;
      await client.connectTCP(ip, { port });
    }

    client.setTimeout(3000);
    clients[gateway.id] = client;
    connectRetries[gateway.id] = 0;
    console.log(`[Modbus] Connected: ${gateway.name}`);
    return client;
  } catch (err) {
    connectRetries[gateway.id] = retries + 1;
    console.error(`[Modbus] Failed to connect ${gateway.name} (attempt ${retries + 1}): ${err.message}`);
    return null;
  }
}

function readFloat32BE(data, offset = 0) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(data[offset], 0);
  buf.writeUInt16BE(data[offset + 1], 2);
  return parseFloat(buf.readFloatBE(0).toFixed(4));
}

function readInt16(data, offset = 0) {
  const val = data[offset];
  return val > 32767 ? val - 65536 : val;
}

async function readDevice(client, device) {
  const deviceType = deviceTypes[device.device_type_id];
  if (!deviceType || !deviceType.params) return null;

  client.setID(device.address);
  const result = {};

  const params = typeof deviceType.params === 'string'
    ? JSON.parse(deviceType.params)
    : deviceType.params;

  for (const param of params) {
    try {
      const response = await client.readHoldingRegisters(param.address, param.length || 2);
      const dataType = (param.dataType || 'float32be').toLowerCase();

      if (dataType === 'float32be' || dataType === 'float32') {
        result[param.name] = readFloat32BE(response.data);
      } else if (dataType === 'int16') {
        result[param.name] = readInt16(response.data);
      } else if (dataType === 'uint16') {
        result[param.name] = response.data[0];
      } else if (dataType === 'int32') {
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(response.data[0], 0);
        buf.writeUInt16BE(response.data[1], 2);
        result[param.name] = buf.readInt32BE(0);
      } else {
        result[param.name] = readFloat32BE(response.data);
      }
    } catch (err) {
      result[param.name] = null;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return result;
}

async function pollAllDevices() {
  if (!isRunning) return;

  for (const device of devices) {
    const gateway = gateways[device.data_gateway_id];
    if (!gateway) continue;

    const client = await connectGateway(gateway);
    if (!client) continue;

    try {
      const data = await readDevice(client, device);
      if (data) {
        broadcastData(device.id, {
          ...data,
          deviceName: device.name,
          deviceId: device.id,
        });
        checkAlarms(device.id, data);
      }
    } catch (err) {
      console.error(`[Modbus] Error reading ${device.name}: ${err.message}`);
      if (clients[gateway.id]) {
        try { clients[gateway.id].close(); } catch (e) {}
        delete clients[gateway.id];
      }
    }
  }
}

async function startModbusReader() {
  console.log('[Modbus] Starting...');
  await loadConfig();

  isRunning = true;

  if (devices.length === 0) {
    console.log('[Modbus] No devices found — running in DEMO MODE (no devices in DB)');
    startDemoMode();
    return;
  }

  // Coba connect ke minimal 1 gateway
  let anyConnected = false;
  for (const device of devices) {
    const gateway = gateways[device.data_gateway_id];
    if (!gateway) continue;
    const client = await connectGateway(gateway);
    if (client) { anyConnected = true; break; }
  }

  if (!anyConnected) {
    // Ada device di DB tapi hardware tidak konek → demo pakai device ID yang real
    console.log('[Modbus] Devices exist in DB but no gateway reachable — DEMO MODE with real device IDs');
    startDemoMode();
    return;
  }

  // Real polling loop
  const poll = async () => {
    if (!isRunning) return;
    await pollAllDevices();
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };
  poll();
}

function startDemoMode() {
  // Inisialisasi energy base per device (nilai kumulatif awal, realistis ~10.000 kWh)
  const targetDevices = devices.length > 0 ? devices : [{ id: 1, name: 'PM MDP (Demo)' }];
  const startedAt = Date.now();

  targetDevices.forEach((d) => {
    // Setiap device mulai dari nilai kWh yang berbeda supaya tidak identik
    demoEnergyBase[d.id] = 10000 + (d.id * 543.7);
  });

  setInterval(() => {
    if (!isRunning) return;

    const elapsedHours = (Date.now() - startedAt) / 3_600_000;

    targetDevices.forEach((d) => {
      // Energy Active naik linear sesuai waktu berjalan
      // ~900 kW rata-rata → naik 900 kWh per jam = 0.25 kWh per detik
      // Tapi kita poll tiap 3 detik jadi naik ~0.00083 kWh per poll
      const activePower = parseFloat((Math.random() * 100 + 850).toFixed(2)); // kW
      const energyActive = parseFloat(
        (demoEnergyBase[d.id] + activePower * elapsedHours).toFixed(2)
      );

      const data = {
        'Current A':            parseFloat((Math.random() * 500 + 900).toFixed(2)),
        'Current B':            parseFloat((Math.random() * 500 + 900).toFixed(2)),
        'Current C':            parseFloat((Math.random() * 500 + 900).toFixed(2)),
        'Current Avg':          parseFloat((Math.random() * 500 + 900).toFixed(2)),
        'Voltage AB':           parseFloat((Math.random() * 5 + 397).toFixed(2)),
        'Voltage BC':           parseFloat((Math.random() * 5 + 397).toFixed(2)),
        'Voltage CA':           parseFloat((Math.random() * 5 + 397).toFixed(2)),
        'Voltage LL Avg':       parseFloat((Math.random() * 5 + 397).toFixed(2)),
        'Active Power Total':   activePower,
        'Reactive Power Total': parseFloat((Math.random() * 50 + 200).toFixed(2)),
        'Apparent Power Total': parseFloat((Math.random() * 100 + 900).toFixed(2)),
        'Power Factor Total':   parseFloat((Math.random() * 0.05 + 0.62).toFixed(3)),
        'Frequency':            parseFloat((Math.random() * 0.1 + 50.0).toFixed(2)),
        // Energy Active naik monoton = realistis sebagai nilai odometer meter
        'Energy Active':        energyActive,
        'THD Current A':        parseFloat((Math.random() * 3 + 1).toFixed(2)),
        'THD Current B':        parseFloat((Math.random() * 3 + 1).toFixed(2)),
        'THD Current C':        parseFloat((Math.random() * 3 + 1).toFixed(2)),
        'THD Voltage AB':       parseFloat((Math.random() * 2 + 0.5).toFixed(2)),
        deviceName: d.name,
        deviceId:   d.id,
      };

      broadcastData(d.id, data);
      checkAlarms(d.id, data);
    });
  }, POLL_INTERVAL_MS);
}

function stopModbusReader() {
  isRunning = false;
  if (pollTimer) clearTimeout(pollTimer);
  Object.values(clients).forEach((c) => {
    try { c.close(); } catch (e) {}
  });
}

async function reloadConfig() {
  await loadConfig();
}

module.exports = { startModbusReader, stopModbusReader, reloadConfig };