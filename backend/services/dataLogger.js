const cron = require('node-cron');
const { Reading, Device, DeviceType } = require('../models');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const { getLatestData } = require('../websocket/wsServer');
const { qualityMap, coherenceIssues } = require('./validation');
const spool = require('./spool');
const { markSave } = require('./watchdog');

// Configurable via .env: LOG_INTERVAL_MINUTES=15
const INTERVAL = parseInt(process.env.LOG_INTERVAL_MINUTES) || 15;

function buildCronExpression(minutes) {
  if (minutes <= 0 || minutes > 60) return '*/15 * * * *';
  return `*/${minutes} * * * *`;
}

function startDataLogger() {
  const cronExp = buildCronExpression(INTERVAL);

  cron.schedule(cronExp, async () => {
    try {
      const latestData = getLatestData();
      if (Object.keys(latestData).length === 0) return;

      const timestamp = new Date();
      const records = [];

      // Load devices and build maps
      const devices = await Device.findAll({
        include: [{ model: DeviceType, as: 'deviceType' }],
      });

      // Set of valid device IDs in the database (used to prevent FK violation)
      const validDeviceIds = new Set(devices.map((d) => d.id));

      const deviceTypeMap = {};
      devices.forEach((d) => {
        if (d.deviceType) {
          const params = typeof d.deviceType.params === 'string'
            ? JSON.parse(d.deviceType.params)
            : (d.deviceType.params || []);
          deviceTypeMap[d.id] = params;
        }
      });

      for (const [deviceIdStr, data] of Object.entries(latestData)) {
        const deviceId = parseInt(deviceIdStr);

        // ─── CRITICAL: skip if device_id not in DB (prevents FK violation) ───
        if (!validDeviceIds.has(deviceId)) {
          console.warn(`[DataLogger] Skipping unknown device_id=${deviceId} (not in devices table)`);
          continue;
        }

        const params = deviceTypeMap[deviceId] || [];
        const saveParams = params.filter((p) => p.save === true).map((p) => p.name);

        // Validasi rentang dan koherensi antar-parameter. Hasilnya disimpan
        // sebagai penanda quality, bukan dibuang, supaya datanya tetap ada
        // tapi agregasi bisa mengabaikannya.
        const quality = qualityMap(params, data);
        for (const issue of coherenceIssues(params, data)) {
          console.warn(`[DataLogger] device_id=${deviceId} koherensi ${issue.rule}: ${issue.detail}`);
        }

        for (const [parameter, value] of Object.entries(data)) {
          // Skip metadata fields sent alongside readings
          if (['deviceName', 'deviceId', '_timestamp'].includes(parameter)) continue;

          // Only save parameters that are flagged save=true in device type config
          if (saveParams.length > 0 && !saveParams.includes(parameter)) continue;

          // Skip null/undefined/NaN
          if (value === null || value === undefined || isNaN(value)) continue;

          const numVal = parseFloat(value);

          // Guard against negative energy accumulator values (sensor glitch)
          if (parameter.toLowerCase().includes('energy') && numVal < 0) {
            console.warn(`[DataLogger] Skipping negative energy value: ${parameter}=${numVal} for device_id=${deviceId}`);
            continue;
          }

          records.push({
            device_id: deviceId, timestamp, parameter, value: numVal,
            quality: quality[parameter] !== undefined ? quality[parameter] : 0,
          });
        }
      }

      // Lengkapi parameter_id supaya baris baru ikut punya identitas stabil.
      if (records.length > 0) {
        try {
          const names = [...new Set(records.map((r) => r.parameter))];
          await sequelize.query(
            'INSERT INTO parameters (name) SELECT unnest(ARRAY[:names]::varchar[]) ON CONFLICT (name) DO NOTHING',
            { replacements: { names } });
          const rows = await sequelize.query(
            'SELECT id, name FROM parameters WHERE name = ANY(ARRAY[:names]::varchar[])',
            { replacements: { names }, type: QueryTypes.SELECT });
          const idByName = {};
          rows.forEach((r) => { idByName[r.name] = r.id; });
          records.forEach((r) => { r.parameter_id = idByName[r.parameter] || null; });
        } catch (e) {
          // Tabel parameters belum ada (migrasi belum dijalankan). Biarkan null.
        }
      }

      if (records.length > 0) {
        try {
          // Coba kosongkan spool lebih dulu supaya urutan waktunya tetap wajar.
          const r = await spool.replay((rows) => Reading.bulkCreate(rows));
          if (r.restored > 0) console.log(`[DataLogger] ${r.restored} baris dari spool berhasil dipulihkan`);

          await Reading.bulkCreate(records);
          markSave();
          console.log(`[DataLogger] ✓ Saved ${records.length} readings at ${timestamp.toLocaleString('id-ID')}`);
        } catch (dbErr) {
          // Database tidak bisa ditulis. Simpan ke spool, jangan hilangkan datanya.
          const { dropped } = spool.append(records);
          console.error(`[DataLogger] Gagal tulis DB (${dbErr.message}) — ${records.length} baris masuk spool`);
          if (dropped > 0) {
            console.error(`[DataLogger] SPOOL PENUH: ${dropped} berkas terlama dibuang. Periksa database segera.`);
          }
        }
      } else {
        console.log(`[DataLogger] No valid readings to save at ${timestamp.toLocaleString('id-ID')}`);
      }
    } catch (err) {
      console.error('[DataLogger] Error:', err.message);
    }
  });

  console.log(`[DataLogger] Started — saving every ${INTERVAL} minute(s) (cron: ${cronExp})`);
}

module.exports = { startDataLogger };