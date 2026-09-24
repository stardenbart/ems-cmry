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

// Perubahan mapping diterapkan di batas siklus, bukan di tengah pembacaan.
// Menukar peta register saat siklus berjalan adalah cara termudah membuat frame
// Modbus tergeser — mekanisme yang sama dengan bug x65536 pada 23-24 Sep 2026.
let reloadPending = false;

// Satu bus RS485 hanya boleh dipakai satu pembacaan pada satu waktu. Antrean per
// gateway menjaga itu, sekaligus membuat gateway yang berbeda bisa jalan paralel.
const gatewayQueue = {};

function withGateway(gatewayId, fn) {
  const key = String(gatewayId); // wajib dinormalkan: number dan string harus satu antrean
  const prev = gatewayQueue[key] || Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  gatewayQueue[key] = next.then(() => {}, () => {});
  return next;
}

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
  let failed = 0;

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
      } else if (dataType === 'int64-be') {
        const buf = Buffer.alloc(8);
        buf.writeUInt16BE(response.data[0], 0);
        buf.writeUInt16BE(response.data[1], 2);
        buf.writeUInt16BE(response.data[2], 4);
        buf.writeUInt16BE(response.data[3], 6);
        result[param.name] = Number(buf.readBigInt64BE(0));
      } else {
        result[param.name] = readFloat32BE(response.data);
      }
    } catch (err) {
      result[param.name] = null;
      failed++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return { data: result, failed };
}

// Baca satu device dan sebarkan hasilnya. Mengembalikan data kalau berhasil,
// null kalau gateway tidak bisa dibuka atau ada register yang gagal dibaca.
async function pollDevice(device) {
  const gateway = gateways[device.data_gateway_id];
  if (!gateway) return null;

  const client = await connectGateway(gateway);
  if (!client) return null;

  try {
    const read = await readDevice(client, device);
    if (!read) return null;
    const { data, failed } = read;

    // Timeout meninggalkan balasan telat di buffer connectRTUBuffered; permintaan
    // berikutnya memakan balasan itu sehingga seluruh register tergeser satu posisi
    // (energy sempat terbaca x65536 selama 21 jam, 23-24 Sep 2026). Reset koneksi
    // supaya stream tersinkron ulang, dan jangan sebarkan data yang mungkin bergeser.
    if (failed > 0) {
      console.error(`[Modbus] ${device.name}: ${failed} register gagal dibaca - reconnect ${gateway.name}`);
      try { client.close(); } catch (e) {}
      delete clients[gateway.id];
      return null;
    }

    broadcastData(device.id, {
      ...data,
      deviceName: device.name,
      deviceId: device.id,
    });
    checkAlarms(device.id, data);
    return data;
  } catch (err) {
    console.error(`[Modbus] Error reading ${device.name}: ${err.message}`);
    if (clients[gateway.id]) {
      try { clients[gateway.id].close(); } catch (e) {}
      delete clients[gateway.id];
    }
    return null;
  }
}

async function pollAllDevices() {
  if (!isRunning) return;

  // Terapkan perubahan konfigurasi di sini, sebelum siklus dimulai.
  if (reloadPending) {
    reloadPending = false;
    console.log('[Modbus] Menerapkan konfigurasi baru');
    await loadConfig();
  }

  // Sekuensial, sama persis dengan perilaku sebelumnya. Bedanya setiap pembacaan
  // lewat antrean gateway, sehingga readDeviceNow() dari UI tidak pernah menyelak
  // di tengah siklus dan menabrak bus yang sama.
  // ponytail: paralel antar gateway ditunda sampai ada gateway kedua untuk diuji.
  for (const device of devices) {
    await withGateway(device.data_gateway_id, () => pollDevice(device));
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
        'Voltage L-L Avg':       parseFloat((Math.random() * 5 + 397).toFixed(2)),
        'Active Power Total':   activePower,
        'Reactive Power Total': parseFloat((Math.random() * 50 + 200).toFixed(2)),
        'Apparent Power Total': parseFloat((Math.random() * 100 + 900).toFixed(2)),
        'Power Factor Total':   parseFloat((Math.random() * 0.05 + 0.62).toFixed(3)),
        'Frequency':            parseFloat((Math.random() * 0.1 + 50.0).toFixed(2)),
        // Energy Active naik monoton = realistis sebagai nilai odometer meter
        'Active Energy Delivered (Into Load)':        energyActive,
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

// Dipanggil route settings setiap konfigurasi berubah. Tidak memuat ulang saat itu
// juga — hanya menandai, supaya penerapannya jatuh di batas siklus berikutnya.
function requestReload() {
  reloadPending = true;
}

// Baca satu device SEKARANG, di luar jadwal siklus. Dipakai UI supaya hasil
// perubahan alamat register langsung terlihat tanpa menunggu siklus atau restart.
// Tetap lewat antrean gateway, jadi tidak pernah bertabrakan dengan poll berjalan.
async function readDeviceNow(deviceId) {
  if (reloadPending) {
    reloadPending = false;
    await loadConfig();
  }

  const device = devices.find((d) => String(d.id) === String(deviceId));
  if (!device) throw new Error(`Device ${deviceId} tidak ditemukan`);

  return withGateway(device.data_gateway_id, () => pollDevice(device));
}

// ── Register Explorer ───────────────────────────────────────────────────────
// Baca alamat sembarang lalu tampilkan hasil dekode untuk semua tipe data
// sekaligus, supaya user memilih yang masuk akal sebelum menyimpan mapping.
// Kalau fitur ini sudah ada 22 Sep 2026, kesalahan PF Total yang menunjuk alamat
// Frequency akan ketahuan dalam hitungan detik: nilainya 50,0218, persis Frequency.
function decodeAll(words) {
  const out = { raw: words };
  const buf = Buffer.alloc(8);
  words.slice(0, 4).forEach((w, i) => buf.writeUInt16BE(w, i * 2));

  if (words.length >= 1) {
    out.uint16 = words[0];
    out.int16 = words[0] > 32767 ? words[0] - 65536 : words[0];
  }
  if (words.length >= 2) {
    out.float32be = parseFloat(buf.readFloatBE(0).toFixed(6));
    const le = Buffer.alloc(4);
    le.writeUInt16BE(words[1], 0); le.writeUInt16BE(words[0], 2);
    out.float32le_wordswap = parseFloat(le.readFloatBE(0).toFixed(6));
    out.int32 = buf.readInt32BE(0);
  }
  if (words.length >= 4) {
    out['int64-be'] = Number(buf.readBigInt64BE(0));
  }
  return out;
}

async function probeRegister({ gatewayId, slaveId, address, length }) {
  const gateway = gateways[gatewayId];
  if (!gateway) throw new Error(`Gateway ${gatewayId} tidak ditemukan`);

  return withGateway(gatewayId, async () => {
    const client = await connectGateway(gateway);
    if (!client) throw new Error(`Gateway ${gateway.name} tidak bisa dibuka`);
    client.setID(slaveId);
    const res = await client.readHoldingRegisters(address, length);
    return { address, length, slaveId, gateway: gateway.name, decoded: decodeAll(res.data) };
  });
}

module.exports = {
  startModbusReader,
  stopModbusReader,
  reloadConfig,
  requestReload,
  readDeviceNow,
  probeRegister,
  decodeAll,
};